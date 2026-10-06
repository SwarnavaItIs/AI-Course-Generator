import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { courseDetailSchema, enhancementsSchema } from '@text-to-learn/contracts';
import { createHarness } from './fixtures/harness.js';
import { FixtureEnhancementProvider, fixtureWav } from './fixtures/enhancements.js';
import {
  AudioAssetModel,
  CourseModel,
  EnhancementModel,
  JobModel,
  LessonModel,
  ModuleModel,
  ProgressModel,
  UserModel,
} from '../server/src/models.js';
import { EnhancementWorker } from '../server/src/services/enhancements.js';
import { cleanupAudio, GridFsAudioStorage } from '../server/src/storage/audio.js';
import { GenerationFailure } from '../server/src/providers/generation.js';
import { normalizeAudio } from '../server/src/providers/audio.js';

const provider = new FixtureEnhancementProvider(),
  storage = new GridFsAudioStorage();
let harness: Awaited<ReturnType<typeof createHarness>>,
  tokenA: string,
  tokenB: string,
  worker: EnhancementWorker;
beforeAll(async () => {
  harness = await createHarness(undefined, provider, storage);
  tokenA = await harness.token();
  tokenB = await harness.token('auth0|learner-b');
});
afterAll(async () => {
  if (harness) await harness.close();
});
beforeEach(async () => {
  await harness.resetRateLimit();
  vi.restoreAllMocks();
  provider.calls = [];
  provider.voice = 'Kore';
  provider.textModel = 'fixture-transcript-v1';
  provider.audioModel = 'fixture-speech-v1';
  worker = new EnhancementWorker(provider, storage, { retryDelayMs: 0 });
  await AudioAssetModel.deleteMany({});
  await EnhancementModel.deleteMany({});
  await JobModel.deleteMany({});
  await ProgressModel.deleteMany({});
  await LessonModel.deleteMany({});
  await ModuleModel.deleteMany({});
  await CourseModel.deleteMany({});
  await UserModel.deleteMany({});
  await mongoose.connection.db!.collection('lessonAudio.files').deleteMany({});
  await mongoose.connection.db!.collection('lessonAudio.chunks').deleteMany({});
});
const api = (path: string, method: 'get' | 'post' | 'delete' = 'get', token = tokenA) =>
  request(harness.app)[method](path).auth(token, { type: 'bearer' });
async function sample() {
  const response = await api('/api/courses', 'post').send({ templateId: 'web-foundations' });
  expect(response.status).toBe(201);
  const course = courseDetailSchema.parse(response.body.course);
  return { course, path: `/api/courses/${course.id}/lessons/${course.modules[0]!.lessons[0]!.id}` };
}
async function states(path: string) {
  const response = await api(`${path}/enhancements`);
  expect(response.status).toBe(200);
  return enhancementsSchema.parse(response.body.enhancements);
}
async function generate(path: string, kind: string) {
  expect((await api(`${path}/enhancements/${kind}`, 'post').send({})).status).toBe(202);
  expect(await worker.runOne()).toBe(true);
  return states(path);
}

describe('owned durable lesson enhancements and progress', () => {
  it('caches each enhancement, prevents duplicate jobs, and persists actual WAV in GridFS across reconnect', async () => {
    const { path } = await sample();
    expect((await states(path)).audio.state).toBe('not_started');
    expect((await api(`${path}/enhancements/audio`, 'post').send({})).status).toBe(409);
    const duplicates = await Promise.all(
      Array.from({ length: 4 }, () => api(`${path}/enhancements/videos`, 'post').send({})),
    );
    expect(duplicates.every((item) => item.status === 202)).toBe(true);
    expect(await JobModel.countDocuments({ kind: 'videos' })).toBe(1);
    await worker.runOne();
    expect((await states(path)).videos.items).toHaveLength(1);
    await generate(path, 'transcript');
    const ready = await generate(path, 'audio');
    const asset = ready.audio.asset!;
    expect(asset).toMatchObject({ mimeType: 'audio/wav', durationSeconds: 1, bytes: 48044 });
    await mongoose.disconnect();
    await mongoose.connect(harness.uri);
    expect((await states(path)).audio.asset).toEqual(asset);
    for (const kind of ['videos', 'transcript', 'audio'])
      expect((await api(`${path}/enhancements/${kind}`, 'post').send({ retry: true })).status).toBe(
        200,
      );
    expect(await worker.runOne()).toBe(false);
    expect(provider.calls).toHaveLength(3);
    const audio = await api(`${path}/audio/${asset.id}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(audio.status).toBe(200);
    expect(audio.headers['content-type']).toBe('audio/wav');
    expect(audio.body).toEqual(fixtureWav());
    expect((await api(`${path}/audio/${asset.id}`).set('Range', 'bytes=0-43')).status).toBe(206);
    expect((await api(`${path}/audio/${asset.id}`).set('Range', 'bytes=999999-')).status).toBe(416);
  });
  it('returns 404 for every other-owner child endpoint and enforces authentication on audio', async () => {
    const { path } = await sample();
    await generate(path, 'transcript');
    const ready = await generate(path, 'audio');
    for (const [suffix, method, body] of [
      ['/enhancements', 'get', undefined],
      ['/enhancements/videos', 'post', {}],
      ['/enhancements/transcript', 'post', {}],
      ['/enhancements/audio', 'post', {}],
      [`/audio/${ready.audio.asset!.id}`, 'get', undefined],
      ['/completion', 'post', { completed: true }],
    ] as const)
      expect((await api(path + suffix, method, tokenB).send(body)).status).toBe(404);
    expect((await request(harness.app).get(`${path}/audio/${ready.audio.asset!.id}`)).status).toBe(
      401,
    );
    expect((await api(`${path}/audio/${'00000000-0000-4000-8000-000000000000'}`)).status).toBe(404);
  });
  it('keeps invalid transcript output failed until a controlled retry and leaves the lesson/videos ready', async () => {
    const { path } = await sample();
    vi.spyOn(provider, 'transcript').mockResolvedValue({ text: 'too short' });
    await generate(path, 'videos');
    await generate(path, 'transcript');
    await worker.runOne();
    expect((await states(path)).transcript).toMatchObject({
      state: 'failed',
      text: null,
      generation: { attempts: 2, canRetry: true },
    });
    expect((await api(`${path}/enhancements/transcript`, 'post').send({})).status).toBe(200);
    expect(await worker.runOne()).toBe(false);
    expect(
      (await api(`${path}/enhancements/transcript`, 'post').send({ retry: true })).status,
    ).toBe(202);
    await worker.runOne();
    await worker.runOne();
    expect((await states(path)).transcript.generation?.canRetry).toBe(false);
    expect(
      (await api(`${path}/enhancements/transcript`, 'post').send({ retry: true })).status,
    ).toBe(409);
    expect((await api(path)).body.lesson.generationState).toBe('ready');
    expect((await states(path)).videos.state).toBe('ready');
  });
  it('isolates provider failure, saves zero-result searches, and shares the three-active-job bound', async () => {
    const { path, course } = await sample();
    vi.spyOn(provider, 'videos').mockResolvedValue([]);
    expect((await generate(path, 'videos')).videos).toMatchObject({ state: 'ready', items: [] });
    vi.spyOn(provider, 'transcript').mockRejectedValue(
      new GenerationFailure('PROVIDER_FAILED', 'Explanation service failed.'),
    );
    await generate(path, 'transcript');
    await worker.runOne();
    expect((await states(path)).transcript.state).toBe('failed');
    const lessons = course.modules[0]!.lessons;
    for (const lesson of lessons)
      expect(
        (
          await api(
            `/api/courses/${course.id}/lessons/${lesson.id}/enhancements/transcript`,
            'post',
          ).send({ retry: true })
        ).status,
      ).toBe(202);
    const fourth = course.modules[1]!.lessons[0]!;
    expect(
      (
        await api(
          `/api/courses/${course.id}/lessons/${fourth.id}/enhancements/videos`,
          'post',
        ).send({})
      ).status,
    ).toBe(429);
  });
  it.each(['bad MIME', 'truncated WAV', 'oversized WAV', 'overlong audio'])(
    'rejects %s without creating a ready audio asset',
    async (kind) => {
      const { path } = await sample();
      await generate(path, 'transcript');
      const wav = fixtureWav();
      const output =
        kind === 'bad MIME'
          ? { data: wav, mimeType: 'audio/mp3' }
          : kind === 'truncated WAV'
            ? { data: wav.subarray(0, 100), mimeType: 'audio/wav' }
            : kind === 'oversized WAV'
              ? { data: Buffer.alloc(12_000_001), mimeType: 'audio/wav' }
              : { data: Buffer.from(wav), mimeType: 'audio/wav' };
      if (kind === 'overlong audio') {
        output.data.writeUInt32LE(8000, 24);
        output.data.writeUInt32LE(16000, 28);
        const long = Buffer.alloc(8_000 * 2 * 241 + 44);
        output.data.copy(long, 0, 0, 44);
        long.writeUInt32LE(long.length - 8, 4);
        long.writeUInt32LE(long.length - 44, 40);
        output.data = long;
      }
      vi.spyOn(provider, 'speech').mockResolvedValue({ ...output, sampleRate: 24000 });
      await generate(path, 'audio');
      await worker.runOne();
      expect((await states(path)).audio).toMatchObject({ state: 'failed', asset: null });
      expect(await AudioAssetModel.countDocuments({ status: 'ready' })).toBe(0);
      expect(await mongoose.connection.db!.collection('lessonAudio.files').countDocuments()).toBe(
        0,
      );
    },
  );
  it('wraps declared raw PCM once, preserves WAV bytes, and refuses missing PCM format metadata', () => {
    const wav = fixtureWav();
    expect(normalizeAudio({ data: wav, mimeType: 'audio/wav' }).data).toEqual(wav);
    expect(
      normalizeAudio({ data: wav.subarray(44), mimeType: 'audio/l16', sampleRate: 24000 }).data,
    ).toEqual(wav);
    expect(() => normalizeAudio({ data: wav.subarray(44), mimeType: 'audio/l16' })).toThrow();
  });
  it('uses model, voice and lesson revision in cache identity', async () => {
    const { path } = await sample();
    await generate(path, 'transcript');
    await generate(path, 'audio');
    provider.voice = 'Puck';
    expect((await states(path)).audio.state).toBe('not_started');
    await generate(path, 'audio');
    expect(await AudioAssetModel.countDocuments({ status: 'ready' })).toBe(2);
    provider.textModel = 'fixture-transcript-v2';
    expect((await states(path)).transcript.state).toBe('not_started');
    await generate(path, 'transcript');
    await LessonModel.updateOne({ _id: path.split('/').at(-1) }, { $inc: { contentVersion: 1 } });
    expect((await states(path)).transcript.state).toBe('not_started');
    expect((await states(path)).audio.asset).toBeNull();
  });
  it('deletes GridFS assets after course deletion and recovers abandoned chunks across restart', async () => {
    const { path, course } = await sample();
    await generate(path, 'transcript');
    await generate(path, 'audio');
    expect((await api(`/api/courses/${course.id}`, 'delete')).status).toBe(204);
    await cleanupAudio(storage);
    expect(await EnhancementModel.countDocuments()).toBe(0);
    expect(await mongoose.connection.db!.collection('lessonAudio.chunks').countDocuments()).toBe(0);
    expect(await mongoose.connection.db!.collection('lessonAudio.files').countDocuments()).toBe(0);
    const orphan = new mongoose.mongo.ObjectId();
    await AudioAssetModel.create({
      _id: crypto.randomUUID(),
      fileId: orphan.toHexString(),
      status: 'uploading',
      cleanupAfter: new Date(0),
    });
    await mongoose.connection
      .db!.collection('lessonAudio.chunks')
      .insertOne({ files_id: orphan, n: 0, data: Buffer.from('abandoned') });
    await mongoose.disconnect();
    await mongoose.connect(harness.uri);
    await new EnhancementWorker(provider, storage).runOne();
    expect(await mongoose.connection.db!.collection('lessonAudio.chunks').countDocuments()).toBe(0);
    expect(await AudioAssetModel.countDocuments({ fileId: orphan.toHexString() })).toBe(0);
  });
  it('fences an upload when its course is deleted while storage is writing', async () => {
    const { path, course } = await sample();
    await generate(path, 'transcript');
    const original = storage.write.bind(storage);
    vi.spyOn(storage, 'write').mockImplementation(async (asset, data, signal) => {
      expect((await api(`/api/courses/${course.id}`, 'delete')).status).toBe(204);
      await original(asset, data, signal);
    });
    await api(`${path}/enhancements/audio`, 'post').send({});
    await worker.runOne();
    await cleanupAudio(storage);
    expect(await AudioAssetModel.countDocuments({ status: 'ready' })).toBe(0);
    expect(await EnhancementModel.countDocuments()).toBe(0);
    expect(await mongoose.connection.db!.collection('lessonAudio.chunks').countDocuments()).toBe(0);
  });
  it('cleans a failed upload, retries within the bound and preserves the ready transcript', async () => {
    const { path } = await sample();
    await generate(path, 'transcript');
    const original = storage.write.bind(storage);
    const failure = vi.spyOn(storage, 'write').mockImplementation(async (asset, data, signal) => {
      await original(asset, data, signal);
      throw new Error('Fixture storage failure');
    });
    await generate(path, 'audio');
    await worker.runOne();
    expect((await states(path)).audio.state).toBe('failed');
    expect((await states(path)).transcript.state).toBe('ready');
    expect(await mongoose.connection.db!.collection('lessonAudio.files').countDocuments()).toBe(0);
    failure.mockRestore();
    expect((await api(`${path}/enhancements/audio`, 'post').send({ retry: true })).status).toBe(
      202,
    );
    await worker.runOne();
    expect((await states(path)).audio.asset).not.toBeNull();
    expect(await mongoose.connection.db!.collection('lessonAudio.files').countDocuments()).toBe(1);
  });
  it('refreshes expired video metadata and removes its old job without affecting other enhancements', async () => {
    const { path } = await sample();
    await generate(path, 'videos');
    await generate(path, 'transcript');
    await EnhancementModel.updateOne({ kind: 'videos' }, { $set: { expiresAt: new Date(0) } });
    await worker.runOne();
    expect((await states(path)).videos.state).toBe('not_started');
    expect((await states(path)).transcript.state).toBe('ready');
    expect(await JobModel.countDocuments({ kind: 'videos' })).toBe(0);
    await generate(path, 'videos');
    expect(provider.calls.filter((call) => call.kind === 'videos')).toHaveLength(2);
  });
  it('retains failed cleanup for recovery while allowing other enhancement jobs to finish', async () => {
    const first = await sample();
    await generate(first.path, 'transcript');
    await generate(first.path, 'audio');
    await api(`/api/courses/${first.course.id}`, 'delete');
    const removal = vi
      .spyOn(storage, 'remove')
      .mockRejectedValue(new Error('Fixture storage outage'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const second = await sample();
    expect((await generate(second.path, 'videos')).videos.state).toBe('ready');
    expect(await AudioAssetModel.countDocuments({ status: 'deleting' })).toBeGreaterThan(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('audio_cleanup_failed'));
    removal.mockRestore();
    await cleanupAudio(storage);
    expect(await mongoose.connection.db!.collection('lessonAudio.files').countDocuments()).toBe(0);
  });
  it('keeps the production 120-request limit active despite resetting fixture test isolation', async () => {
    for (let index = 0; index < 120; index++)
      expect((await request(harness.app).get('/api/sample')).status).toBe(200);
    const response = await request(harness.app).get('/api/sample');
    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
  });
  it('recovers expired leases and bounds ignored provider cancellation', async () => {
    const { path } = await sample();
    await api(`${path}/enhancements/videos`, 'post').send({});
    await JobModel.updateOne(
      { kind: 'videos' },
      { $set: { status: 'running', attempts: 1, leaseToken: 'expired', leaseUntil: new Date(0) } },
    );
    await worker.runOne();
    expect((await states(path)).videos).toMatchObject({
      state: 'ready',
      generation: { attempts: 2 },
    });
    vi.spyOn(provider, 'transcript').mockImplementation(() => new Promise(() => {}));
    await api(`${path}/enhancements/transcript`, 'post').send({});
    const fast = new EnhancementWorker(provider, storage, {
      timeoutMs: 40,
      leaseMs: 100,
      retryDelayMs: 0,
    });
    await fast.runOne();
    await fast.runOne();
    expect((await states(path)).transcript).toMatchObject({
      state: 'failed',
      generation: { attempts: 2 },
    });
  });
  it('saves idempotent per-user completion, concurrent updates, undo and library progress', async () => {
    const { course, path } = await sample();
    const secondPath = `/api/courses/${course.id}/lessons/${course.modules[0]!.lessons[1]!.id}`;
    const results = await Promise.all([
      api(`${path}/completion`, 'post').send({ completed: true }),
      api(`${path}/completion`, 'post').send({ completed: true }),
      api(`${secondPath}/completion`, 'post').send({ completed: true }),
    ]);
    expect(results.every((result) => result.status === 200)).toBe(true);
    const progress = (await api(`/api/courses/${course.id}`)).body.course;
    expect(progress.completedLessonCount).toBe(2);
    expect(new Set(progress.completedLessonIds).size).toBe(2);
    expect((await api('/api/courses')).body.courses[0].completedLessonCount).toBe(2);
    expect(
      (await api(`${path}/completion`, 'post').send({ completed: false })).body.course
        .completedLessonCount,
    ).toBe(1);
    expect(
      (await api(`${path}/completion`, 'post').send({ completed: false })).body.course
        .completedLessonCount,
    ).toBe(1);
    expect((await api(`${path}/completion`, 'post', tokenB).send({ completed: true })).status).toBe(
      404,
    );
    await LessonModel.updateOne(
      { _id: course.modules[0]!.lessons[0]!.id },
      { $set: { generationState: 'failed', content: null } },
    );
    expect((await api(`${path}/completion`, 'post').send({ completed: true })).status).toBe(409);
  });
});
