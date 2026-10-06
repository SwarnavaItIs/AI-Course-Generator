import { z } from 'zod';

const origin = z.url().refine((value) => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
}, 'Use an HTTP(S) origin without a trailing slash or path');
export const supportedVoiceSchema = z
  .enum(['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Zephyr', 'Orus', 'Leda'])
  .default('Kore');
const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    CLIENT_ORIGINS: z
      .string()
      .min(1)
      .transform((value) => value.split(',').map((item) => item.trim()))
      .pipe(z.array(origin).min(1)),
    MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//),
    AUTH0_DOMAIN: z.string().regex(/^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/),
    AUTH0_AUDIENCE: z.string().trim().min(1),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_TEXT_MODEL: z.string().optional(),
    GEMINI_TTS_MODEL: z.string().optional(),
    GEMINI_TTS_VOICE: supportedVoiceSchema,
    YOUTUBE_API_KEY: z.string().optional(),
  })
  .superRefine((config, context) => {
    if (
      config.NODE_ENV === 'production' &&
      config.CLIENT_ORIGINS.some((value) => !value.startsWith('https://'))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['CLIENT_ORIGINS'],
        message: 'Production client origins require HTTPS',
      });
    }
  });

export type Config = z.infer<typeof configSchema>;
export function parseConfig(environment: NodeJS.ProcessEnv): Config {
  const result = configSchema.safeParse(environment);
  if (!result.success) {
    // Names only: never include the environment values or a database URI in a startup error.
    throw new Error(
      `Invalid server configuration: ${[...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ')}. See server/.env.example.`,
    );
  }
  return result.data;
}
