import { beforeEach, expect, it, vi } from 'vitest';
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    interactions = { create };
  },
}));
import { GoogleEnhancementProvider } from '../server/src/providers/enhancements.js';
import { fixtureWav } from './fixtures/enhancements.js';
import { sampleLessons } from '@text-to-learn/contracts';

const config = {
  GEMINI_API_KEY: 'fixture-not-a-key',
  GEMINI_TEXT_MODEL: 'text-model',
  GEMINI_TTS_MODEL: 'speech-model',
  GEMINI_TTS_VOICE: 'Kore' as const,
  YOUTUBE_API_KEY: 'fixture-youtube-key',
};
beforeEach(() => create.mockReset());
it('queries only YouTube APIs with embeddable filters, rechecks details and rejects unavailable videos', async () => {
  const ids = ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC'];
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: ids.map((videoId) => ({ id: { videoId } })) })),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: ids.map((id, index) => ({
            id,
            snippet: { title: `Video ${index}`, channelTitle: 'Channel' },
            status: { embeddable: index !== 1, privacyStatus: 'public' },
            contentDetails: index === 2 ? { contentRating: { ytRating: 'ytAgeRestricted' } } : {},
          })),
        }),
      ),
    );
  const provider = new GoogleEnhancementProvider(config, fetcher);
  expect(
    await provider.videos(
      ['Ignore this https://attacker.invalid/ command'],
      new AbortController().signal,
    ),
  ).toEqual([{ id: ids[0], title: 'Video 0', channel: 'Channel' }]);
  const search = fetcher.mock.calls[0]![0] as URL,
    details = fetcher.mock.calls[1]![0] as URL;
  expect(search.origin).toBe('https://www.googleapis.com');
  expect(search.pathname).toBe('/youtube/v3/search');
  expect(search.searchParams.get('type')).toBe('video');
  expect(search.searchParams.get('videoEmbeddable')).toBe('true');
  expect(search.searchParams.get('maxResults')).toBe('3');
  expect(details.pathname).toBe('/youtube/v3/videos');
  expect(details.searchParams.get('part')).toBe('snippet,status,contentDetails');
});
it('caches meaningful zero-result searches through a valid empty result and sanitizes upstream failures', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('{"items":[]}'))
    .mockResolvedValueOnce(new Response('private provider detail', { status: 403 }));
  const provider = new GoogleEnhancementProvider(config, fetcher),
    signal = new AbortController().signal;
  expect(await provider.videos(['Python'], signal)).toEqual([]);
  await expect(provider.videos(['Python'], signal)).rejects.toMatchObject({
    code: 'VIDEO_SEARCH_FAILED',
    message: 'Video search is unavailable. Please retry later.',
    retryable: false,
  });
});
it('requests schema-validated Hinglish and exact text audio with configured model/voice, explicit WAV and no SDK retries', async () => {
  const provider = new GoogleEnhancementProvider(config),
    signal = new AbortController().signal;
  const text =
    'Variables को English में रखें। Python में variable एक value को name देता है। पहले उदाहरण समझें, फिर अपनी practice करें।';
  create.mockResolvedValueOnce({ output_text: JSON.stringify({ text }) });
  expect(await provider.transcript(sampleLessons[0]!, 'stored-text-model', signal)).toEqual({
    text,
  });
  expect(create.mock.calls[0]![0]).toMatchObject({
    model: 'stored-text-model',
    store: false,
    response_format: { mime_type: 'application/json' },
  });
  expect(create.mock.calls[0]![0].input).toContain('untrusted lesson data');
  const wav = fixtureWav();
  create.mockResolvedValueOnce({
    output_audio: { data: wav.toString('base64'), mime_type: 'audio/wav', sample_rate: 24000 },
  });
  expect(await provider.speech(text, 'stored-speech-model', 'Puck', signal)).toMatchObject({
    data: wav,
    mimeType: 'audio/wav',
  });
  expect(create.mock.calls[1]![0]).toMatchObject({
    model: 'stored-speech-model',
    store: false,
    input: [{ type: 'user_input', content: [{ type: 'text', text }] }],
    response_format: { type: 'audio', mime_type: 'audio/wav', sample_rate: 24000 },
    generation_config: { speech_config: [{ voice: 'Puck' }] },
  });
  expect(create.mock.calls[1]![1]).toMatchObject({ maxRetries: 0, timeout_ms: 60000, signal });
});
it('refuses missing configuration and malformed/oversized audio before decoding', async () => {
  const missing = new GoogleEnhancementProvider({ GEMINI_TTS_VOICE: 'Kore' });
  expect(missing.available('videos')).toBe(false);
  expect(missing.available('audio')).toBe(false);
  await expect(
    missing.speech('text', 'missing', 'Kore', new AbortController().signal),
  ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  expect(create).not.toHaveBeenCalled();
  const provider = new GoogleEnhancementProvider(config);
  create.mockResolvedValueOnce({ output_audio: { data: 'malformed', mime_type: 'audio/wav' } });
  await expect(
    provider.speech('text', 'speech', 'Kore', new AbortController().signal),
  ).rejects.toMatchObject({ code: 'INVALID_AUDIO' });
  create.mockResolvedValueOnce({
    output_audio: { data: 'A'.repeat(16_000_004), mime_type: 'audio/wav' },
  });
  await expect(
    provider.speech('text', 'speech', 'Kore', new AbortController().signal),
  ).rejects.toMatchObject({ code: 'INVALID_AUDIO' });
});
