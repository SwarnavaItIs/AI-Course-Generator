import { describe, expect, it } from 'vitest';
import {
  courseDetailSchema,
  createCourseSchema,
  lessonSchema,
  lessonContentSchema,
  generatedLessonContentSchema,
  outlineDraftSchema,
  sampleCourse,
  sampleLessons,
} from '@text-to-learn/contracts';
import { evaluationCases } from './fixtures/generation.js';

describe('shared content boundaries', () => {
  it('validates the complete authored sample, unique identities, and parent references', () => {
    expect(courseDetailSchema.parse(sampleCourse)).toEqual(sampleCourse);
    const ids = new Set([
      sampleCourse.id,
      ...sampleCourse.modules.map((module) => module.id),
      ...sampleLessons.map((lesson) => lesson.id),
    ]);
    expect(ids.size).toBe(13);
    for (const lesson of sampleLessons) {
      expect(lessonSchema.parse(lesson)).toEqual(lesson);
      expect(
        sampleCourse.modules
          .find((module) => module.id === lesson.moduleId)
          ?.lessons.some((item) => item.id === lesson.id),
      ).toBe(true);
      expect(lesson.courseId).toBe(sampleCourse.id);
    }
  });
  it('rejects ready lessons without content, invalid quiz answers, and arbitrary blocks', () => {
    expect(lessonSchema.safeParse({ ...sampleLessons[0], content: null }).success).toBe(false);
    const content = structuredClone(sampleLessons[0]!.content!);
    content.quiz[0]!.correctAnswerIndex = 99;
    expect(lessonContentSchema.safeParse(content).success).toBe(false);
    expect(
      lessonContentSchema.safeParse({
        ...sampleLessons[0]!.content,
        blocks: [{ type: 'html', html: '<script>alert(1)</script>' }],
      }).success,
    ).toBe(false);
  });
  it('bounds titles and rejects client supplied ownership', () => {
    expect(
      createCourseSchema.safeParse({ templateId: 'web-foundations', title: '  ' }).success,
    ).toBe(false);
    expect(
      createCourseSchema.safeParse({ templateId: 'web-foundations', title: 'x'.repeat(121) })
        .success,
    ).toBe(false);
    expect(
      createCourseSchema.safeParse({ templateId: 'web-foundations', ownerSub: 'another-user' })
        .success,
    ).toBe(false);
  });
  it('rejects fabricated resource URLs, empty explanations, missing video queries and inconsistent course references', () => {
    const fixture = evaluationCases[0]!;
    const draft = structuredClone(fixture.outline);
    Object.assign(draft.modules[0]!.lessons[0]!.resources[0]!, { url: 'https://invented.invalid' });
    expect(outlineDraftSchema.safeParse(draft).success).toBe(false);
    const content = structuredClone(fixture.lesson);
    content.quiz[0]!.explanation = '   ';
    expect(generatedLessonContentSchema.safeParse(content).success).toBe(false);
    expect(
      generatedLessonContentSchema.safeParse({ ...fixture.lesson, videoQueries: [] }).success,
    ).toBe(false);
    const course = structuredClone(sampleCourse);
    course.modules[0]!.lessons[0]!.courseId = '00000000-0000-4000-8000-000000000999';
    expect(courseDetailSchema.safeParse(course).success).toBe(false);
  });
});
