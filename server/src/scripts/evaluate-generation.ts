import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { outlineDraftSchema, generatedLessonContentSchema } from '@text-to-learn/contracts';
import {
  GeminiGenerationProvider,
  GenerationFailure,
  RESOURCE_CATALOGUE,
  resolveResources,
} from '../providers/generation.js';
const missing = ['GEMINI_API_KEY', 'GEMINI_TEXT_MODEL'].filter(
  (name) => !process.env[name]?.trim(),
);
const directory = fileURLToPath(new URL('../../../artifacts/generation/', import.meta.url));
const provider = new GeminiGenerationProvider(process.env);
const results: unknown[] = [];
let failed = false;
for (const topic of ['Python for beginners', 'Persuasive writing', 'World history']) {
  if (missing.length) {
    results.push({ topic, status: 'BLOCKED', missing });
    continue;
  }
  try {
    const outline = outlineDraftSchema.parse(
      await provider.generate({
        kind: 'course',
        model: provider.model,
        context: { topic, catalogue: RESOURCE_CATALOGUE },
        repair: false,
        signal: AbortSignal.timeout(45_000),
      }),
    );
    for (const module of outline.modules)
      for (const lesson of module.lessons) resolveResources(lesson.resources);
    const lesson = generatedLessonContentSchema.parse(
      await provider.generate({
        kind: 'lesson',
        model: provider.model,
        context: { curriculum: outline, selectedLesson: outline.modules[0]!.lessons[0]! },
        repair: false,
        signal: AbortSignal.timeout(45_000),
      }),
    );
    results.push({
      topic,
      status: 'PASS',
      validationOnly: true,
      manualQualityReview: 'NOT_RUN',
      outline,
      lesson,
    });
  } catch (error) {
    failed = true;
    results.push({
      topic,
      status: 'FAIL',
      code: error instanceof GenerationFailure ? error.code : 'INVALID_OUTPUT',
      reason: 'Generation or validation failed. Provider details are omitted.',
    });
  }
}
await mkdir(directory, { recursive: true });
const report = {
  checkedAt: new Date().toISOString(),
  scope:
    'Live adapter/structured-output validation for three topics. Does not verify saved production records or Auth0. Review curriculum, correctness, resources and quiz explanations manually before accepting quality.',
  model: missing.length ? null : provider.model,
  results,
};
await writeFile(`${directory}/live-evaluation.json`, `${JSON.stringify(report, null, 2)}\n`);
console.info(
  JSON.stringify(
    {
      checkedAt: report.checkedAt,
      results: results.map((result) => {
        const entry = result as { topic: string; status: string; missing?: string[] };
        return {
          topic: entry.topic,
          status: entry.status,
          ...(entry.missing ? { missing: entry.missing } : {}),
        };
      }),
    },
    null,
    2,
  ),
);
process.exitCode = failed ? 1 : missing.length ? 2 : 0;
