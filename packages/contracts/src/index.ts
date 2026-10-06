import { z } from 'zod';

export const idSchema = z.uuid();
export const generationStateSchema = z.enum(['not_started', 'generating', 'ready', 'failed']);
const shortText = z.string().trim().min(1).max(240);
export const generationInfoSchema = z.strictObject({
  attempts: z.number().int().min(0).max(4),
  maxAttempts: z.literal(4),
  canRetry: z.boolean(),
  error: z.strictObject({ code: shortText, message: z.string().max(500) }).nullable(),
});
export type GenerationInfo = z.infer<typeof generationInfoSchema>;
export const resourceSchema = z
  .strictObject({
    title: shortText,
    url: z
      .url()
      .refine((value) => value.startsWith('https://'), 'Use an HTTPS resource URL')
      .nullable(),
    source: z.enum(['catalogue', 'unverified_suggestion']),
  })
  .refine((resource) => resource.source !== 'catalogue' || resource.url !== null, {
    message: 'Catalogue resources require a URL',
  });
export const lessonBlockSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('heading'), text: shortText }),
  z.strictObject({ type: z.literal('paragraph'), text: z.string().trim().min(1).max(6000) }),
  z.strictObject({
    type: z.literal('code'),
    language: z.string().min(1).max(30),
    code: z
      .string()
      .min(1)
      .max(12000)
      .refine((code) => code.trim().length > 0),
  }),
  z.strictObject({
    type: z.literal('callout'),
    title: shortText,
    text: z.string().trim().min(1).max(2000),
  }),
]);
export const mcqSchema = z
  .strictObject({
    question: z.string().trim().min(1).max(500),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
    correctAnswerIndex: z.number().int().nonnegative(),
    explanation: z.string().trim().min(1).max(2000),
  })
  .refine((question) => question.correctAnswerIndex < question.options.length, {
    path: ['correctAnswerIndex'],
    message: 'Answer must refer to an option',
  })
  .refine(
    (question) =>
      new Set(question.options.map((option) => option.trim().toLowerCase())).size ===
      question.options.length,
    { message: 'Options must be distinct' },
  );
export const lessonContentSchema = z.strictObject({
  blocks: z.array(lessonBlockSchema).min(1).max(80),
  quiz: z.array(mcqSchema).min(4).max(5),
  videoQueries: z.array(shortText).min(1).max(3).optional(),
});
export const generatedLessonContentSchema = lessonContentSchema
  .extend({
    blocks: z.array(lessonBlockSchema).min(3).max(80),
    videoQueries: z.array(shortText).min(1).max(3),
  })
  .refine(
    (content) =>
      content.blocks.some((block) => block.type === 'heading') &&
      content.blocks.some((block) => block.type === 'paragraph'),
    { message: 'Include headings and explanations' },
  )
  .refine(
    (content) =>
      new Set(content.quiz.map((item) => item.question.trim().toLowerCase())).size ===
      content.quiz.length,
    { message: 'Quiz questions must be distinct' },
  );
// Provider drafts contain no identities, ownership, states or arbitrary resource URLs.
export const draftResourceSchema = z.strictObject({
  catalogueId: z.string().min(1).max(60).nullable(),
  title: shortText,
});
export const outlineDraftSchema = z
  .strictObject({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(1).max(2000),
    tags: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
    modules: z
      .array(
        z.strictObject({
          title: shortText,
          description: z.string().trim().min(1).max(1500),
          lessons: z
            .array(
              z.strictObject({
                title: shortText,
                description: z.string().trim().min(1).max(1500),
                objectives: z.array(shortText).min(1).max(8),
                keyTopics: z.array(shortText).min(1).max(10),
                resources: z.array(draftResourceSchema).min(1).max(8),
              }),
            )
            .min(3)
            .max(5),
        }),
      )
      .min(3)
      .max(6),
  })
  .refine(
    (draft) =>
      new Set(draft.modules.map((module) => module.title.toLowerCase())).size ===
        draft.modules.length &&
      draft.modules.every(
        (module) =>
          new Set(module.lessons.map((lesson) => lesson.title.toLowerCase())).size ===
          module.lessons.length,
      ),
    { message: 'Module and lesson titles must be distinct' },
  );
export type OutlineDraft = z.infer<typeof outlineDraftSchema>;
export type GeneratedLessonContent = z.infer<typeof generatedLessonContentSchema>;
export const lessonMetadataSchema = z.strictObject({
  id: idSchema,
  moduleId: idSchema,
  courseId: idSchema,
  position: z.number().int().nonnegative(),
  title: shortText,
  description: z.string().min(1).max(1500),
  objectives: z.array(shortText).min(1).max(8),
  keyTopics: z.array(shortText).min(1).max(10),
  resources: z.array(resourceSchema).max(8),
  generationState: generationStateSchema,
});
export const lessonSchema = lessonMetadataSchema
  .extend({
    contentVersion: z.number().int().positive(),
    contentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    content: lessonContentSchema.nullable(),
    generation: generationInfoSchema.optional(),
  })
  .refine((lesson) => lesson.generationState !== 'ready' || lesson.content !== null, {
    message: 'A ready lesson requires validated content',
    path: ['content'],
  })
  .refine((lesson) => lesson.generationState === 'ready' || lesson.content === null, {
    message: 'Unready content must not be published',
  });
export const moduleSchema = z.strictObject({
  id: idSchema,
  courseId: idSchema,
  position: z.number().int().nonnegative(),
  title: shortText,
  description: z.string().min(1).max(1500),
  lessons: z.array(lessonMetadataSchema).min(3).max(5),
});
const courseSummaryBase = z.strictObject({
  id: idSchema,
  title: z.string().trim().min(3).max(120),
  description: z.string().min(1).max(2000),
  tags: z.array(z.string().min(1).max(40)).max(8),
  isSample: z.boolean(),
  generationState: generationStateSchema,
  moduleCount: z.number().int().min(0).max(6),
  lessonCount: z.number().int().min(0).max(30),
  completedLessonCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  generation: generationInfoSchema.optional(),
});
const validCounts = (course: {
  generationState: string;
  moduleCount: number;
  lessonCount: number;
  completedLessonCount: number;
}) =>
  course.completedLessonCount <= course.lessonCount &&
  (course.generationState === 'ready'
    ? course.moduleCount >= 3 && course.lessonCount >= 9
    : course.moduleCount === 0 && course.lessonCount === 0);
export const courseSummarySchema = courseSummaryBase.refine(validCounts, {
  message: 'Course counts must match its state',
});
export const courseDetailSchema = courseSummaryBase
  .extend({
    modules: z.array(moduleSchema).max(6),
    completedLessonIds: z.array(idSchema).max(30),
  })
  .refine(validCounts, { message: 'Course counts must match its state' })
  .refine(
    (course) => {
      const lessons = course.modules.flatMap((module) => module.lessons);
      const ids = [
        course.id,
        ...course.modules.map((module) => module.id),
        ...lessons.map((lesson) => lesson.id),
      ];
      return (
        course.moduleCount === course.modules.length &&
        course.lessonCount === lessons.length &&
        new Set(ids).size === ids.length &&
        course.modules.every(
          (module, index) =>
            module.courseId === course.id &&
            module.position === index &&
            module.lessons.every(
              (lesson, position) =>
                lesson.courseId === course.id &&
                lesson.moduleId === module.id &&
                lesson.position === position,
            ),
        ) &&
        course.completedLessonIds.every((id) => lessons.some((lesson) => lesson.id === id)) &&
        new Set(course.completedLessonIds).size === course.completedLessonIds.length &&
        course.completedLessonCount === course.completedLessonIds.length
      );
    },
    { message: 'Course identities, ordering and counts must be consistent' },
  );
export const sampleCreateSchema = z.strictObject({
  templateId: z.literal('web-foundations'),
  title: z.string().trim().min(3).max(120).optional(),
});
export const topicCreateSchema = z.strictObject({
  topic: z.string().trim().min(3).max(300),
  requestId: idSchema,
});
export const createCourseSchema = z.union([sampleCreateSchema, topicCreateSchema]);
export const generateLessonRequestSchema = z.strictObject({ retry: z.boolean().optional() });
export const coursesResponseSchema = z.strictObject({
  courses: z.array(courseSummarySchema).max(100),
});
export const courseResponseSchema = z.strictObject({ course: courseDetailSchema });
export const lessonResponseSchema = z.strictObject({ lesson: lessonSchema });
export const apiErrorSchema = z.strictObject({
  error: z.strictObject({ code: z.string(), message: z.string(), requestId: z.string() }),
});

export type LessonBlock = z.infer<typeof lessonBlockSchema>;
export type Mcq = z.infer<typeof mcqSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type LessonMetadata = z.infer<typeof lessonMetadataSchema>;
export type CourseSummary = z.infer<typeof courseSummarySchema>;
export type CourseDetail = z.infer<typeof courseDetailSchema>;
export type CreateCourse = z.infer<typeof createCourseSchema>;

export const enhancementKindSchema = z.enum(['videos', 'transcript', 'audio']);
export type EnhancementKind = z.infer<typeof enhancementKindSchema>;
export const transcriptDraftSchema = z.strictObject({ text: z.string().trim().min(80).max(6000) });
export const videoSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  title: z.string().trim().min(1).max(300),
  channel: z.string().trim().min(1).max(200),
});
export type Video = z.infer<typeof videoSchema>;
const enhancementState = z.strictObject({
  state: generationStateSchema,
  available: z.boolean(),
  generation: generationInfoSchema.optional(),
});
const videosStateSchema = enhancementState.extend({ items: z.array(videoSchema).max(3) });
const transcriptStateSchema = enhancementState
  .extend({ text: z.string().trim().min(80).max(6000).nullable() })
  .refine((entry) => (entry.state === 'ready') === (entry.text !== null));
export const audioAssetSchema = z.strictObject({
  id: idSchema,
  mimeType: z.literal('audio/wav'),
  bytes: z.number().int().min(44).max(12_000_000),
  durationSeconds: z.number().positive().max(240),
});
const audioStateSchema = enhancementState
  .extend({ asset: audioAssetSchema.nullable() })
  .refine((entry) => (entry.state === 'ready') === (entry.asset !== null));
export const enhancementsSchema = z.strictObject({
  videos: videosStateSchema,
  transcript: transcriptStateSchema,
  audio: audioStateSchema,
});
export const enhancementsResponseSchema = z.strictObject({ enhancements: enhancementsSchema });
export type Enhancements = z.infer<typeof enhancementsSchema>;
export const completionRequestSchema = z.strictObject({ completed: z.boolean() });

export { sampleCourse, sampleLessons, SAMPLE_TEMPLATE_ID } from './sample.js';
