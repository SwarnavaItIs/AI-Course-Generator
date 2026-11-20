import { beforeEach, expect, it, vi } from 'vitest';
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    interactions = { create };
  },
}));
import { GeminiGenerationProvider, generationPrompt } from '../server/src/providers/generation.js';
import { evaluationCases } from './fixtures/generation.js';
beforeEach(() => {
  create.mockReset();
});
it('sends structured schema, selected model, no stored interaction, deadline and zero SDK retries', async () => {
  create.mockResolvedValue({ output_text: JSON.stringify(evaluationCases[0]!.outline) });
  const provider = new GeminiGenerationProvider({
    GEMINI_API_KEY: 'test-only-not-a-key',
    GEMINI_TEXT_MODEL: 'configured-model',
  });
  const request = {
    kind: 'course' as const,
    model: 'persisted-model',
    context: { topic: 'Python' },
    repair: false,
    signal: new AbortController().signal,
  };
  expect(await provider.generate(request)).toEqual(evaluationCases[0]!.outline);
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      model: 'persisted-model',
      store: false,
      response_format: expect.objectContaining({
        type: 'text',
        mime_type: 'application/json',
        schema: expect.objectContaining({ type: 'object' }),
      }),
    }),
    expect.objectContaining({ maxRetries: 0, signal: expect.any(AbortSignal) }),
  );
  expect(generationPrompt(request)).toContain('untrusted learner/curriculum data');
});
it('rejects malformed JSON and provider rate limits without exposing upstream error text', async () => {
  const provider = new GeminiGenerationProvider({
    GEMINI_API_KEY: 'test-only-not-a-key',
    GEMINI_TEXT_MODEL: 'configured-model',
  });
  const request = {
    kind: 'lesson' as const,
    model: 'configured-model',
    context: {},
    repair: true,
    signal: new AbortController().signal,
  };
  create.mockResolvedValueOnce({ output_text: '{broken' });
  await expect(provider.generate(request)).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
  const schema = create.mock.calls[0]![0].response_format.schema;
  expect(schema.properties.blocks.items).toMatchObject({
    anyOf: expect.arrayContaining([
      expect.objectContaining({
        properties: expect.objectContaining({ type: { type: 'string', enum: ['heading'] } }),
      }),
    ]),
  });
  expect(schema.properties.blocks.items).not.toHaveProperty('oneOf');
  create.mockRejectedValueOnce({ statusCode: 429, message: 'private upstream details' });
  await expect(provider.generate(request)).rejects.toMatchObject({
    code: 'PROVIDER_RATE_LIMITED',
    message: 'The generation service is busy. Please retry shortly.',
  });
});
it('cancels the SDK request at the provider deadline even with an active worker signal', async () => {
  const worker = new AbortController(),
    deadline = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
  const provider = new GeminiGenerationProvider({
    GEMINI_API_KEY: 'test-only-not-a-key',
    GEMINI_TEXT_MODEL: 'configured-model',
  });
  create.mockImplementation(
    (_request, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), {
          once: true,
        });
      }),
  );
  try {
    const result = provider.generate({
      kind: 'course',
      model: provider.model,
      context: {},
      repair: false,
      signal: worker.signal,
    });
    deadline.abort(new DOMException('Deadline expired', 'TimeoutError'));
    await expect(result).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
    expect(timeout).toHaveBeenCalledWith(45_000);
    expect(worker.signal.aborted).toBe(false);
  } finally {
    timeout.mockRestore();
  }
});
it('reports missing configuration without sending a request', async () => {
  const provider = new GeminiGenerationProvider({});
  expect(provider.available).toBe(false);
  await expect(
    provider.generate({
      kind: 'course',
      model: 'unconfigured',
      context: {},
      repair: false,
      signal: new AbortController().signal,
    }),
  ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  expect(create).not.toHaveBeenCalled();
});
