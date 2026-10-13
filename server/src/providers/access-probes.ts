import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

// Lightweight access checks; full generation is evaluated separately.
export class GeminiAccessProbes {
  private readonly client: GoogleGenAI;
  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }
  async text(model: string) {
    const response = await this.client.interactions.create(
      {
        model,
        input: 'Reply with one short sentence explaining what a web browser does.',
        store: false,
      },
      { timeout_ms: 20_000, maxRetries: 0, signal: AbortSignal.timeout(20_000) },
    );
    const text = z.string().trim().min(1).max(20_000).parse(response.output_text);
    return { characters: text.length };
  }
  async speech(model: string, voice: string) {
    const response = await this.client.interactions.create(
      {
        model,
        input: 'Namaste! Aaj hum browser ke baare mein seekhenge.',
        store: false,
        response_format: { type: 'audio', mime_type: 'audio/wav' },
        generation_config: { speech_config: [{ voice }] },
      },
      { timeout_ms: 20_000, maxRetries: 0, signal: AbortSignal.timeout(20_000) },
    );
    const data = z.string().min(1).max(20_000_000).parse(response.output_audio?.data);
    const audio = Buffer.from(data, 'base64');
    if (
      audio.length < 44 ||
      audio.toString('ascii', 0, 4) !== 'RIFF' ||
      audio.toString('ascii', 8, 12) !== 'WAVE'
    ) {
      throw new Error('Provider did not return the requested WAV container');
    }
    return { bytes: audio.length, format: 'WAV' };
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
    key: apiKey,
  }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`YouTube returned HTTP ${response.status}`);
  const result = z
    .object({ items: z.array(z.object({ id: z.object({ videoId: z.string().min(1) }) })).max(1) })
    .parse(await response.json());
  return { results: result.items.length };
}
