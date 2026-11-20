import 'dotenv/config';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { parseConfig } from './config.js';
import { createApp } from './app.js';
import { initializeIndexes } from './models.js';
import { GeminiGenerationProvider } from './providers/generation.js';
import { GenerationWorker } from './services/generation.js';
import { GoogleEnhancementProvider } from './providers/enhancements.js';
import { EnhancementWorker } from './services/enhancements.js';
import { GridFsAudioStorage } from './storage/audio.js';

class StartupError extends Error {}

async function start() {
  const config = parseConfig(process.env);
  mongoose.set('bufferCommands', false);
  await mongoose.connect(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 15_000,
  });
  const topology = await mongoose.connection.db!.admin().command({ hello: 1 });
  if (!topology.setName && topology.msg !== 'isdbgrid') {
    throw new StartupError(
      'MongoDB must use a replica set or sharded cluster for atomic course persistence. See README.md.',
    );
  }
  await initializeIndexes();
  const provider = new GeminiGenerationProvider(config);
  const worker = new GenerationWorker(provider);
  const enhancements = new GoogleEnhancementProvider(config),
    audioStorage = new GridFsAudioStorage();
  const enhancementWorker = new EnhancementWorker(enhancements, audioStorage);
  const server = createServer(
    { requestTimeout: 30_000, headersTimeout: 30_000 },
    createApp(config, { provider, enhancements, audioStorage }),
  );
  await new Promise<void>((resolve, reject) => {
    const failed = (error: NodeJS.ErrnoException) =>
      reject(
        new StartupError(
          error.code === 'EADDRINUSE'
            ? `Port ${config.PORT} is already in use. Stop the other service or set a different PORT.`
            : `Could not listen on port ${config.PORT}. Check PORT and the hosting configuration.`,
        ),
      );
    server.once('error', failed);
    server.listen(config.PORT, () => {
      server.off('error', failed);
      resolve();
    });
  });
  worker.start();
  enhancementWorker.start();
  console.info(JSON.stringify({ event: 'server_started', port: config.PORT }));
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10_000).unref();
    const closed = new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    void Promise.allSettled([closed, worker.stop(), enhancementWorker.stop()]).then(
      async (results) => {
        let failed = results.some((result) => result.status === 'rejected');
        await mongoose.disconnect().catch(() => {
          failed = true;
        });
        if (failed) console.error(JSON.stringify({ event: 'server_shutdown_failed' }));
        clearTimeout(deadline);
        process.exit(failed ? 1 : 0);
      },
    );
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
void start().catch(async (error: unknown) => {
  const message =
    error instanceof StartupError
      ? `Server startup failed. ${error.message}`
      : error instanceof Error && error.message.startsWith('Invalid server configuration:')
        ? error.message
        : 'Server startup failed. Check configuration, MongoDB access, and replica-set setup.';
  console.error(message);
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
