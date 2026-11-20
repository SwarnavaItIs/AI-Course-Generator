import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { normalizeAudio } from './audio.js';
import { GoogleEnhancementProvider } from './enhancements.js';
import type { Config } from '../config.js';

// Lightweight access checks; full generation is evaluated separately.
export class GeminiAccessProbes {
  private readonly client: GoogleGenAI;
  constructor(private readonly apiKey: string) {
    this.client = new GoogleGenAI({ apiKey: apiKey.trim() });
  }
  async text(model: string) {
    const response = await this.client.interactions.create(
      {
        model: model.trim(),
        input: 'Reply with one short sentence explaining what a web browser does.',
        store: false,
      },
      { maxRetries: 0, signal: AbortSignal.timeout(20_000) },
    );
    const text = z.string().trim().min(1).max(20_000).parse(response.output_text);
    return { characters: text.length };
  }
  async speech(model: string, voice: Config['GEMINI_TTS_VOICE']) {
    const provider = new GoogleEnhancementProvider({
      GEMINI_API_KEY: this.apiKey,
      GEMINI_TTS_MODEL: model,
      GEMINI_TTS_VOICE: voice,
    });
    const audio = normalizeAudio(
      await provider.speech(
        'नमस्ते! आज हम सीखेंगे कि browser क्या करता है।',
        provider.model('audio'),
        provider.voice,
        AbortSignal.timeout(20_000),
      ),
    );
    return { bytes: audio.data.length, format: 'WAV', durationSeconds: audio.durationSeconds };
  }
}
export async function probeYouTube(apiKey: string) {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.search = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    q: 'HTML beginner tutorial',
    videoEmbeddable: 'true',
    maxResults: '1',
    key: apiKey.trim(),
  }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`YouTube returned HTTP ${response.status}`);
  const result = z
    .object({ items: z.array(z.object({ id: z.object({ videoId: z.string().min(1) }) })).max(1) })
    .parse(await response.json());
  return { results: result.items.length };
}
