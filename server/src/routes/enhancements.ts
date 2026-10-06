import { Router } from 'express';
import {
  completionRequestSchema,
  enhancementKindSchema,
  generateLessonRequestSchema,
  idSchema,
} from '@text-to-learn/contracts';
import { ownerFrom } from '../auth.js';
import { ApiError } from '../errors.js';
import type { EnhancementProvider } from '../providers/enhancements.js';
import type { AudioStorage } from '../storage/audio.js';
import { getEnhancements, ownedAudio, requestEnhancement } from '../services/enhancements.js';
import { setCompletion } from '../services/courses.js';

export function createEnhancementsRouter(provider: EnhancementProvider, storage: AudioStorage) {
  const router = Router();
  const ids = (params: Record<string, string | string[]>) => ({
    courseId: idSchema.parse(params.courseId),
    lessonId: idSchema.parse(params.lessonId),
  });
  router.get('/:courseId/lessons/:lessonId/enhancements', async (request, response) => {
    const { courseId, lessonId } = ids(request.params);
    response.json({
      enhancements: await getEnhancements(provider, ownerFrom(request), courseId, lessonId),
    });
  });
  router.post('/:courseId/lessons/:lessonId/enhancements/:kind', async (request, response) => {
    const { courseId, lessonId } = ids(request.params),
      kind = enhancementKindSchema.parse(request.params.kind);
    const input = generateLessonRequestSchema.parse(request.body);
    const enhancements = await requestEnhancement(
      provider,
      ownerFrom(request),
      courseId,
      lessonId,
      kind,
      input.retry,
    );
    response.status(enhancements[kind].state === 'generating' ? 202 : 200).json({ enhancements });
  });
  router.post('/:courseId/lessons/:lessonId/completion', async (request, response) => {
    const { courseId, lessonId } = ids(request.params),
      { completed } = completionRequestSchema.parse(request.body);
    response.json({
      course: await setCompletion(ownerFrom(request), courseId, lessonId, completed),
    });
  });
  router.get('/:courseId/lessons/:lessonId/audio/:assetId', async (request, response, next) => {
    const { courseId, lessonId } = ids(request.params);
    const asset = await ownedAudio(
      ownerFrom(request),
      courseId,
      lessonId,
      idSchema.parse(request.params.assetId),
    );
    let start = 0,
      end = asset.bytes - 1;
    if (request.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if (match && (match[1] || match[2])) {
        start = match[1] ? Number(match[1]) : Math.max(0, asset.bytes - Number(match[2]));
        end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
      } else start = asset.bytes;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start >= asset.bytes ||
        end < start
      ) {
        response.setHeader('Content-Range', `bytes */${asset.bytes}`);
        response.status(416).end();
        return;
      }
      response.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${asset.bytes}`);
    }
    response.setHeader('Content-Type', asset.mimeType);
    response.setHeader('Content-Length', end - start + 1);
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Content-Disposition', `inline; filename="${asset._id}.wav"`);
    const stream = storage.read(asset.fileId, start, end + 1);
    stream.once('error', () => {
      if (response.headersSent) response.destroy();
      else {
        response.removeHeader('Content-Length');
        next(new ApiError(503, 'AUDIO_UNAVAILABLE', 'Audio could not be loaded. Please retry.'));
      }
    });
    response.once('close', () => stream.destroy());
    stream.pipe(response);
  });
  return router;
}
