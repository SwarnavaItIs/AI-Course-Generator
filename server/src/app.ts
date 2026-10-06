import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit, type Store } from 'express-rate-limit';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { idSchema, sampleCourse, sampleLessons } from '@text-to-learn/contracts';
import type { Config } from './config.js';
import { createAuth, ownerFrom } from './auth.js';
import { ApiError } from './errors.js';
import { createCoursesRouter } from './routes/courses.js';
import { GeminiGenerationProvider, type GenerationProvider } from './providers/generation.js';
import { GoogleEnhancementProvider, type EnhancementProvider } from './providers/enhancements.js';
import { GridFsAudioStorage, type AudioStorage } from './storage/audio.js';
import { createEnhancementsRouter } from './routes/enhancements.js';

export function createApp(
  config: Config,
  dependencies: {
    authenticate?: RequestHandler;
    provider?: GenerationProvider;
    enhancements?: EnhancementProvider;
    audioStorage?: AudioStorage;
    rateLimitStore?: Store;
  } = {},
) {
  const app = express();
  app.disable('x-powered-by');
  // Render terminates HTTPS one proxy hop away; do not blindly trust arbitrary proxy chains.
  if (config.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.use(helmet());
  app.use((_request, response, next) => {
    response.locals.requestId = randomUUID();
    response.setHeader('X-Request-Id', response.locals.requestId as string);
    next();
  });
  app.use(
    cors({
      origin: (value, callback) =>
        value && !config.CLIENT_ORIGINS.includes(value)
          ? callback(new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed.'))
          : callback(null, true),
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Range'],
      exposedHeaders: [
        'X-Request-Id',
        'Location',
        'Content-Length',
        'Content-Range',
        'Content-Disposition',
      ],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '16kb', strict: true }));
  app.get('/health', (_request, response) => response.json({ status: 'ok' }));
  app.get('/ready', async (_request, response) => {
    try {
      if (mongoose.connection.readyState !== 1 || !mongoose.connection.db)
        throw new Error('Not connected');
      await mongoose.connection.db.admin().ping();
      response.json({ status: 'ready' });
    } catch {
      response.status(503).json({ status: 'not_ready' });
    }
  });
  app.use(
    '/api',
    rateLimit({
      store: dependencies.rateLimitStore,
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_request, _response, next) =>
        next(new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please try again shortly.')),
    }),
  );
  app.get('/api/sample', (_request, response) => response.json({ course: sampleCourse }));
  app.get('/api/sample/lessons/:lessonId', (request, response) => {
    const id = idSchema.parse(request.params.lessonId);
    const lesson = sampleLessons.find((item) => item.id === id);
    if (!lesson) throw new ApiError(404, 'NOT_FOUND', 'This sample lesson could not be found.');
    response.json({ lesson });
  });
  app.use('/api', dependencies.authenticate ?? createAuth(config));
  app.use('/api', (request, response, next) => {
    ownerFrom(request);
    response.setHeader('Cache-Control', 'no-store');
    if (mongoose.connection.readyState !== 1)
      return next(
        new ApiError(
          503,
          'UNAVAILABLE',
          'Your library is temporarily unavailable. Please try again.',
        ),
      );
    next();
  });
  app.use(
    '/api/courses',
    createEnhancementsRouter(
      dependencies.enhancements ?? new GoogleEnhancementProvider(config),
      dependencies.audioStorage ?? new GridFsAudioStorage(),
    ),
  );
  app.use(
    '/api/courses',
    createCoursesRouter(dependencies.provider ?? new GeminiGenerationProvider(config)),
  );
  app.use((_request, _response, next) =>
    next(new ApiError(404, 'NOT_FOUND', 'This endpoint could not be found.')),
  );
  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    let status = 500,
      code = 'INTERNAL_ERROR',
      message = 'Something went wrong. Please try again.';
    if (error instanceof ApiError) ({ status, code, message } = error);
    else if (error instanceof ZodError) {
      status = 400;
      code = 'INVALID_INPUT';
      message = 'Check your input and try again.';
    } else if (typeof error === 'object' && error !== null && 'status' in error) {
      const errorStatus = Number(error.status);
      if (errorStatus === 401 || errorStatus === 403) {
        status = 401;
        code = 'UNAUTHENTICATED';
        message = 'Sign in with a valid access token to continue.';
      } else if (errorStatus === 400) {
        status = 400;
        code = 'INVALID_JSON';
        message = 'Send a valid JSON request.';
      } else if (errorStatus === 413) {
        status = 413;
        code = 'INPUT_TOO_LARGE';
        message = 'This request is too large.';
      }
    }
    if (status === 500)
      console.error(
        JSON.stringify({ event: 'request_failed', requestId: response.locals.requestId, code }),
      );
    if (status === 401) response.setHeader('WWW-Authenticate', 'Bearer');
    response
      .status(status)
      .json({ error: { code, message, requestId: response.locals.requestId } });
  };
  app.use(errorHandler);
  return app;
}
