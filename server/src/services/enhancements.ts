import { createHash, randomUUID } from 'node:crypto';
import mongoose, { type ClientSession } from 'mongoose';
import {
  enhancementsSchema,
  transcriptDraftSchema,
  videoSchema,
  type EnhancementKind,
  type Lesson,
} from '@text-to-learn/contracts';
import { z } from 'zod';
import {
  AudioAssetModel,
  CourseModel,
  EnhancementModel,
  JobModel,
  LessonModel,
  type AudioAssetRecord,
  type EnhancementRecord,
  type JobRecord,
} from '../models.js';
import { ApiError } from '../errors.js';
import { getLesson, generationInfo } from './courses.js';
import { checkActiveLimit, transaction } from './generation.js';
import { GenerationFailure } from '../providers/generation.js';
import { normalizeAudio } from '../providers/audio.js';
import type { EnhancementProvider } from '../providers/enhancements.js';
import { cleanupAudio, type AudioStorage } from '../storage/audio.js';

const KINDS: EnhancementKind[] = ['videos', 'transcript', 'audio'];
export const ENHANCEMENT_PROMPT_VERSION = 1;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const sourceHash = (lesson: Lesson) =>
  hash({
    title: lesson.title,
    objectives: lesson.objectives,
    keyTopics: lesson.keyTopics,
    resources: lesson.resources,
    content: lesson.content,
    version: lesson.contentVersion,
  });
async function readyLesson(owner: string, courseId: string, lessonId: string) {
  const lesson = await getLesson(owner, courseId, lessonId);
  if (lesson.generationState !== 'ready')
    throw new ApiError(409, 'LESSON_NOT_READY', 'Open this lesson after its content is ready.');
  return lesson;
}
function cacheKey(
  provider: EnhancementProvider,
  lesson: Lesson,
  kind: EnhancementKind,
  transcriptHash: string | null = null,
) {
  return hash({
    lessonId: lesson.id,
    source: sourceHash(lesson),
    kind,
    model: provider.model(kind),
    language: kind === 'videos' ? 'source' : 'hi-en',
    voice: kind === 'audio' ? provider.voice : '',
    promptVersion: ENHANCEMENT_PROMPT_VERSION,
    transcriptHash: kind === 'audio' ? transcriptHash : null,
    day: kind === 'videos' ? Math.floor(Date.now() / 86_400_000) : null,
  });
}
async function records(
  provider: EnhancementProvider,
  lesson: Lesson,
  ownerSub: string,
  session?: ClientSession,
) {
  const find = (kind: EnhancementKind, transcriptHash: string | null = null) =>
    EnhancementModel.findOne({
      cacheKey: cacheKey(provider, lesson, kind, transcriptHash),
      ownerSub,
    })
      .session(session ?? null)
      .lean();
  const [videos, transcript] = session
    ? [await find('videos'), await find('transcript')]
    : await Promise.all([find('videos'), find('transcript')]);
  const audio =
    transcript?.generationState === 'ready' ? await find('audio', transcript.transcriptHash) : null;
  return { videos, transcript, audio };
}
export async function getEnhancements(
  provider: EnhancementProvider,
  ownerSub: string,
  courseId: string,
  lessonId: string,
) {
  const lesson = await readyLesson(ownerSub, courseId, lessonId);
  const current = await records(provider, lesson, ownerSub);
  const jobs = await JobModel.find({
    enhancementId: {
      $in: Object.values(current)
        .filter((record) => record !== null)
        .map((record) => record._id),
    },
    ownerSub,
  }).lean();
  const state = (kind: EnhancementKind) => {
    const record = current[kind],
      job = jobs.find((item) => item.enhancementId === record?._id);
    return {
      state: record?.generationState ?? 'not_started',
      available: provider.available(kind),
      ...(job ? { generation: generationInfo(job) } : {}),
    };
  };
  const asset = current.audio?.audioAssetId
    ? await AudioAssetModel.findOne({
        _id: current.audio.audioAssetId,
        status: 'ready',
        ownerSub,
        courseId,
        lessonId,
      }).lean()
    : null;
  return enhancementsSchema.parse({
    videos: {
      ...state('videos'),
      items: current.videos?.generationState === 'ready' ? current.videos.videos : [],
    },
    transcript: {
      ...state('transcript'),
      text: current.transcript?.generationState === 'ready' ? current.transcript.transcript : null,
    },
    audio: {
      ...state('audio'),
      asset: asset
        ? {
            id: asset._id,
            mimeType: asset.mimeType,
            bytes: asset.bytes,
            durationSeconds: asset.durationSeconds,
          }
        : null,
    },
  });
}
async function touchParent(ownerSub: string, courseId: string, session: ClientSession) {
  const changed = await CourseModel.updateOne(
    { _id: courseId, ownerSub, generationState: 'ready' },
    { $inc: { enhancementRevision: 1 } },
    { session },
  );
  if (!changed.modifiedCount)
    throw new ApiError(404, 'NOT_FOUND', 'This course could not be found.');
}
export async function requestEnhancement(
  provider: EnhancementProvider,
  ownerSub: string,
  courseId: string,
  lessonId: string,
  kind: EnhancementKind,
  retry = false,
) {
  // Parent access is checked before configuration or cache information is exposed.
  const lesson = await readyLesson(ownerSub, courseId, lessonId);
  await transaction(async (session) => {
    await touchParent(ownerSub, courseId, session);
    const storedLesson = await LessonModel.findOne({
      _id: lessonId,
      courseId,
      generationState: 'ready',
    })
      .session(session)
      .lean();
    if (
      !storedLesson ||
      storedLesson.contentVersion !== lesson.contentVersion ||
      storedLesson.contentHash !== lesson.contentHash ||
      sourceHash({ ...storedLesson, id: storedLesson._id } as Lesson) !== sourceHash(lesson)
    )
      throw new ApiError(409, 'LESSON_CHANGED', 'This lesson changed. Reopen it to continue.');
    const current = await records(provider, lesson, ownerSub, session);
    if (kind === 'audio' && current.transcript?.generationState !== 'ready')
      throw new ApiError(
        409,
        'TRANSCRIPT_REQUIRED',
        'Prepare the Hinglish explanation before generating audio.',
      );
    const existing = current[kind];
    if (existing) {
      if (!retry || existing.generationState !== 'failed') return;
      const job = await JobModel.findOne({ enhancementId: existing._id, ownerSub })
        .session(session)
        .lean();
      if (!job || job.attempts >= 4)
        throw new ApiError(409, 'RETRY_LIMIT', 'This enhancement has reached its retry limit.');
      if (!provider.available(kind))
        throw new ApiError(
          503,
          'PROVIDER_UNAVAILABLE',
          'This lesson enhancement is currently unavailable.',
        );
      await checkActiveLimit(ownerSub, session);
      await EnhancementModel.updateOne(
        { _id: existing._id },
        { $set: { generationState: 'generating' } },
        { session },
      );
      await JobModel.updateOne(
        { _id: job._id, status: 'failed' },
        {
          $set: {
            status: 'queued',
            runLimit: 4,
            nextAttemptAt: new Date(),
            leaseToken: null,
            leaseUntil: null,
            error: null,
          },
        },
        { session },
      );
      return;
    }
    if (!provider.available(kind))
      throw new ApiError(
        503,
        'PROVIDER_UNAVAILABLE',
        'This lesson enhancement is currently unavailable.',
      );
    await checkActiveLimit(ownerSub, session);
    const id = randomUUID();
    await EnhancementModel.create(
      [
        {
          _id: id,
          cacheKey: cacheKey(provider, lesson, kind, current.transcript?.transcriptHash),
          ownerSub,
          courseId,
          lessonId,
          kind,
          sourceHash: sourceHash(lesson),
          contentVersion: lesson.contentVersion,
          model: provider.model(kind),
          language: kind === 'videos' ? 'source' : 'hi-en',
          voice: kind === 'audio' ? provider.voice : '',
          generationState: 'generating',
          transcriptHash: kind === 'audio' ? current.transcript!.transcriptHash : null,
          expiresAt:
            kind === 'videos'
              ? new Date((Math.floor(Date.now() / 86_400_000) + 1) * 86_400_000)
              : null,
        },
      ],
      { session },
    );
    await JobModel.create(
      [
        {
          _id: randomUUID(),
          targetKey: `enhancement:${id}`,
          enhancementId: id,
          kind,
          courseId,
          lessonId,
          ownerSub,
          model: provider.model(kind),
          promptVersion: ENHANCEMENT_PROMPT_VERSION,
          status: 'queued',
          attempts: 0,
          runLimit: 2,
          leaseToken: null,
          leaseUntil: null,
          nextAttemptAt: new Date(),
          error: null,
        },
      ],
      { session },
    );
  });
  return getEnhancements(provider, ownerSub, courseId, lessonId);
}
export async function ownedAudio(
  ownerSub: string,
  courseId: string,
  lessonId: string,
  assetId: string,
) {
  const lesson = await readyLesson(ownerSub, courseId, lessonId);
  const asset = await AudioAssetModel.findOne({
    _id: assetId,
    ownerSub,
    courseId,
    lessonId,
    status: 'ready',
  }).lean();
  if (
    !asset ||
    !(await EnhancementModel.exists({
      _id: asset.enhancementId,
      ownerSub,
      courseId,
      lessonId,
      generationState: 'ready',
      audioAssetId: assetId,
      sourceHash: sourceHash(lesson),
    }))
  )
    throw new ApiError(404, 'NOT_FOUND', 'This audio could not be found.');
  return asset;
}

export class EnhancementWorker {
  private timer?: ReturnType<typeof setTimeout>;
  private active?: Promise<void>;
  private controller?: AbortController;
  private stopped = true;
  private timeoutMs: number;
  private leaseMs: number;
  private retryDelayMs: number;
  constructor(
    private provider: EnhancementProvider,
    private storage: AudioStorage,
    options: { timeoutMs?: number; leaseMs?: number; retryDelayMs?: number } = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 70_000;
    this.leaseMs = options.leaseMs ?? 90_000;
    this.retryDelayMs = options.retryDelayMs ?? 5000;
    if (this.leaseMs <= this.timeoutMs) throw new Error('Lease must exceed enhancement deadline');
  }
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    const tick = () => {
      this.active = this.runOne()
        .then(() => undefined)
        .catch(() => {
          console.error(
            JSON.stringify({ event: 'enhancement_worker_failed', code: 'PERSISTENCE_UNAVAILABLE' }),
          );
        })
        .finally(() => {
          this.active = undefined;
          if (!this.stopped) this.timer = setTimeout(tick, 1000);
        });
    };
    tick();
  }
  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.controller?.abort();
    await this.active;
  }
  private fence(job: JobRecord) {
    return { _id: job._id, status: 'running' as const, leaseToken: job.leaseToken };
  }
  private async fail(job: JobRecord, error: GenerationFailure, expired = false) {
    await transaction(async (session) => {
      const again = error.retryable && job.attempts < job.runLimit;
      const changed = await JobModel.updateOne(
        { ...this.fence(job), ...(expired ? { leaseUntil: { $lte: new Date() } } : {}) },
        {
          $set: {
            status: again ? 'queued' : 'failed',
            leaseToken: null,
            leaseUntil: null,
            error: { code: error.code, message: error.message },
            nextAttemptAt: new Date(Date.now() + this.retryDelayMs * job.attempts),
          },
        },
        { session },
      );
      if (changed.modifiedCount)
        await EnhancementModel.updateOne(
          { _id: job.enhancementId },
          { $set: { generationState: again ? 'generating' : 'failed' } },
          { session },
        );
    });
  }
  async recoverExpired() {
    const jobs = await JobModel.find({
      kind: { $in: KINDS },
      status: 'running',
      leaseUntil: { $lte: new Date() },
    })
      .limit(100)
      .lean();
    for (const job of jobs)
      await this.fail(
        job,
        new GenerationFailure(
          'LEASE_EXPIRED',
          'This enhancement was interrupted. Please retry if it does not resume.',
        ),
        true,
      );
  }
  private async checkFence(job: JobRecord, record: EnhancementRecord, session: ClientSession) {
    if (
      !(await JobModel.exists({ ...this.fence(job), leaseUntil: { $gt: new Date() } }).session(
        session,
      ))
    )
      throw new GenerationFailure('LEASE_LOST', 'This enhancement was interrupted.', false);
    await touchParent(job.ownerSub, job.courseId, session);
    const lesson = await LessonModel.findOne({
      _id: job.lessonId,
      courseId: job.courseId,
      generationState: 'ready',
    })
      .session(session)
      .lean();
    if (
      !lesson ||
      sourceHash({ ...lesson, id: lesson._id } as Lesson) !== record.sourceHash ||
      !(await EnhancementModel.exists({ _id: record._id, generationState: 'generating' }).session(
        session,
      ))
    )
      throw new GenerationFailure(
        'SOURCE_CHANGED',
        'The lesson changed. Reopen it to continue.',
        false,
      );
  }
  private async publish(
    job: JobRecord,
    record: EnhancementRecord,
    values: Partial<EnhancementRecord>,
    asset?: AudioAssetRecord,
  ) {
    await transaction(async (session) => {
      await this.checkFence(job, record, session);
      if (asset) {
        const result = await AudioAssetModel.updateOne(
          { _id: asset._id, status: 'uploading' },
          { $set: { status: 'ready' } },
          { session },
        );
        if (!result.modifiedCount)
          throw new GenerationFailure(
            'AUDIO_INTERRUPTED',
            'Audio storage was interrupted. Please retry.',
          );
      }
      await EnhancementModel.updateOne(
        { _id: record._id },
        { $set: { ...values, generationState: 'ready' } },
        { session },
      );
      await JobModel.updateOne(
        this.fence(job),
        { $set: { status: 'ready', leaseToken: null, leaseUntil: null, error: null } },
        { session },
      );
    });
  }
  async runOne() {
    await this.recoverExpired();
    await cleanupAudio(this.storage);
    // YouTube metadata is kept for less than 24 hours; expired records/jobs are removed together.
    await transaction(async (session) => {
      const expired = await EnhancementModel.find({
        kind: 'videos',
        expiresAt: { $lte: new Date() },
      })
        .limit(100)
        .session(session)
        .lean();
      if (expired.length) {
        const ids = expired.map((item) => item._id);
        await EnhancementModel.deleteMany({ _id: { $in: ids } }, { session });
        await JobModel.deleteMany({ enhancementId: { $in: ids } }, { session });
      }
    });
    const job = await JobModel.findOneAndUpdate(
      {
        kind: { $in: KINDS },
        status: 'queued',
        nextAttemptAt: { $lte: new Date() },
        $expr: { $lt: ['$attempts', '$runLimit'] },
      },
      {
        $inc: { attempts: 1 },
        $set: {
          status: 'running',
          leaseToken: randomUUID(),
          leaseUntil: new Date(Date.now() + this.leaseMs),
        },
      },
      { sort: { nextAttemptAt: 1, _id: 1 }, returnDocument: 'after' },
    ).lean();
    if (!job) return false;
    this.controller = new AbortController();
    const controller = this.controller;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let asset: AudioAssetRecord | undefined;
    try {
      await Promise.race([
        (async () => {
          if (job.promptVersion !== ENHANCEMENT_PROMPT_VERSION)
            throw new GenerationFailure(
              'PROMPT_VERSION_UNAVAILABLE',
              'This enhancement needs an updated request.',
              false,
            );
          const lesson = await readyLesson(job.ownerSub, job.courseId, job.lessonId!);
          const record = await EnhancementModel.findOne({
            _id: job.enhancementId,
            ownerSub: job.ownerSub,
          }).lean();
          if (!record || record.sourceHash !== sourceHash(lesson))
            throw new GenerationFailure(
              'SOURCE_CHANGED',
              'The lesson changed. Reopen it to continue.',
              false,
            );
          if (job.kind === 'videos') {
            const queries = lesson.content?.videoQueries ?? [
              `${lesson.title} ${lesson.keyTopics.join(' ')}`.slice(0, 240),
            ];
            const videos = z
              .array(videoSchema)
              .max(3)
              .parse(await this.provider.videos(queries, controller.signal));
            controller.signal.throwIfAborted();
            if (new Set(videos.map((video) => video.id)).size !== videos.length)
              throw new GenerationFailure(
                'INVALID_OUTPUT',
                'Video search returned duplicate results.',
              );
            await this.publish(job, record, { videos });
          } else if (job.kind === 'transcript') {
            const parsed = transcriptDraftSchema.safeParse(
              await this.provider.transcript(lesson, record.model, controller.signal),
            );
            controller.signal.throwIfAborted();
            if (!parsed.success)
              throw new GenerationFailure(
                'INVALID_OUTPUT',
                'The Hinglish explanation did not pass validation. Please retry.',
              );
            await this.publish(job, record, {
              transcript: parsed.data.text,
              transcriptHash: hash(parsed.data.text),
            });
          } else if (job.kind === 'audio') {
            const transcript = await EnhancementModel.findOne({
              ownerSub: job.ownerSub,
              courseId: job.courseId,
              lessonId: job.lessonId,
              kind: 'transcript',
              sourceHash: record.sourceHash,
              generationState: 'ready',
              transcriptHash: record.transcriptHash,
            }).lean();
            if (!transcript?.transcript)
              throw new GenerationFailure(
                'TRANSCRIPT_REQUIRED',
                'Prepare the explanation before generating audio.',
                false,
              );
            const audio = normalizeAudio(
              await this.provider.speech(
                transcript.transcript,
                record.model,
                record.voice,
                controller.signal,
              ),
            );
            controller.signal.throwIfAborted();
            const created = await transaction(async (session) => {
              await this.checkFence(job, record, session);
              const [document] = await AudioAssetModel.create(
                [
                  {
                    _id: randomUUID(),
                    fileId: new mongoose.mongo.ObjectId().toHexString(),
                    ownerSub: job.ownerSub,
                    courseId: job.courseId,
                    lessonId: job.lessonId,
                    enhancementId: record._id,
                    status: 'uploading',
                    bytes: audio.data.length,
                    durationSeconds: audio.durationSeconds,
                    mimeType: audio.mimeType,
                    cleanupAfter: new Date(Date.now() + 300_000),
                  },
                ],
                { session },
              );
              return document!.toObject();
            });
            asset = created;
            await this.storage.write(created, audio.data, controller.signal);
            controller.signal.throwIfAborted();
            await this.publish(job, record, { audioAssetId: created._id }, created);
          }
        })(),
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(() => {
            controller.abort();
            reject(
              new GenerationFailure(
                'PROVIDER_TIMEOUT',
                'This enhancement took too long. Please retry.',
              ),
            );
          }, this.timeoutMs);
        }),
      ]);
    } catch (error) {
      controller.abort();
      if (asset) {
        await AudioAssetModel.updateOne(
          { _id: asset._id, status: { $ne: 'ready' } },
          { $set: { status: 'deleting' } },
        );
        await cleanupAudio(this.storage);
      }
      await this.fail(
        job,
        error instanceof GenerationFailure
          ? error
          : new GenerationFailure(
              'ENHANCEMENT_FAILED',
              'This enhancement could not finish. Please retry.',
            ),
      );
    } finally {
      clearTimeout(deadline);
      controller.abort();
      this.controller = undefined;
    }
    return true;
  }
}
