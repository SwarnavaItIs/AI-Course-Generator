// Explicit live evaluation on authored sample lessons; never loaded by the production application.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import {
  lessonSchema,
  transcriptDraftSchema,
  type EnhancementKind,
} from '@text-to-learn/contracts';
import { evaluationCases } from './fixtures/generation.js';
import { GoogleEnhancementProvider } from '../server/src/providers/enhancements.js';
import { GenerationFailure, resolveResources } from '../server/src/providers/generation.js';
import { normalizeAudio } from '../server/src/providers/audio.js';
import { supportedVoiceSchema } from '../server/src/config.js';

loadEnv({ path: resolve('server/.env'), quiet: true });
const provider = new GoogleEnhancementProvider({
  ...process.env,
  GEMINI_TTS_VOICE: supportedVoiceSchema.parse(process.env.GEMINI_TTS_VOICE),
});
const directory = 'artifacts/enhancements';
await mkdir(`${directory}/live-audio`, { recursive: true });
const missingFor = (kind: EnhancementKind) =>
  (kind === 'videos'
    ? ['YOUTUBE_API_KEY']
    : kind === 'audio'
      ? ['GEMINI_API_KEY', 'GEMINI_TTS_MODEL']
      : ['GEMINI_API_KEY', 'GEMINI_TEXT_MODEL']
  ).filter((name) => !process.env[name]?.trim());
const results: unknown[] = [];
let failed = false,
  blocked = false;
for (const [index, fixture] of evaluationCases.entries()) {
  const metadata = fixture.outline.modules[0]!.lessons[0]!;
  const lesson = lessonSchema.parse({
    ...metadata,
    resources: resolveResources(metadata.resources),
    id: randomUUID(),
    courseId: randomUUID(),
    moduleId: randomUUID(),
    position: 0,
    generationState: 'ready',
    contentVersion: 1,
    contentHash: null,
    content: fixture.lesson,
  });
  const checks: Record<string, unknown> = {};
  let text: string | undefined;
  for (const kind of ['videos', 'transcript', 'audio'] as const) {
    const missing = missingFor(kind);
    if (missing.length || (kind === 'audio' && !text)) {
      blocked = true;
      checks[kind] = {
        status: 'BLOCKED',
        missing,
        ...(kind === 'audio' && !text ? { dependency: 'validated_live_transcript' } : {}),
      };
      continue;
    }
    try {
      if (kind === 'videos')
        checks.videos = {
          status: 'PASS',
          validationOnly: true,
          items: await provider.videos(lesson.content!.videoQueries!, AbortSignal.timeout(45_000)),
          liveEmbedPlayback: 'NOT_RUN',
        };
      else if (kind === 'transcript') {
        text = transcriptDraftSchema.parse(
          await provider.transcript(lesson, provider.model(kind), AbortSignal.timeout(45_000)),
        ).text;
        checks.transcript = {
          status: 'PASS',
          validationOnly: true,
          text,
          meaningReview: 'NOT_RUN',
        };
      } else {
        const audio = normalizeAudio(
          await provider.speech(
            text!,
            provider.model(kind),
            provider.voice,
            AbortSignal.timeout(70_000),
          ),
        );
        const file = `${directory}/live-audio/sample-${index + 1}.wav`;
        await writeFile(file, audio.data);
        checks.audio = {
          status: 'PASS',
          validationOnly: true,
          mimeType: audio.mimeType,
          bytes: audio.data.length,
          durationSeconds: audio.durationSeconds,
          file,
          pronunciationListening: 'NOT_RUN',
        };
      }
    } catch (error) {
      failed = true;
      checks[kind] = {
        status: 'FAIL',
        code: error instanceof GenerationFailure ? error.code : 'INVALID_OUTPUT',
      };
    }
  }
  results.push({
    topic: fixture.topic,
    source: 'authored_evaluation_lesson',
    lessonTitle: lesson.title,
    checks,
    reviewTerms:
      index === 0
        ? ['Python', 'string', 'integer', 'variable']
        : index === 1
          ? ['audience', 'purpose', 'evidence']
          : ['primary source', 'historical evidence', 'context'],
  });
}
const report = {
  checkedAt: new Date().toISOString(),
  scope:
    'Live enhancement adapters on three authored technical/nontechnical/broad sample lessons. Format/schema validation only; listen to each WAV and review transcript meaning and Hindi-English terminology manually. Does not prove actual tenant login, saved production caching, or live embeds.',
  textModel: provider.model('transcript'),
  speechModel: provider.model('audio'),
  voice: provider.voice,
  results,
};
await writeFile(`${directory}/live-evaluation.json`, `${JSON.stringify(report, null, 2)}\n`);
console.info(
  JSON.stringify({
    report: `${directory}/live-evaluation.json`,
    status: failed ? 'FAIL' : blocked ? 'BLOCKED' : 'PASS',
    missing: [
      ...new Set(
        ['videos', 'transcript', 'audio'].flatMap((kind) => missingFor(kind as EnhancementKind)),
      ),
    ],
  }),
);
process.exitCode = failed ? 1 : blocked ? 2 : 0;
