import { z } from 'zod';

export function geminiSchema(schema: z.ZodType) {
  const json = z.toJSONSchema(schema, {
    override: ({ jsonSchema }) => {
      // The provider documents anyOf and enum. Discriminators keep these branches exclusive.
      if (jsonSchema.oneOf) {
        jsonSchema.anyOf = jsonSchema.oneOf;
        delete jsonSchema.oneOf;
      }
      if (typeof jsonSchema.const === 'string') {
        jsonSchema.enum = [jsonSchema.const];
        delete jsonSchema.const;
      }
    },
  });
  delete json.$schema;
  return json;
}

export function geminiOptions(parentSignal: AbortSignal, timeoutMs: number) {
  // The SDK's timeout option is bypassed when a caller supplies a signal.
  return {
    maxRetries: 0,
    signal: AbortSignal.any([parentSignal, AbortSignal.timeout(timeoutMs)]),
  };
}

export function providerStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || !error) return;
  if ('status' in error && typeof error.status === 'number') return error.status;
  if ('statusCode' in error && typeof error.statusCode === 'number') return error.statusCode;
}
