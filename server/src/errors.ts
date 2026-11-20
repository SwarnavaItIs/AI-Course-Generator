import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function parseInput<T>(schema: z.ZodType<T>, value: unknown) {
  const input = schema.safeParse(value);
  if (!input.success) throw new ApiError(400, 'INVALID_INPUT', 'Check your input and try again.');
  return input.data;
}
