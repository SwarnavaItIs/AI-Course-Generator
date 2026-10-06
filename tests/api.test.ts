import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { courseDetailSchema, lessonSchema, type CourseDetail } from '@text-to-learn/contracts';
import { createHarness } from './fixtures/harness.js';
import {
  CourseModel,
  LessonModel,
  ModuleModel,
  ProgressModel,
  UserModel,
} from '../server/src/models.js';

let harness: Awaited<ReturnType<typeof createHarness>>;
let tokenA: string, tokenB: string;
beforeAll(async () => {
  harness = await createHarness();
  tokenA = await harness.token();
  tokenB = await harness.token('auth0|learner-b');
});
afterAll(async () => {
  if (harness) await harness.close();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([
    CourseModel.deleteMany({}),
    LessonModel.deleteMany({}),
    ModuleModel.deleteMany({}),
    ProgressModel.deleteMany({}),
    UserModel.deleteMany({}),
  ]);
});
async function save(token = tokenA): Promise<CourseDetail> {
  const response = await request(harness.app)
    .post('/api/courses')
    .auth(token, { type: 'bearer' })
    .send({ templateId: 'web-foundations', title: 'My learning path' });
  expect(response.status).toBe(201);
  return courseDetailSchema.parse(response.body.course);
}
describe('production API with signed fixture JWTs and real isolated MongoDB', () => {
  it('reports health/readiness and serves the explicitly public sample', async () => {
    expect((await request(harness.app).get('/health')).body).toEqual({ status: 'ok' });
    expect((await request(harness.app).get('/ready')).status).toBe(200);
    const sample = await request(harness.app).get('/api/sample');
    expect(sample.body.course.isSample).toBe(true);
    const lessonId = sample.body.course.modules[0].lessons[0].id as string;
    expect((await request(harness.app).get(`/api/sample/lessons/${lessonId}`)).status).toBe(200);
  });
  it('reports unconfigured generation without saving a synthetic course', async () => {
    const response = await request(harness.app)
      .post('/api/courses')
      .auth(tokenA, { type: 'bearer' })
      .send({ topic: 'Python for beginners', requestId: crypto.randomUUID() });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('PROVIDER_UNAVAILABLE');
    expect(await CourseModel.countDocuments()).toBe(0);
  });
  it('rejects anonymous, malformed, expired, wrong-issuer, wrong-audience, and forged tokens', async () => {
    const tokens = [
      undefined,
      'invalid',
      await harness.token('auth0|learner-a', { expires: Math.floor(Date.now() / 1000) - 60 }),
      await harness.token('auth0|learner-a', { issuer: 'https://other.invalid/' }),
      await harness.token('auth0|learner-a', { audience: 'somewhere-else' }),
      `${tokenA.slice(0, -10)}aaaaaaaaaa`,
    ];
    for (const token of tokens) {
      const call = request(harness.app).get('/api/courses');
      if (token) call.auth(token, { type: 'bearer' });
      const response = await call;
      expect(response.status).toBe(401);
      expect(response.body.error.requestId).toBeTruthy();
      expect(response.headers['www-authenticate']).toBe('Bearer');
    }
    const unsupported = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'auth0|learner-a' })).toString('base64url')}.`;
    expect(
      (await request(harness.app).get('/api/courses').auth(unsupported, { type: 'bearer' })).status,
    ).toBe(401);
  });
  it('creates validated courses and persists lesson identity/content across reconnects', async () => {
    const course = await save();
    expect(course.title).toBe('My learning path');
    expect(course.modules).toHaveLength(3);
    expect(course.modules.flatMap((module) => module.lessons)).toHaveLength(9);
    const lessonId = course.modules[0]!.lessons[0]!.id;
    const lessonResponse = await request(harness.app)
      .get(`/api/courses/${course.id}/lessons/${lessonId}`)
      .auth(tokenA, { type: 'bearer' });
    const lesson = lessonSchema.parse(lessonResponse.body.lesson);
    expect(lesson.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(lesson.content?.quiz).toHaveLength(4);
    await mongoose.disconnect();
    expect((await request(harness.app).get('/ready')).status).toBe(503);
    expect(
      (await request(harness.app).get('/api/courses').auth(tokenA, { type: 'bearer' })).status,
    ).toBe(503);
    await mongoose.connect(harness.uri);
    const reopened = await request(harness.app)
      .get(`/api/courses/${course.id}`)
      .auth(tokenA, { type: 'bearer' });
    expect(reopened.body.course).toEqual(course);
    expect(
      (await request(harness.app).get('/api/courses').auth(tokenA, { type: 'bearer' })).body
        .courses,
    ).toHaveLength(1);
    expect(await UserModel.countDocuments()).toBe(1);
  });
  it('isolates lists and denies another user’s course, lesson, and deletion', async () => {
    const course = await save();
    const ownB = await save(tokenB);
    const lessonId = course.modules[0]!.lessons[0]!.id;
    const listB = await request(harness.app).get('/api/courses').auth(tokenB, { type: 'bearer' });
    expect(listB.body.courses.map((item: { id: string }) => item.id)).toEqual([ownB.id]);
    for (const path of [
      `/api/courses/${course.id}`,
      `/api/courses/${course.id}/lessons/${lessonId}`,
    ])
      expect((await request(harness.app).get(path).auth(tokenB, { type: 'bearer' })).status).toBe(
        404,
      );
    expect(
      (
        await request(harness.app)
          .delete(`/api/courses/${course.id}`)
          .auth(tokenB, { type: 'bearer' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(harness.app)
          .get(`/api/courses/${ownB.id}/lessons/${lessonId}`)
          .auth(tokenB, { type: 'bearer' })
      ).status,
    ).toBe(404);
    expect(await LessonModel.countDocuments({ courseId: course.id })).toBe(9);
  });
  it('rejects invalid input, ownership injection, malformed JSON, oversized requests, and unapproved origins', async () => {
    for (const body of [
      { templateId: 'unknown' },
      { templateId: 'web-foundations', title: ' ' },
      { templateId: 'web-foundations', ownerSub: 'auth0|learner-b' },
    ])
      expect(
        (
          await request(harness.app)
            .post('/api/courses')
            .auth(tokenA, { type: 'bearer' })
            .send(body)
        ).status,
      ).toBe(400);
    expect(
      (await request(harness.app).get('/api/courses/not-an-id').auth(tokenA, { type: 'bearer' }))
        .status,
    ).toBe(400);
    expect(
      (
        await request(harness.app)
          .post('/api/courses')
          .set('Content-Type', 'application/json')
          .send('{bad')
      ).status,
    ).toBe(400);
    expect(
      (
        await request(harness.app)
          .post('/api/courses')
          .send({ title: 'a'.repeat(20_000) })
      ).status,
    ).toBe(413);
    expect(
      (await request(harness.app).get('/api/courses').set('Origin', 'https://unknown.invalid'))
        .status,
    ).toBe(403);
    expect(
      (
        await request(harness.app)
          .options('/api/courses')
          .set('Origin', 'http://127.0.0.1:4173')
          .set('Access-Control-Request-Method', 'POST')
      ).headers['access-control-allow-origin'],
    ).toBe('http://127.0.0.1:4173');
  });
  it('deletes only the owned course and all of its children atomically', async () => {
    const course = await save();
    const other = await save(tokenB);
    expect(
      (
        await request(harness.app)
          .delete(`/api/courses/${course.id}`)
          .auth(tokenA, { type: 'bearer' })
      ).status,
    ).toBe(204);
    expect(await CourseModel.countDocuments({ _id: course.id })).toBe(0);
    expect(await ModuleModel.countDocuments({ courseId: course.id })).toBe(0);
    expect(await LessonModel.countDocuments({ courseId: course.id })).toBe(0);
    expect(await ProgressModel.countDocuments({ courseId: course.id })).toBe(0);
    expect(await LessonModel.countDocuments({ courseId: other.id })).toBe(9);
    expect((await UserModel.findById('auth0|learner-a'))?.savedCourseCount).toBe(0);
    expect(
      (
        await request(harness.app)
          .delete(`/api/courses/${course.id}`)
          .auth(tokenA, { type: 'bearer' })
      ).status,
    ).toBe(404);
  });
  it('rolls back failed creation so partial courses never become visible', async () => {
    const original = await save();
    vi.spyOn(LessonModel, 'insertMany').mockRejectedValueOnce(
      new Error('Injected storage failure'),
    );
    expect(
      (
        await request(harness.app)
          .post('/api/courses')
          .auth(tokenA, { type: 'bearer' })
          .send({ templateId: 'web-foundations' })
      ).status,
    ).toBe(500);
    expect(await CourseModel.countDocuments()).toBe(1);
    expect(await ModuleModel.countDocuments()).toBe(3);
    expect(await LessonModel.countDocuments()).toBe(9);
    expect(await ProgressModel.countDocuments()).toBe(1);
    expect((await UserModel.findById('auth0|learner-a'))?.savedCourseCount).toBe(1);
    expect(await CourseModel.exists({ _id: original.id })).toBeTruthy();
  });
  it('rolls back failed deletion without losing a saved course', async () => {
    const course = await save();
    vi.spyOn(ModuleModel, 'deleteMany').mockRejectedValueOnce(
      new Error('Injected cleanup failure'),
    );
    expect(
      (
        await request(harness.app)
          .delete(`/api/courses/${course.id}`)
          .auth(tokenA, { type: 'bearer' })
      ).status,
    ).toBe(500);
    expect(await CourseModel.exists({ _id: course.id })).toBeTruthy();
    expect(await LessonModel.countDocuments({ courseId: course.id })).toBe(9);
  });
  it('enforces the per-user course cap without inserting children', async () => {
    await UserModel.create({
      _id: 'auth0|learner-a',
      auth0Sub: 'auth0|learner-a',
      savedCourseCount: 100,
    });
    const response = await request(harness.app)
      .post('/api/courses')
      .auth(tokenA, { type: 'bearer' })
      .send({ templateId: 'web-foundations' });
    expect(response.status).toBe(409);
    expect(await CourseModel.countDocuments()).toBe(0);
    expect(await ModuleModel.countDocuments()).toBe(0);
  });
});
