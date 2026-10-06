import { mkdir, writeFile } from 'node:fs/promises';
import { outlineDraftSchema, generatedLessonContentSchema } from '@text-to-learn/contracts';
import { resolveResources } from '../server/src/providers/generation.js';
import { evaluationCases } from './fixtures/generation.js';
const results = evaluationCases.map((fixture) => {
  const outline = outlineDraftSchema.parse(fixture.outline);
  const lesson = generatedLessonContentSchema.parse(fixture.lesson);
  const resources = outline.modules.flatMap((module) =>
    module.lessons.flatMap((entry) => resolveResources(entry.resources)),
  );
  return {
    topic: fixture.topic,
    status: 'PASS',
    title: outline.title,
    modules: outline.modules.length,
    lessons: outline.modules.reduce((total, module) => total + module.lessons.length, 0),
    lessonReviewed: outline.modules[0]!.lessons[0]!.title,
    blocks: lesson.blocks.length,
    quizQuestions: lesson.quiz.length,
    correctAnswerIndexes: lesson.quiz.map((item) => item.correctAnswerIndex),
    catalogueLinks: [...new Set(resources.flatMap((item) => (item.url ? [item.url] : [])))],
    unresolvedSuggestions: resources.filter((item) => item.source === 'unverified_suggestion')
      .length,
  };
});
await mkdir('docs/weeks/week-2', { recursive: true });
const report = {
  checkedAt: new Date().toISOString(),
  scope:
    'Authored deterministic fixtures, not live Gemini quality. All three also run through the production API/worker/persistence in generation.test.ts. Manual content review is in evaluation.md.',
  results,
};
await writeFile(
  'docs/weeks/week-2/evaluation-fixtures.json',
  `${JSON.stringify(report, null, 2)}\n`,
);
console.info(JSON.stringify(report, null, 2));
