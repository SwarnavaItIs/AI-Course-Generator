import { GenerationFailure } from './generation.js';

export const MAX_AUDIO_BYTES = 12_000_000;
const invalid = () =>
  new GenerationFailure(
    'INVALID_AUDIO',
    'The speech service returned unsupported or incomplete audio. Please retry.',
  );
export function pcmToWav(pcm: Buffer, sampleRate: number) {
  if (pcm.length % 2 || sampleRate < 8000 || sampleRate > 48000) throw invalid();
  const header = Buffer.alloc(44);
  header.write('RIFF');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
export function normalizeAudio(input: { data: Buffer; mimeType: string; sampleRate?: number }) {
  if (input.data.length > MAX_AUDIO_BYTES)
    throw new GenerationFailure(
      'AUDIO_TOO_LARGE',
      'The audio exceeds the 12 MB limit. Please use a shorter explanation.',
      false,
    );
  const mime = input.mimeType.toLowerCase().split(';')[0]?.trim();
  // Only the provider's declared PCM16 mono format is wrapped. WAV is never wrapped twice.
  const data =
    mime === 'audio/l16' && input.sampleRate ? pcmToWav(input.data, input.sampleRate) : input.data;
  if (
    !['audio/wav', 'audio/x-wav', 'audio/l16'].includes(mime ?? '') ||
    data.length < 44 ||
    data.length > MAX_AUDIO_BYTES ||
    data.toString('ascii', 0, 4) !== 'RIFF' ||
    data.toString('ascii', 8, 12) !== 'WAVE' ||
    data.readUInt32LE(4) + 8 !== data.length
  )
    throw invalid();
  let byteRate = 0,
    alignment = 0,
    dataLength = 0,
    hasFormat = false,
    hasData = false;
  let offset = 12;
  for (; offset + 8 <= data.length;) {
    const name = data.toString('ascii', offset, offset + 4),
      length = data.readUInt32LE(offset + 4),
      start = offset + 8;
    if (start + length > data.length) throw invalid();
    if (name === 'fmt ') {
      if (length < 16 || hasFormat) throw invalid();
      const channels = data.readUInt16LE(start + 2),
        rate = data.readUInt32LE(start + 4);
      byteRate = data.readUInt32LE(start + 8);
      alignment = data.readUInt16LE(start + 12);
      if (
        data.readUInt16LE(start) !== 1 ||
        ![1, 2].includes(channels) ||
        rate < 8000 ||
        rate > 48000 ||
        data.readUInt16LE(start + 14) !== 16 ||
        alignment !== channels * 2 ||
        byteRate !== rate * alignment
      )
        throw invalid();
      hasFormat = true;
    }
    if (name === 'data') {
      if (hasData) throw invalid();
      hasData = true;
      dataLength = length;
    }
    offset = start + length + (length % 2);
    if (offset > data.length) throw invalid();
  }
  const durationSeconds = dataLength / byteRate;
  if (
    offset !== data.length ||
    !hasFormat ||
    !hasData ||
    !dataLength ||
    dataLength % alignment ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds > 240
  )
    throw invalid();
  return { data, mimeType: 'audio/wav' as const, durationSeconds };
}
