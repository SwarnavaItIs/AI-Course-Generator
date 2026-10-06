import { useCallback } from 'react';
import type { z } from 'zod';
import { apiErrorSchema } from '@text-to-learn/contracts';
import { useSession } from './auth';

const configuredUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? '';
let baseUrl = configuredUrl.replace(/\/$/, '');
if (baseUrl) {
  try {
    const url = new URL(baseUrl);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      (import.meta.env.PROD && url.protocol !== 'https:')
    ) {
      throw new Error('Invalid API origin');
    }
  } catch {
    baseUrl = 'INVALID';
  }
}
export class RequestError extends Error {
  constructor(
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}
export function useApi() {
  const { getToken } = useSession();
  return useCallback(
    async <T>(
      path: string,
      schema: z.ZodType<T> | null,
      options: { method?: string; body?: unknown; public?: boolean; signal?: AbortSignal } = {},
    ): Promise<T> => {
      if (baseUrl === 'INVALID')
        throw new RequestError('The learning service is temporarily unavailable.');
      const headers: Record<string, string> = {};
      if (!options.public) headers.Authorization = `Bearer ${await getToken()}`;
      if (options.body !== undefined) headers['Content-Type'] = 'application/json';
      let response: Response;
      try {
        response = await fetch(`${baseUrl}${path}`, {
          method: options.method ?? 'GET',
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: options.signal
            ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)])
            : AbortSignal.timeout(15_000),
        });
      } catch (error) {
        if (options.signal?.aborted) throw error;
        throw new RequestError(
          'We couldn’t reach your library. Check your connection and try again.',
        );
      }
      if (!response.ok) {
        const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
        throw new RequestError(
          parsed.success
            ? parsed.data.error.message
            : 'We couldn’t complete that request. Please try again.',
          parsed.success ? parsed.data.error.requestId : undefined,
        );
      }
      if (!schema) return undefined as T;
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success)
        throw new RequestError(
          'This learning content couldn’t be loaded. Please try again.',
          response.headers.get('X-Request-Id') ?? undefined,
        );
      return parsed.data;
    },
    [getToken],
  );
}
export function useAudioDownload() {
  const { getToken } = useSession();
  return useCallback(
    async (path: string, signal: AbortSignal) => {
      if (baseUrl === 'INVALID') throw new RequestError('The audio service is unavailable.');
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${await getToken()}` },
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      });
      if (!response.ok) throw new RequestError('Audio could not be loaded. Please retry.');
      if (
        response.headers.get('Content-Type')?.split(';')[0] !== 'audio/wav' ||
        Number(response.headers.get('Content-Length')) > 12_000_000
      )
        throw new RequestError('The audio format is unsupported.');
      const blob = await response.blob();
      if (blob.size < 44 || blob.size > 12_000_000)
        throw new RequestError('The audio size is unsupported.');
      return blob;
    },
    [getToken],
  );
}
