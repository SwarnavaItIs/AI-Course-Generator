import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GeminiAccessProbes, probeYouTube } from '../providers/access-probes.js';

type Probe = {
  provider: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  missing?: string[];
  evidence?: unknown;
  reason?: string;
};
const results: Probe[] = [];
async function check(provider: string, required: string[], run: () => Promise<unknown>) {
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    results.push({ provider, status: 'BLOCKED', missing });
    return;
  }
  try {
    results.push({ provider, status: 'PASS', evidence: await run() });
  } catch {
    results.push({
      provider,
      status: 'FAIL',
      reason:
        'Access probe failed. Verify key permissions, selected model, quota, and network access. Provider error bodies are deliberately omitted.',
    });
  }
}
await check('Gemini text', ['GEMINI_API_KEY', 'GEMINI_TEXT_MODEL'], () =>
  new GeminiAccessProbes(process.env.GEMINI_API_KEY!).text(process.env.GEMINI_TEXT_MODEL!),
);
await check('Gemini TTS', ['GEMINI_API_KEY', 'GEMINI_TTS_MODEL'], () =>
  new GeminiAccessProbes(process.env.GEMINI_API_KEY!).speech(
    process.env.GEMINI_TTS_MODEL!,
    process.env.GEMINI_TTS_VOICE || 'Kore',
  ),
);
await check('YouTube search', ['YOUTUBE_API_KEY'], () =>
  probeYouTube(process.env.YOUTUBE_API_KEY!),
);
const directory = fileURLToPath(new URL('../../../docs/weeks/week-1/', import.meta.url));
await mkdir(directory, { recursive: true });
const report = {
  checkedAt: new Date().toISOString(),
  scope: 'Access only; no generated production course, playback, or enhancement claims.',
  results,
};
await writeFile(`${directory}/provider-access.json`, `${JSON.stringify(report, null, 2)}\n`);
console.info(JSON.stringify(report, null, 2));
process.exitCode = results.some((result) => result.status === 'FAIL')
  ? 1
  : results.some((result) => result.status === 'BLOCKED')
    ? 2
    : 0;
