import { createHash, randomUUID } from 'node:crypto';
import mongoose, { type ClientSession } from 'mongoose';
import {
  courseDetailSchema,
  generatedLessonContentSchema,
  outlineDraftSchema,
  type GeneratedLessonContent,
  type OutlineDraft,
  type CreateCourse,
} from '@text-to-learn/contracts';
import {
  CourseModel,
  JobModel,
  LessonModel,
  ModuleModel,
  ProgressModel,
  UserModel,
  type JobRecord,
} from '../models.js';
import { ApiError } from '../errors.js';
import { getCourse, getLesson, requireOwnedCourse } from './courses.js';
import {
  GenerationFailure,
  PROMPT_VERSION,
  RESOURCE_CATALOGUE,
  resolveResources,
  type GenerationProvider,
} from '../providers/generation.js';

const MAX_ATTEMPTS = 4;
export async function transaction<T>(work: (session: ClientSession) => Promise<T>) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}
function ensureProvider(provider: GenerationProvider) {
  if (!provider.available)
    throw new ApiError(
      503,
      'PROVIDER_UNAVAILABLE',
      'Course generation is currently unavailable. Please try again later.',
    );
}
export async function checkActiveLimit(ownerSub: string, session: ClientSession) {
  // Serialize submissions per owner so concurrent requests cannot bypass this bound.
  await UserModel.updateOne(
    { _id: ownerSub },
    { $inc: { generationRevision: 1 }, $setOnInsert: { auth0Sub: ownerSub, savedCourseCount: 0 } },
    { session, upsert: true },
  );
  if (
    (await JobModel.countDocuments({ ownerSub, status: { $in: ['queued', 'running'] } }).session(
      session,
    )) >= 3
  )
    throw new ApiError(
      429,
      'GENERATION_LIMIT',
      'You already have three generations in progress. Wait for one to finish.',
    );
}
function newJob(
  provider: GenerationProvider,
  ownerSub: string,
  courseId: string,
  lessonId?: string,
): Omit<JobRecord, 'createdAt' | 'updatedAt'> {
  return {
    _id: randomUUID(),
    targetKey: lessonId ? `lesson:${lessonId}` : `course:${courseId}`,
    kind: lessonId ? 'lesson' : 'course',
    courseId,
    ...(lessonId ? { lessonId } : {}),
    ownerSub,
    model: provider.model,
    promptVersion: PROMPT_VERSION,
    status: 'queued',
    attempts: 0,
    runLimit: 2,
    nextAttemptAt: new Date(),
    leaseToken: null,
    leaseUntil: null,
    error: null,
  };
}
export async function submitTopic(
  provider: GenerationProvider,
  ownerSub: string,
  input: Extract<CreateCourse, { topic: string }>,
) {
  const courseId = await transaction(async (session) => {
    const previous = await CourseModel.findOne({ ownerSub, requestId: input.requestId })
      .session(session)
      .lean();
    if (previous) {
      if (previous.topic !== input.topic)
        throw new ApiError(
          409,
          'REQUEST_CONFLICT',
          'This request was already used for a different topic.',
        );
      return previous._id;
    }
    ensureProvider(provider);
    await checkActiveLimit(ownerSub, session);
    const user = await UserModel.findOneAndUpdate(
      { _id: ownerSub, savedCourseCount: { $lt: 100 } },
      { $inc: { savedCourseCount: 1 } },
      { session, returnDocument: 'after' },
    );
    if (!user)
      throw new ApiError(
        409,
        'COURSE_LIMIT',
        'Your library is full. Delete a course before adding another.',
      );
    const id = randomUUID();
    await CourseModel.create(
      [
        {
          _id: id,
          ownerSub,
          topic: input.topic,
          requestId: input.requestId,
          title: input.topic.slice(0, 120),
          description: 'Your course outline is being prepared.',
          tags: [],
          isSample: false,
          generationState: 'generating',
          moduleCount: 0,
          lessonCount: 0,
          generationModel: provider.model,
          promptVersion: PROMPT_VERSION,
        },
      ],
      { session },
    );
    await ProgressModel.create(
      [{ _id: randomUUID(), courseId: id, ownerSub, completedLessonIds: [] }],
      { session },
    );
    await JobModel.create([newJob(provider, ownerSub, id)], { session });
    return id;
  });
  return getCourse(ownerSub, courseId);
}
async function retryJob(provider: GenerationProvider, job: JobRecord, session: ClientSession) {
  ensureProvider(provider);
  if (job.attempts >= MAX_ATTEMPTS)
    throw new ApiError(
      409,
      'RETRY_LIMIT',
      'The retry limit has been reached. Create a new course to try again.',
    );
  await checkActiveLimit(job.ownerSub, session);
  await JobModel.updateOne(
    { _id: job._id, status: 'failed' },
    {
      $set: {
        status: 'queued',
        runLimit: MAX_ATTEMPTS,
        nextAttemptAt: new Date(),
        error: null,
        leaseToken: null,
        leaseUntil: null,
      },
    },
    { session },
  );
  if (job.kind === 'course')
    await CourseModel.updateOne(
      { _id: job.courseId, ownerSub: job.ownerSub },
      { $set: { generationState: 'generating' } },
      { session },
    );
  else
    await LessonModel.updateOne(
      { _id: job.lessonId, courseId: job.courseId },
      { $set: { generationState: 'generating' } },
      { session },
    );
}
export async function retryCourse(
  provider: GenerationProvider,
  ownerSub: string,
  courseId: string,
) {
  await transaction(async (session) => {
    const course = await CourseModel.findOne({ _id: courseId, ownerSub }).session(session).lean();
    if (!course) throw new ApiError(404, 'NOT_FOUND', 'This course could not be found.');
    const job = await JobModel.findOne({ targetKey: `course:${courseId}`, ownerSub })
      .session(session)
      .lean();
    if (job?.status === 'failed') await retryJob(provider, job, session);
  });
  return getCourse(ownerSub, courseId);
}
export async function requestLesson(
  provider: GenerationProvider,
  ownerSub: string,
  courseId: string,
  lessonId: string,
  retry = false,
) {
  await transaction(async (session) => {
    const course = await CourseModel.findOne({ _id: courseId, ownerSub }).session(session).lean();
    if (!course) throw new ApiError(404, 'NOT_FOUND', 'This course could not be found.');
    const lesson = await LessonModel.findOne({ _id: lessonId, courseId }).session(session).lean();
    if (
      !lesson ||
      course.generationState !== 'ready' ||
      !(await ModuleModel.exists({ _id: lesson.moduleId, courseId }).session(session))
    )
      throw new ApiError(404, 'NOT_FOUND', 'This lesson could not be found.');
    if (lesson.generationState === 'ready') return;
    const job = await JobModel.findOne({ targetKey: `lesson:${lessonId}`, ownerSub })
      .session(session)
      .lean();
    if (job) {
      if (retry && job.status === 'failed') await retryJob(provider, job, session);
      return;
    }
    ensureProvider(provider);
    await checkActiveLimit(ownerSub, session);
    await LessonModel.updateOne(
      { _id: lessonId, courseId },
      {
        $set: {
          generationState: 'generating',
          generationModel: provider.model,
          promptVersion: PROMPT_VERSION,
        },
      },
      { session },
    );
    await JobModel.create([newJob(provider, ownerSub, courseId, lessonId)], { session });
  });
  return getLesson(ownerSub, courseId, lessonId);
}

// One bounded task at a time per process; independent replicas share the atomic MongoDB lease.
export class GenerationWorker {
  private timer?: ReturnType<typeof setTimeout>;
  private active?: Promise<void>;
  private controller?: AbortController;
  private stopped = true;
  private readonly timeoutMs: number;
  private readonly leaseMs: number;
  private readonly retryDelayMs: number;
  constructor(
    private provider: GenerationProvider,
    options: { timeoutMs?: number; leaseMs?: number; retryDelayMs?: number } = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 45_000;
    this.leaseMs = options.leaseMs ?? 60_000;
    if (this.leaseMs <= this.timeoutMs) throw new Error('Lease must exceed the provider deadline');
    this.retryDelayMs = options.retryDelayMs ?? 5_000;
  }
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    const tick = () => {
      this.active = this.runOne()
        .then(() => undefined)
        .catch(() => {
          console.error(
            JSON.stringify({ event: 'generation_worker_failed', code: 'PERSISTENCE_UNAVAILABLE' }),
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
      const filter = {
        ...this.fence(job),
        ...(expired ? { leaseUntil: { $lte: new Date() } } : {}),
      };
      const again = error.retryable && job.attempts < job.runLimit;
      const changed = await JobModel.updateOne(
        filter,
        {
          $set: {
            status: again ? 'queued' : 'failed',
            error: { code: error.code, message: error.message },
            leaseToken: null,
            leaseUntil: null,
            nextAttemptAt: new Date(Date.now() + this.retryDelayMs * job.attempts),
          },
        },
        { session },
      );
      if (!changed.modifiedCount) return;
      if (
        !(await CourseModel.exists({ _id: job.courseId, ownerSub: job.ownerSub }).session(session))
      ) {
        await JobModel.deleteOne({ _id: job._id }, { session });
        return;
      }
      if (job.kind === 'course')
        await CourseModel.updateOne(
          { _id: job.courseId, ownerSub: job.ownerSub, generationState: 'generating' },
          { $set: { generationState: again ? 'generating' : 'failed' } },
          { session },
        );
      else
        await LessonModel.updateOne(
          { _id: job.lessonId, courseId: job.courseId, generationState: 'generating' },
          {
            $set: {
              generationState: again ? 'generating' : 'failed',
              content: null,
              contentHash: null,
            },
          },
          { session },
        );
    });
  }
  async recoverExpired() {
    const jobs = await JobModel.find({
      kind: { $in: ['course', 'lesson'] },
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
          'Generation was interrupted. Please retry if it does not resume.',
        ),
        true,
      );
  }
  async runOne(): Promise<boolean> {
    await this.recoverExpired();
    const job = await JobModel.findOneAndUpdate(
      {
        kind: { $in: ['course', 'lesson'] },
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
    if (job.kind !== 'course' && job.kind !== 'lesson') return false;
    this.controller = new AbortController();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      if (job.promptVersion !== PROMPT_VERSION)
        throw new GenerationFailure(
          'PROMPT_VERSION_UNAVAILABLE',
          'This generation needs a new course request.',
          false,
        );
      const course = await requireOwnedCourse(job.ownerSub, job.courseId);
      const context =
        job.kind === 'course'
          ? { topic: course.topic, catalogue: RESOURCE_CATALOGUE }
          : {
              curriculum: await getCourse(job.ownerSub, job.courseId),
              selectedLesson: await getLesson(job.ownerSub, job.courseId, job.lessonId!),
            };
      const raw = await Promise.race([
        this.provider.generate({
          kind: job.kind,
          model: job.model,
          context,
          repair: job.attempts > 1,
          signal: this.controller.signal,
        }),
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(() => {
            this.controller?.abort();
            reject(
              new GenerationFailure('PROVIDER_TIMEOUT', 'Generation took too long. Please retry.'),
            );
          }, this.timeoutMs);
        }),
      ]);
      if (job.kind === 'course') {
        const parsed = outlineDraftSchema.safeParse(raw);
        if (!parsed.success)
          throw new GenerationFailure(
            'INVALID_OUTPUT',
            'The generated curriculum did not pass validation. Please retry.',
          );
        await this.publishCourse(job, parsed.data);
      } else {
        const parsed = generatedLessonContentSchema.safeParse(raw);
        if (!parsed.success)
          throw new GenerationFailure(
            'INVALID_OUTPUT',
            'The generated lesson did not pass validation. Please retry.',
          );
        await this.publishLesson(job, parsed.data);
      }
    } catch (error) {
      await this.fail(
        job,
        error instanceof GenerationFailure
          ? error
          : new GenerationFailure(
              'GENERATION_FAILED',
              'Generation could not finish. Please retry.',
            ),
      );
    } finally {
      clearTimeout(deadline);
      this.controller.abort();
      this.controller = undefined;
    }
    return true;
  }
  private async markReady(job: JobRecord, session: ClientSession) {
    return (
      (
        await JobModel.updateOne(
          { ...this.fence(job), leaseUntil: { $gt: new Date() } },
          { $set: { status: 'ready', leaseToken: null, leaseUntil: null, error: null } },
          { session },
        )
      ).modifiedCount === 1
    );
  }
  private async publishCourse(job: JobRecord, draft: OutlineDraft) {
    const modules = draft.modules.map((module, position) => ({
      id: randomUUID(),
      courseId: job.courseId,
      position,
      title: module.title,
      description: module.description,
      lessons: module.lessons.map((lesson, lessonPosition) => ({
        ...lesson,
        id: randomUUID(),
        courseId: job.courseId,
        moduleId: '',
        position: lessonPosition,
        resources: resolveResources(lesson.resources),
        generationState: 'not_started' as const,
      })),
    }));
    for (const module of modules) for (const lesson of module.lessons) lesson.moduleId = module.id;
    const lessonCount = modules.reduce((total, module) => total + module.lessons.length, 0);
    courseDetailSchema.parse({
      id: job.courseId,
      title: draft.title,
      description: draft.description,
      tags: draft.tags,
      isSample: false,
      generationState: 'ready',
      moduleCount: modules.length,
      lessonCount,
      completedLessonCount: 0,
      completedLessonIds: [],
      modules,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await transaction(async (session) => {
      if (
        !(await CourseModel.exists({
          _id: job.courseId,
          ownerSub: job.ownerSub,
          generationState: 'generating',
        }).session(session))
      )
        return;
      if (!(await this.markReady(job, session))) return;
      await ModuleModel.insertMany(
        modules.map(({ id, lessons: _lessons, ...fields }) => ({ _id: id, ...fields })),
        { session },
      );
      await LessonModel.insertMany(
        modules.flatMap((module) =>
          module.lessons.map(({ id, ...fields }) => ({
            _id: id,
            ...fields,
            content: null,
            contentVersion: 1,
            contentHash: null,
          })),
        ),
        { session },
      );
      await CourseModel.updateOne(
        { _id: job.courseId, ownerSub: job.ownerSub },
        {
          $set: {
            title: draft.title,
            description: draft.description,
            tags: draft.tags,
            moduleCount: modules.length,
            lessonCount,
            generationState: 'ready',
          },
        },
        { session },
      );
    });
  }
  private async publishLesson(job: JobRecord, content: GeneratedLessonContent) {
    await transaction(async (session) => {
      if (
        !(await CourseModel.exists({
          _id: job.courseId,
          ownerSub: job.ownerSub,
          generationState: 'ready',
        }).session(session))
      )
        return;
      const lesson = await LessonModel.findOne({
        _id: job.lessonId,
        courseId: job.courseId,
        generationState: 'generating',
      })
        .session(session)
        .lean();
      if (
        !lesson ||
        !(await ModuleModel.exists({ _id: lesson.moduleId, courseId: job.courseId }).session(
          session,
        )) ||
        !(await this.markReady(job, session))
      )
        return;
      await LessonModel.updateOne(
        { _id: lesson._id, courseId: job.courseId },
        {
          $set: {
            content,
            contentHash: createHash('sha256')
              .update(
                JSON.stringify({
                  content,
                  model: job.model,
                  promptVersion: job.promptVersion,
                  contentVersion: lesson.contentVersion,
                }),
              )
              .digest('hex'),
            generationState: 'ready',
          },
        },
        { session, runValidators: true },
      );
    });
  }
}
