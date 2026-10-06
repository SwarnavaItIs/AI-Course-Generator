import type { EnhancementKind, Lesson } from '@text-to-learn/contracts';
import type { EnhancementProvider } from '../../server/src/providers/enhancements.js';
import { pcmToWav } from '../../server/src/providers/audio.js';

// Deterministic test audio verifies the container/player. It does not claim human speech or pronunciation.
export function fixtureWav() {
  const pcm = Buffer.alloc(24000 * 2);
  for (let index = 0; index < 24000; index++)
    pcm.writeInt16LE(Math.round(Math.sin((index / 24000) * 440 * Math.PI * 2) * 1200), index * 2);
  return pcmToWav(pcm, 24000);
}
export class FixtureEnhancementProvider implements EnhancementProvider {
  voice = 'Kore';
  textModel = 'fixture-transcript-v1';
  audioModel = 'fixture-speech-v1';
  calls: { kind: EnhancementKind; input: unknown }[] = [];
  private attempts = new Map<string, number>();
  constructor(private delayMs = 0) {}
  model(kind: EnhancementKind) {
    return kind === 'videos'
      ? 'fixture-youtube-v1'
      : kind === 'audio'
        ? this.audioModel
        : this.textModel;
  }
  available(_kind: EnhancementKind) {
    return true;
  }
  private async delay() {
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
  }
  async videos(queries: string[], _signal: AbortSignal) {
    this.calls.push({ kind: 'videos', input: queries });
    await this.delay();
    return [{ id: 'dQw4w9WgXcQ', title: 'Fixture learning video', channel: 'Test channel' }];
  }
  async transcript(lesson: Lesson, _model: string, _signal: AbortSignal) {
    this.calls.push({ kind: 'transcript', input: lesson.title });
    await this.delay();
    const count = (this.attempts.get(lesson.id) ?? 0) + 1;
    this.attempts.set(lesson.id, count);
    if (lesson.title.includes('Enhancement retry test') && count <= 2)
      return { text: 'Invalid short output' };
    return {
      text: `${lesson.title} को समझने के लिए पहले lesson के objectives देखें। ${lesson.objectives.join(' ')}\n\nTechnical terms को English में ही रखें। उदाहरण पढ़ें, फिर खुद practice करें और knowledge check के answers की explanation से अपनी समझ जाँचें। यह explanation मूल lesson के साथ पढ़ें।`,
    };
  }
  async speech(text: string, _model: string, _voice: string, _signal: AbortSignal) {
    this.calls.push({ kind: 'audio', input: text });
    await this.delay();
    return { data: fixtureWav(), mimeType: 'audio/wav', sampleRate: 24000 };
  }
}
