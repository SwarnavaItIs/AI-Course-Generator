import { createServer } from 'node:http';
import { resolve } from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { closeServer, createHarness, listen } from './fixtures/harness.js';
import { FixtureGenerationProvider } from './fixtures/generation.js';
import { GenerationWorker } from '../server/src/services/generation.js';
import { FixtureEnhancementProvider } from './fixtures/enhancements.js';
import { EnhancementWorker } from '../server/src/services/enhancements.js';
import { GridFsAudioStorage } from '../server/src/storage/audio.js';

if (process.env.NODE_ENV !== 'test') throw new Error('Browser fixtures require NODE_ENV=test');
const provider = new FixtureGenerationProvider(300);
const enhancements = new FixtureEnhancementProvider(300);
const storage = new GridFsAudioStorage();
const harness = await createHarness(provider, enhancements, storage);
const worker = new GenerationWorker(provider, { retryDelayMs: 100 });
worker.start();
const enhancementWorker = new EnhancementWorker(enhancements, storage, { retryDelayMs: 100 });
enhancementWorker.start();
const app = express();
app.post('/__fixture/reset-rate-limit', async (_request, response) => {
  await harness.resetRateLimit();
  response.status(204).end();
});
app.get('/__fixture/token', async (request, response) => {
  const sub = String(request.query.subject ?? '');
  if (!/^auth0\|browser-[a-f0-9-]{36}$/.test(sub)) {
    response.status(400).end();
    return;
  }
  response.json({ token: await harness.token(sub) });
});
app.use(harness.app);
const api = createServer(app);
await listen(api, 4174);
const vite = await createViteServer({ configFile: resolve('tests/vite.config.ts') });
await vite.listen();
console.info('Isolated browser fixtures ready at http://127.0.0.1:4173');
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await vite.close();
  await closeServer(api);
  await worker.stop();
  await enhancementWorker.stop();
  await harness.close();
}
process.once('SIGINT', () => {
  void stop().then(() => process.exit(0));
});
process.once('SIGTERM', () => {
  void stop().then(() => process.exit(0));
});
