import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { courseDetailSchema, lessonSchema, type CourseDetail } from '@text-to-learn/contracts';
import { createHarness } from './fixtures/harness.js';
import { evaluationCases, FixtureGenerationProvider } from './fixtures/generation.js';
import {
  CourseModel,
  JobModel,
  LessonModel,
  ModuleModel,
  ProgressModel,
  UserModel,
} from '../server/src/models.js';
import { GenerationWorker } from '../server/src/services/generation.js';
import { GenerationFailure } from '../server/src/providers/generation.js';

const provider = new FixtureGenerationProvider();
let harness: Awaited<ReturnType<typeof createHarness>>;
let tokenA: string, tokenB: string;
let worker: GenerationWorker;
beforeAll(async () => {
  harness = await createHarness(provider);
  tokenA = await harness.token();
  tokenB = await harness.token('auth0|learner-b');
});
afterAll(async () => {
  if (harness) await harness.close();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  provider.calls = [];
  worker = new GenerationWorker(provider, { retryDelayMs: 0 });
  await Promise.all([
    CourseModel.deleteMany({}),
    ModuleModel.deleteMany({}),
    LessonModel.deleteMany({}),
    ProgressModel.deleteMany({}),
    JobModel.deleteMany({}),
    UserModel.deleteMany({}),
  ]);
});
const api = (path: string, method: 'get' | 'post' | 'delete' = 'get', token = tokenA) =>
  request(harness.app)[method](path).auth(token, { type: 'bearer' });
async function submit(topic = 'Python for beginners', requestId = randomUUID(), token = tokenA) {
  const response = await api('/api/courses', 'post', token).send({ topic, requestId });
  expect(response.status).toBe(202);
  return courseDetailSchema.parse(response.body.course);
}
async function readCourse(id: string) {
  const response = await api(`/api/courses/${id}`);
  expect(response.status).toBe(200);
  return courseDetailSchema.parse(response.body.course);
}
async function ready(topic?: string) {
  const course = await submit(topic);
  expect(await worker.runOne()).toBe(true);
  return readCourse(course.id);
}
const lessonPath = (course: CourseDetail) =>
  `/api/courses/${course.id}/lessons/${course.modules[0]!.lessons[0]!.id}`;

describe('durable validated generation through the owned production API', () => {
  it.each(evaluationCases)(
    'saves a complete curriculum and rich lesson for $topic',
    async (fixture) => {
      const course = await ready(fixture.topic);
      expect(course.generationState).toBe('ready');
      expect(course.isSample).toBe(false);
      expect(course.modules.length).toBeGreaterThanOrEqual(3);
      expect(
        course.modules.every((module) => module.lessons.length >= 3 && module.lessons.length <= 5),
      ).toBe(true);
      for (const lesson of course.modules.flatMap((module) => module.lessons)) {
        expect(lesson.objectives.length).toBeGreaterThan(0);
        expect(lesson.resources.length).toBeGreaterThan(0);
        expect(lesson.generationState).toBe('not_started');
      }
      expect(await LessonModel.countDocuments({ content: null })).toBe(9);
      const started = await api(`${lessonPath(course)}/generate`, 'post').send({});
      expect(started.status).toBe(202);
      expect(await worker.runOne()).toBe(true);
      const result = await api(lessonPath(course));
      const lesson = lessonSchema.parse(result.body.lesson);
      expect(lesson.generationState).toBe('ready');
      expect(lesson.content).toEqual(fixture.lesson);
      expect(lesson.content?.quiz.length).toBeGreaterThanOrEqual(4);
      expect(lesson.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(lesson.resources[0]?.source).toBe('catalogue');
      expect(lesson.resources[1]).toMatchObject({ source: 'unverified_suggestion', url: null });
      const job = await JobModel.findOne({ targetKey: `lesson:${lesson.id}` }).lean();
      expect(job).toMatchObject({
        status: 'ready',
        model: 'fixture-text-v1',
        promptVersion: 1,
        attempts: 1,
      });
    },
  );
  it('collapses concurrent course submissions by owner/request UUID and rejects changed topics', async () => {
    const requestId = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        api('/api/courses', 'post').send({ topic: 'Python for beginners', requestId }),
      ),
    );
    expect(results.map((result) => result.status)).toEqual([202, 202, 202, 202]);
    expect(new Set(results.map((result) => result.body.course.id)).size).toBe(1);
    expect(await CourseModel.countDocuments()).toBe(1);
    expect(await JobModel.countDocuments()).toBe(1);
    expect((await UserModel.findById('auth0|learner-a'))?.savedCourseCount).toBe(1);
    expect(
      (await api('/api/courses', 'post').send({ topic: 'Different topic', requestId })).status,
    ).toBe(409);
    await worker.runOne();
    expect(provider.calls).toHaveLength(1);
    expect(
      (await api('/api/courses', 'post').send({ topic: 'Python for beginners', requestId })).body
        .course.generationState,
    ).toBe('ready');
    expect(await worker.runOne()).toBe(false);
  });
  it('bounds active generations, topic lengths and rejects client ownership', async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        api('/api/courses', 'post').send({
          topic: `Topic number ${index}`,
          requestId: randomUUID(),
        }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([202, 202, 202, 429]);
    expect(await JobModel.countDocuments({ status: 'queued' })).toBe(3);
    for (const body of [
      { topic: '  ', requestId: randomUUID() },
      { topic: 'x'.repeat(301), requestId: randomUUID() },
      { topic: 'Python', requestId: randomUUID(), ownerSub: 'intruder' },
      { topic: 'Python' },
    ])
      expect((await api('/api/courses', 'post').send(body)).status).toBe(400);
  });
  it('never publishes invalid outlines and bounds automatic/manual retries', async () => {
    vi.spyOn(provider, 'generate').mockResolvedValue({
      ...evaluationCases[0]!.outline,
      modules: [],
    });
    const course = await submit();
    await worker.runOne();
    expect((await readCourse(course.id)).generationState).toBe('generating');
    await worker.runOne();
    let failed = await readCourse(course.id);
    expect(failed.generationState).toBe('failed');
    expect(failed.modules).toHaveLength(0);
    expect(failed.generation).toMatchObject({
      attempts: 2,
      canRetry: true,
      error: { code: 'INVALID_OUTPUT' },
    });
    expect(await ModuleModel.countDocuments()).toBe(0);
    expect(await LessonModel.countDocuments()).toBe(0);
    expect((await api(`/api/courses/${course.id}/retry`, 'post').send({})).status).toBe(202);
    await worker.runOne();
    await worker.runOne();
    failed = await readCourse(course.id);
    expect(failed.generation).toMatchObject({ attempts: 4, canRetry: false });
    expect((await api(`/api/courses/${course.id}/retry`, 'post').send({})).status).toBe(409);
    expect(await worker.runOne()).toBe(false);
  });
  it('repairs an invalid answer once and rejects unknown catalogue resources', async () => {
    const generate = vi.spyOn(provider, 'generate');
    generate.mockResolvedValueOnce({
      ...evaluationCases[0]!.outline,
      modules: evaluationCases[0]!.outline.modules.map((module) => ({
        ...module,
        lessons: module.lessons.map((lesson) => ({
          ...lesson,
          resources: [{ catalogueId: 'invented-url', title: 'Fake verified resource' }],
        })),
      })),
    });
    const course = await submit();
    await worker.runOne();
    expect((await readCourse(course.id)).generationState).toBe('generating');
    await worker.runOne();
    expect((await readCourse(course.id)).generationState).toBe('ready');
    expect(generate.mock.calls[1]?.[0].repair).toBe(true);
  });
  it('shows provider rate-limit failure safely and recovers with explicit retry', async () => {
    const generate = vi
      .spyOn(provider, 'generate')
      .mockRejectedValue(
        new GenerationFailure(
          'PROVIDER_RATE_LIMITED',
          'The generation service is busy. Please retry shortly.',
        ),
      );
    const course = await submit();
    await worker.runOne();
    await worker.runOne();
    expect((await readCourse(course.id)).generation?.error?.code).toBe('PROVIDER_RATE_LIMITED');
    generate.mockRestore();
    await api(`/api/courses/${course.id}/retry`, 'post').send({});
    await worker.runOne();
    expect((await readCourse(course.id)).generationState).toBe('ready');
  });
  it('denies foreign course/lesson/job operations before enqueueing and scopes request IDs per owner', async () => {
    const requestId = randomUUID();
    const pending = await submit('Python for beginners', requestId);
    const other = await submit('Persuasive writing', requestId, tokenB);
    expect(other.id).not.toBe(pending.id);
    expect((await api(`/api/courses/${pending.id}/retry`, 'post', tokenB).send({})).status).toBe(
      404,
    );
    await worker.runOne();
    await worker.runOne();
    const course = await readCourse(pending.id);
    expect((await api(`${lessonPath(course)}/generate`, 'post', tokenB).send({})).status).toBe(404);
    expect((await api(lessonPath(course), 'get', tokenB)).status).toBe(404);
    expect(await JobModel.countDocuments({ kind: 'lesson' })).toBe(0);
  });
  it('deduplicates on-demand lesson requests and reopens stored content across reconnects without provider work', async () => {
    const course = await ready();
    const path = lessonPath(course);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => api(`${path}/generate`, 'post').send({})),
    );
    expect(results.every((result) => result.status === 202)).toBe(true);
    expect(await JobModel.countDocuments({ kind: 'lesson' })).toBe(1);
    await Promise.all([
      worker.runOne(),
      new GenerationWorker(provider, { retryDelayMs: 0 }).runOne(),
    ]);
    expect(provider.calls.filter((call) => call.kind === 'lesson')).toHaveLength(1);
    const before = (await api(path)).body.lesson;
    await mongoose.disconnect();
    await mongoose.connect(harness.uri);
    expect((await api(path)).body.lesson).toEqual(before);
    expect((await api(`${path}/generate`, 'post').send({ retry: true })).body.lesson).toEqual(
      before,
    );
    expect(await worker.runOne()).toBe(false);
    expect(provider.calls).toHaveLength(2);
  });
  it('keeps invalid rich content null and repairs through a controlled lesson retry', async () => {
    const course = await ready();
    const path = lessonPath(course);
    const invalid = structuredClone(evaluationCases[0]!.lesson);
    invalid.quiz[0]!.correctAnswerIndex = 99;
    const generate = vi.spyOn(provider, 'generate').mockResolvedValue(invalid);
    await api(`${path}/generate`, 'post').send({});
    await worker.runOne();
    await worker.runOne();
    expect((await api(path)).body.lesson).toMatchObject({
      generationState: 'failed',
      content: null,
      contentHash: null,
    });
    expect((await api(`${path}/generate`, 'post').send({})).body.lesson.generationState).toBe(
      'failed',
    );
    expect(await worker.runOne()).toBe(false);
    generate.mockRestore();
    await api(`${path}/generate`, 'post').send({ retry: true });
    await worker.runOne();
    expect((await api(path)).body.lesson.generationState).toBe('ready');
  });
  it('recovers expired leases after restart and exhausts crashed jobs without endless replay', async () => {
    const course = await submit();
    await JobModel.updateOne(
      { courseId: course.id },
      {
        $set: {
          status: 'running',
          attempts: 1,
          leaseToken: 'old-process',
          leaseUntil: new Date(0),
        },
      },
    );
    const restarted = new GenerationWorker(provider, { retryDelayMs: 0 });
    await restarted.runOne();
    expect((await readCourse(course.id)).generation).toMatchObject({ attempts: 2 });
    expect((await readCourse(course.id)).generationState).toBe('ready');
    const interrupted = await submit('World history');
    await JobModel.updateOne(
      { courseId: interrupted.id },
      { $set: { status: 'running', attempts: 2, leaseToken: 'dead', leaseUntil: new Date(0) } },
    );
    expect(await restarted.runOne()).toBe(false);
    expect((await readCourse(interrupted.id)).generation).toMatchObject({
      canRetry: true,
      error: { code: 'LEASE_EXPIRED' },
    });
  });
  it('fences late results from an expired worker after a replacement publishes', async () => {
    const course = await submit();
    let release!: (value: unknown) => void;
    const generate = vi.spyOn(provider, 'generate').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const old = new GenerationWorker(provider, { retryDelayMs: 0, timeoutMs: 2000, leaseMs: 3000 });
    const pending = old.runOne();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await JobModel.updateOne({ courseId: course.id }, { $set: { leaseUntil: new Date(0) } });
    await worker.runOne();
    release({ ...evaluationCases[0]!.outline, title: 'Stale result must never win' });
    await pending;
    expect((await readCourse(course.id)).title).toBe(evaluationCases[0]!.outline.title);
    expect(await ModuleModel.countDocuments()).toBe(3);
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it('deleting during generation prevents orphan publication and releases the library slot', async () => {
    const course = await submit();
    let release!: (value: unknown) => void;
    vi.spyOn(provider, 'generate').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = worker.runOne();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect((await api(`/api/courses/${course.id}`, 'delete')).status).toBe(204);
    release(evaluationCases[0]!.outline);
    await pending;
    expect(await JobModel.countDocuments()).toBe(0);
    expect(await ModuleModel.countDocuments()).toBe(0);
    expect(await LessonModel.countDocuments()).toBe(0);
    expect((await UserModel.findById('auth0|learner-a'))?.savedCourseCount).toBe(0);
  });
  it('rolls back partial publication and succeeds on its bounded retry', async () => {
    const course = await submit();
    const insert = vi
      .spyOn(LessonModel, 'insertMany')
      .mockRejectedValueOnce(new Error('Simulated database failure'));
    await worker.runOne();
    expect((await readCourse(course.id)).generationState).toBe('generating');
    expect(await ModuleModel.countDocuments()).toBe(0);
    expect(await LessonModel.countDocuments()).toBe(0);
    insert.mockRestore();
    await worker.runOne();
    expect((await readCourse(course.id)).generationState).toBe('ready');
  });
  it('enforces a deadline even when the upstream promise ignores cancellation', async () => {
    const course = await submit();
    vi.spyOn(provider, 'generate').mockImplementation(() => new Promise(() => {}));
    const bounded = new GenerationWorker(provider, {
      timeoutMs: 20,
      leaseMs: 1000,
      retryDelayMs: 0,
    });
    await bounded.runOne();
    await bounded.runOne();
    expect((await readCourse(course.id)).generation).toMatchObject({
      attempts: 2,
      error: { code: 'PROVIDER_TIMEOUT' },
    });
  });
});
