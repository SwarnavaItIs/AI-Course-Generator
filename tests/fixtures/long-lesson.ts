import { lessonSchema, sampleLessons } from '@text-to-learn/contracts';
const base = sampleLessons[1]!;
const paragraph = Array.from(
  { length: 28 },
  (_, index) =>
    `Sentence ${index + 1}: Semantic HTML gives documents meaningful structure. Learners should understand why a heading describes the following section, how paragraphs explain ideas, and where a useful example belongs. `,
).join('');
const code = Array.from(
  { length: 90 },
  (_, index) =>
    `// Code line ${String(index + 1).padStart(3, '0')}: every source line must survive pagination\nconst example${index + 1} = "${'veryLongIdentifier'.repeat(index % 15 === 0 ? 12 : 2)}";`,
).join('\n');
export const longLesson = lessonSchema.parse({
  ...base,
  title: 'Long lesson: complete content across pages',
  description:
    'A deliberately long authored export fixture with oversized paragraphs, code, links, Unicode and MCQ answers.',
  content: {
    blocks: [
      { type: 'heading', text: 'START_SENTINEL · A document with meaningful structure' },
      { type: 'paragraph', text: paragraph },
      { type: 'heading', text: 'Middle of the lesson' },
      { type: 'paragraph', text: paragraph },
      {
        type: 'code',
        language: 'javascript',
        code: `${code}\n// CODE_END_SENTINEL: all 90 lines included.`,
      },
      {
        type: 'paragraph',
        text: `END_SENTINEL · No content should be missing. Hindi-English: variables को English में रखें।\n${'unbrokenWord'.repeat(90)}`,
      },
      {
        type: 'callout',
        title: 'Check your work',
        text: 'The final MCQ answer section must be exported even when the application sidebar is closed.',
      },
    ],
    quiz: base.content!.quiz,
    videoQueries: ['semantic HTML document structure tutorial'],
  },
});
export const longVideos = [
  { id: 'AAAAAAAAAAA', title: 'Semantic HTML reference video', channel: 'Fixture channel' },
];
