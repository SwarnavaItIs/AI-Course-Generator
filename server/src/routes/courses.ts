import { Router } from 'express';
import {
  createCourseSchema,
  generateLessonRequestSchema,
  idSchema,
} from '@text-to-learn/contracts';
import { ownerFrom } from '../auth.js';
import * as courses from '../services/courses.js';
import * as generation from '../services/generation.js';
import type { GenerationProvider } from '../providers/generation.js';

export function createCoursesRouter(provider: GenerationProvider) {
  const coursesRouter = Router();
  coursesRouter.get('/', async (request, response) => {
    response.json({ courses: await courses.listCourses(ownerFrom(request)) });
  });
  coursesRouter.post('/', async (request, response) => {
    const input = createCourseSchema.parse(request.body);
    const course =
      'topic' in input
        ? await generation.submitTopic(provider, ownerFrom(request), input)
        : await courses.createCourse(ownerFrom(request), input);
    response
      .status('topic' in input ? (course.generationState === 'ready' ? 200 : 202) : 201)
      .location(`/api/courses/${course.id}`)
      .json({ course });
  });
  coursesRouter.post('/:courseId/retry', async (request, response) => {
    generateLessonRequestSchema.parse(request.body);
    const course = await generation.retryCourse(
      provider,
      ownerFrom(request),
      idSchema.parse(request.params.courseId),
    );
    response.status(course.generationState === 'generating' ? 202 : 200).json({ course });
  });
  coursesRouter.post('/:courseId/lessons/:lessonId/generate', async (request, response) => {
    const input = generateLessonRequestSchema.parse(request.body);
    const lesson = await generation.requestLesson(
      provider,
      ownerFrom(request),
      idSchema.parse(request.params.courseId),
      idSchema.parse(request.params.lessonId),
      input.retry,
    );
    response.status(lesson.generationState === 'generating' ? 202 : 200).json({ lesson });
  });
  coursesRouter.get('/:courseId', async (request, response) => {
    response.json({
      course: await courses.getCourse(ownerFrom(request), idSchema.parse(request.params.courseId)),
    });
  });
  coursesRouter.get('/:courseId/lessons/:lessonId', async (request, response) => {
    response.json({
      lesson: await courses.getLesson(
        ownerFrom(request),
        idSchema.parse(request.params.courseId),
        idSchema.parse(request.params.lessonId),
      ),
    });
  });
  coursesRouter.delete('/:courseId', async (request, response) => {
    await courses.deleteCourse(ownerFrom(request), idSchema.parse(request.params.courseId));
    response.status(204).end();
  });
  return coursesRouter;
}
