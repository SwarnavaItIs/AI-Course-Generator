import { performance } from 'node:perf_hooks';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHarness, listen, closeServer } from './fixtures/harness.js';
import { FixtureGenerationProvider } from './fixtures/generation.js';
import { FixtureEnhancementProvider } from './fixtures/enhancements.js';
import { GenerationWorker } from '../server/src/services/generation.js';
import { EnhancementWorker } from '../server/src/services/enhancements.js';
import { GridFsAudioStorage } from '../server/src/storage/audio.js';
import {
  courseResponseSchema,
  lessonResponseSchema,
  enhancementsResponseSchema,
} from '@text-to-learn/contracts';

const provider = new FixtureGenerationProvider(150),
  enhancements = new FixtureEnhancementProvider(150),
  harness = await createHarness(provider, enhancements),
  server = createServer(harness.app),
  origin = await listen(server),
  token = await harness.token();
const generation = new GenerationWorker(provider),
  worker = new EnhancementWorker(enhancements, new GridFsAudioStorage());
generation.start();
worker.start();
const observations: Record<string, number[]> = {};
const api = async (path: string, body?: unknown) => {
  const response = await fetch(origin + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert(response.ok, `Measured request failed: ${response.status}`);
  return response.json() as Promise<unknown>;
};
const measure = async <T>(name: string, work: () => Promise<T>) => {
  const start = performance.now();
  const result = await work();
  (observations[name] ??= []).push(performance.now() - start);
  return result;
};
async function until(work: () => Promise<boolean>) {
  const end = Date.now() + 15_000;
  while (Date.now() < end) {
    if (await work()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Fixture measurement did not complete');
}
try {
  let path = '';
  for (let index = 0; index < 5; index++) {
    const course = courseResponseSchema.parse(
      await measure('topic_enqueue', () =>
        api('/api/courses', { topic: 'Python for beginners', requestId: crypto.randomUUID() }),
      ),
    ).course;
    await measure('outline_wall_time', () =>
      until(
        async () =>
          courseResponseSchema.parse(await api(`/api/courses/${course.id}`)).course
            .generationState === 'ready',
      ),
    );
    const current = courseResponseSchema.parse(await api(`/api/courses/${course.id}`)).course;
    path = `/api/courses/${course.id}/lessons/${current.modules[0]!.lessons[0]!.id}`;
    await api(`${path}/generate`, {});
    await measure('first_lesson_wall_time', () =>
      until(
        async () => lessonResponseSchema.parse(await api(path)).lesson.generationState === 'ready',
      ),
    );
    await harness.resetRateLimit();
  }
  const before = provider.calls.length;
  for (let index = 0; index < 20; index++) await measure('cached_lesson_get', () => api(path));
  assert.equal(provider.calls.length, before);
  for (const kind of ['videos', 'transcript', 'audio'] as const) {
    await api(`${path}/enhancements/${kind}`, {});
    await measure(`${kind}_wall_time`, () =>
      until(
        async () =>
          enhancementsResponseSchema.parse(await api(`${path}/enhancements`)).enhancements[kind]
            .state === 'ready',
      ),
    );
  }
  await harness.resetRateLimit();
  const enhancementCalls = enhancements.calls.length;
  for (let index = 0; index < 20; index++)
    await measure('cached_enhancements_get', () => api(`${path}/enhancements`));
  assert.equal(enhancements.calls.length, enhancementCalls);
  const summarize = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      samples: values.length,
      minMs: +sorted[0]!.toFixed(2),
      medianMs: +sorted[Math.floor(sorted.length / 2)]!.toFixed(2),
      p95Ms: +sorted[Math.ceil(sorted.length * 0.95) - 1]!.toFixed(2),
      maxMs: +sorted.at(-1)!.toFixed(2),
    };
  };
  const report = {
    checkedAt: new Date().toISOString(),
    environment:
      'localhost, isolated MongoDB/JWKS, HTTP API, actual one-second worker scan; authored providers delayed 150 ms. These are local observations, not live-provider performance or SLA.',
    status: 'PASS',
    metrics: Object.fromEntries(
      Object.entries(observations).map(([name, values]) => [name, summarize(values)]),
    ),
    cacheEvidence: {
      textProviderCalls: before,
      afterCachedLessonReads: provider.calls.length,
      enhancementProviderCalls: enhancementCalls,
      afterCachedEnhancementReads: enhancements.calls.length,
    },
    pollIntervalMs: 100,
  };
  await mkdir('docs/weeks/week-4', { recursive: true });
  await writeFile('docs/weeks/week-4/latency.json', `${JSON.stringify(report, null, 2)}\n`);
  console.info(JSON.stringify(report, null, 2));
} finally {
  await generation.stop();
  await worker.stop();
  await closeServer(server);
  await harness.close();
}
