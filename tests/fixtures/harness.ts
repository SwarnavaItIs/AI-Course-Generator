// This fixture is used only by test commands. The production entrypoint never imports it.
import express from 'express';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { auth } from 'express-oauth2-jwt-bearer';
import { createApp } from '../../server/src/app.js';
import { parseConfig } from '../../server/src/config.js';
import { initializeIndexes } from '../../server/src/models.js';
import type { GenerationProvider } from '../../server/src/providers/generation.js';
import type { EnhancementProvider } from '../../server/src/providers/enhancements.js';
import type { AudioStorage } from '../../server/src/storage/audio.js';
import { MemoryStore } from 'express-rate-limit';

export async function listen(server: Server, port = 0) {
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind');
  return `http://127.0.0.1:${address.port}`;
}
export const closeServer = (server: Server) =>
  new Promise<void>((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise())),
  );
export async function createHarness(
  provider?: GenerationProvider,
  enhancements?: EnhancementProvider,
  audioStorage?: AudioStorage,
) {
  const mongo = await MongoMemoryReplSet.create({
    binary: { version: '8.0.16', downloadDir: resolve('.cache/mongodb') },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  mongoose.set('bufferCommands', false);
  const uri = mongo.getUri('text_to_learn_tests');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  await initializeIndexes();
  const keys = await generateKeyPair('RS256');
  const jwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: 'fixture-key',
    alg: 'RS256',
    use: 'sig',
  };
  const jwksApp = express();
  jwksApp.get('/jwks', (_request, response) => response.json({ keys: [jwk] }));
  const jwks = createServer(jwksApp);
  const jwksOrigin = await listen(jwks);
  const issuer = 'https://fixture-issuer.invalid/';
  const audience = 'https://text-to-learn-test-api';
  const config = parseConfig({
    NODE_ENV: 'test',
    CLIENT_ORIGINS: 'http://127.0.0.1:4173',
    MONGODB_URI: uri,
    AUTH0_DOMAIN: 'fixture-issuer.invalid',
    AUTH0_AUDIENCE: audience,
  });
  const authenticate = auth({
    issuer,
    jwksUri: `${jwksOrigin}/jwks`,
    audience,
    tokenSigningAlg: 'RS256',
    clockTolerance: 0,
  });
  const rateLimitStore = new MemoryStore();
  const app = createApp(config, {
    authenticate,
    provider,
    enhancements,
    audioStorage,
    rateLimitStore,
  });
  const token = (
    sub = 'auth0|learner-a',
    overrides: { issuer?: string; audience?: string; expires?: number; algorithm?: string } = {},
  ) =>
    new SignJWT({})
      .setProtectedHeader({ alg: overrides.algorithm ?? 'RS256', kid: 'fixture-key' })
      .setSubject(sub)
      .setIssuer(overrides.issuer ?? issuer)
      .setAudience(overrides.audience ?? audience)
      .setIssuedAt()
      .setExpirationTime(overrides.expires ?? Math.floor(Date.now() / 1000) + 3600)
      .sign(keys.privateKey);
  return {
    app,
    uri,
    token,
    resetRateLimit: () => rateLimitStore.resetAll(),
    async close() {
      await closeServer(jwks);
      await mongoose.disconnect();
      await mongo.stop();
    },
  };
}
