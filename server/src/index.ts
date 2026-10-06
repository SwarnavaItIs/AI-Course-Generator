import 'dotenv/config';
import mongoose from 'mongoose';
import { parseConfig } from './config.js';
import { createApp } from './app.js';
import { initializeIndexes } from './models.js';
import { GeminiGenerationProvider } from './providers/generation.js';
import { GenerationWorker } from './services/generation.js';
import { GoogleEnhancementProvider } from './providers/enhancements.js';
import { EnhancementWorker } from './services/enhancements.js';
import { GridFsAudioStorage } from './storage/audio.js';

async function start() {
  const config = parseConfig(process.env);
  mongoose.set('bufferCommands', false);
  await mongoose.connect(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 15_000,
  });
  const topology = await mongoose.connection.db!.admin().command({ hello: 1 });
  if (!topology.setName && topology.msg !== 'isdbgrid') {
    throw new Error(
      'MongoDB must use a replica set or sharded cluster for atomic course persistence. See README.md.',
    );
  }
  await initializeIndexes();
  const provider = new GeminiGenerationProvider(config);
  const worker = new GenerationWorker(provider);
  worker.start();
  const enhancements = new GoogleEnhancementProvider(config),
    audioStorage = new GridFsAudioStorage();
  const enhancementWorker = new EnhancementWorker(enhancements, audioStorage);
  enhancementWorker.start();
  const server = createApp(config, { provider, enhancements, audioStorage }).listen(
    config.PORT,
    () => console.info(JSON.stringify({ event: 'server_started', port: config.PORT })),
  );
  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;
  const stop = () => {
    const deadline = setTimeout(() => process.exit(1), 10_000).unref();
    server.close(() => {
      void Promise.all([worker.stop(), enhancementWorker.stop()])
        .then(() => mongoose.disconnect())
        .finally(() => {
          clearTimeout(deadline);
          process.exit(0);
        });
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
void start().catch((error: unknown) => {
  const message =
    error instanceof Error && error.message.startsWith('Invalid server configuration:')
      ? error.message
      : 'Server startup failed. Check configuration, MongoDB access, and replica-set setup.';
  console.error(message);
  process.exitCode = 1;
});
