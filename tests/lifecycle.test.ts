import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createHarness, closeServer, listen } from './fixtures/harness.js';
import { CourseModel } from '../server/src/models.js';

let harness: Awaited<ReturnType<typeof createHarness>>;
beforeAll(async () => {
  harness = await createHarness();
});
afterAll(async () => {
  if (harness) await harness.close();
});
async function freePort() {
  const server = createServer();
  const origin = await listen(server);
  await closeServer(server);
  return Number(new URL(origin).port);
}
function launch(port: number, uri: string) {
  const child = spawn(process.execPath, ['dist/index.js'], {
    cwd: resolve('server'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      CLIENT_ORIGINS: 'https://client.invalid',
      MONGODB_URI: uri,
      AUTH0_DOMAIN: 'fixture-issuer.invalid',
      AUTH0_AUDIENCE: 'https://test-api.invalid',
      GEMINI_API_KEY: '',
      GEMINI_TEXT_MODEL: '',
      GEMINI_TTS_MODEL: '',
      YOUTUBE_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '',
    errors = '';
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    errors += String(chunk);
  });
  const exited = new Promise<number | null>((resolvePromise, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolvePromise(code));
  });
  return { child, exited, output: () => output, errors: () => errors };
}
async function ready(port: number) {
  const until = Date.now() + 15_000;
  while (Date.now() < until) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/ready`, { signal: AbortSignal.timeout(500) })).ok)
        return;
    } catch {
      /* Await the actual process listener. */
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Production entrypoint did not become ready');
}
async function stopped(process: ReturnType<typeof launch>) {
  process.child.kill('SIGTERM');
  await process.exited;
}
it('exits safely after a connected standalone database fails the transaction-capability check', async () => {
  const mongo = await MongoMemoryServer.create({
    binary: { version: '8.0.16', downloadDir: resolve('.cache/mongodb') },
  });
  const process = launch(await freePort(), mongo.getUri());
  try {
    expect(
      await Promise.race([
        process.exited,
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 12_000)),
      ]),
    ).toBe(1);
    expect(process.errors()).toContain('Server startup failed.');
    expect(process.errors()).not.toContain(mongo.getUri());
    expect(process.output()).not.toContain('server_started');
  } finally {
    if (process.child.exitCode === null) await stopped(process);
    await mongo.stop();
  }
});
it('fails an occupied-port bind without starting workers or logging false readiness', async () => {
  const occupied = createServer(),
    process = await (async () => {
      await new Promise<void>((resolve) => occupied.listen(0, resolve));
      const address = occupied.address();
      if (!address || typeof address === 'string')
        throw new Error('Occupied listener did not bind');
      return launch(address.port, harness.uri);
    })();
  try {
    expect(
      await Promise.race([
        process.exited,
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 12_000)),
      ]),
    ).toBe(1);
    expect(process.errors()).toContain('Server startup failed.');
    expect(process.output()).not.toContain('server_started');
  } finally {
    if (process.child.exitCode === null) await stopped(process);
    await closeServer(occupied);
  }
});
it('serves production readiness/public/401/CORS responses and retains learning records across a real process restart', async () => {
  const token = await harness.token();
  const saved = await request(harness.app)
    .post('/api/courses')
    .auth(token, { type: 'bearer' })
    .send({ templateId: 'web-foundations' });
  expect(saved.status).toBe(201);
  const id = saved.body.course.id as string,
    port = await freePort();
  let process = launch(port, harness.uri);
  try {
    await ready(port);
    expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${port}/api/sample`)).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${port}/api/courses`)).status).toBe(401);
    const allowed = await fetch(`http://127.0.0.1:${port}/api/courses`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://client.invalid',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Authorization,Range',
      },
    });
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://client.invalid');
    expect(
      (
        await fetch(`http://127.0.0.1:${port}/api/sample`, {
          headers: { Origin: 'https://other.invalid' },
        })
      ).status,
    ).toBe(403);
    await stopped(process);
    process = launch(port, harness.uri);
    await ready(port);
    expect(await CourseModel.exists({ _id: id })).not.toBeNull();
    expect(
      (await request(harness.app).get(`/api/courses/${id}`).auth(token, { type: 'bearer' })).body
        .course.lessonCount,
    ).toBe(9);
  } finally {
    await stopped(process);
  }
});
