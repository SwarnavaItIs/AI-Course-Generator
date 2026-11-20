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
      options.signal?.throwIfAborted();
      if (!options.public) headers.Authorization = `Bearer ${await getToken()}`;
      if (options.body !== undefined) headers['Content-Type'] = 'application/json';
      const timeout = AbortSignal.timeout(15_000);
      const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
      let response: Response;
      try {
        response = await fetch(`${baseUrl}${path}`, {
          method: options.method ?? 'GET',
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal,
        });
      } catch (error) {
        if (options.signal?.aborted) throw error;
        throw new RequestError(
          timeout.aborted
            ? 'The learning service took too long to respond. Please try again.'
            : 'We couldn’t reach the learning service. Check your connection and try again.',
        );
      }
      const requestId = response.headers.get('X-Request-Id') ?? undefined;
      if (!response.ok) {
        const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
        options.signal?.throwIfAborted();
        throw new RequestError(
          parsed.success
            ? parsed.data.error.message
            : 'We couldn’t complete that request. Please try again.',
          parsed.success ? parsed.data.error.requestId : requestId,
        );
      }
      // An SPA fallback may return HTML with status 200, even for an API URL.
      if (!schema && response.status === 204) return undefined as T;
      if (schema) {
        const parsed = schema.safeParse(await response.json().catch(() => null));
        options.signal?.throwIfAborted();
        if (parsed.success) return parsed.data;
      }
      throw new RequestError(
        'The learning service returned an unexpected response. Please try again.',
        requestId,
      );
    },
    [getToken],
  );
}
export function useAudioDownload() {
  const { getToken } = useSession();
  return useCallback(
    async (path: string, signal: AbortSignal) => {
      if (baseUrl === 'INVALID') throw new RequestError('The audio service is unavailable.');
      signal.throwIfAborted();
      const token = await getToken();
      const failed = () => new RequestError('Audio could not be loaded. Please retry.');
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      }).catch(() => {
        signal.throwIfAborted();
        throw failed();
      });
      if (!response.ok) throw failed();
      if (
        response.headers.get('Content-Type')?.split(';')[0] !== 'audio/wav' ||
        Number(response.headers.get('Content-Length')) > 12_000_000
      )
        throw new RequestError('The audio format is unsupported.');
      const blob = await response.blob().catch(() => {
        signal.throwIfAborted();
        throw failed();
      });
      if (blob.size < 44 || blob.size > 12_000_000)
        throw new RequestError('The audio size is unsupported.');
      return blob;
    },
    [getToken],
  );
}
