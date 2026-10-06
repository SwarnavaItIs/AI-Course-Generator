import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  courseDetailSchema,
  courseSummarySchema,
  lessonSchema,
  sampleCourse,
  sampleLessons,
  type CreateCourse,
  type CourseDetail,
  type CourseSummary,
  type GenerationInfo,
} from '@text-to-learn/contracts';
import {
  CourseModel,
  LessonModel,
  ModuleModel,
  ProgressModel,
  UserModel,
  JobModel,
  EnhancementModel,
  AudioAssetModel,
  type JobRecord,
  type CourseRecord,
} from '../models.js';
import { ApiError } from '../errors.js';

export async function requireOwnedCourse(ownerSub: string, courseId: string) {
  const course = await CourseModel.findOne({
    _id: courseId,
    ownerSub,
  }).lean();
  if (!course) throw new ApiError(404, 'NOT_FOUND', 'This course could not be found.');
  return course;
}
export function generationInfo(job: JobRecord): GenerationInfo {
  return {
    attempts: job.attempts,
    maxAttempts: 4,
    canRetry: job.status === 'failed' && job.attempts < 4,
    error: job.status === 'failed' ? job.error : null,
  };
}
function summary(
  course: CourseRecord,
  completedLessonCount: number,
  job?: JobRecord,
): CourseSummary {
  return courseSummarySchema.parse({
    id: course._id,
    title: course.title,
    description: course.description,
    tags: course.tags,
    isSample: course.isSample,
    generationState: course.generationState,
    moduleCount: course.moduleCount,
    lessonCount: course.lessonCount,
    completedLessonCount,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
    ...(job ? { generation: generationInfo(job) } : {}),
  });
}
export async function listCourses(ownerSub: string): Promise<CourseSummary[]> {
  const courses = await CourseModel.find({ ownerSub })
    .sort({ createdAt: -1, _id: 1 })
    .limit(100)
    .lean();
  const progress = await ProgressModel.find({
    ownerSub,
    courseId: { $in: courses.map((course) => course._id) },
  }).lean();
  const completed = new Map(
    progress.map((record) => [record.courseId, record.completedLessonIds.length]),
  );
  const jobs = await JobModel.find({
    ownerSub,
    kind: 'course',
    courseId: { $in: courses.map((course) => course._id) },
  }).lean();
  return courses.map((course) =>
    summary(
      course,
      completed.get(course._id) ?? 0,
      jobs.find((job) => job.courseId === course._id),
    ),
  );
}
export async function getCourse(ownerSub: string, courseId: string): Promise<CourseDetail> {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(
      async () => {
        const course = await CourseModel.findOne({ _id: courseId, ownerSub })
          .session(session)
          .lean();
        if (!course) throw new ApiError(404, 'NOT_FOUND', 'This course could not be found.');
        const modules = await ModuleModel.find({ courseId })
          .sort({ position: 1, _id: 1 })
          .session(session)
          .lean();
        const lessons = await LessonModel.find({ courseId })
          .sort({ position: 1, _id: 1 })
          .session(session)
          .lean();
        const progress = await ProgressModel.findOne({ ownerSub, courseId })
          .session(session)
          .lean();
        const job = await JobModel.findOne({ targetKey: `course:${courseId}`, ownerSub })
          .session(session)
          .lean();
        return courseDetailSchema.parse({
          ...summary(course, progress?.completedLessonIds.length ?? 0, job ?? undefined),
          completedLessonIds: progress?.completedLessonIds ?? [],
          modules: modules.map((module) => ({
            id: module._id,
            courseId,
            position: module.position,
            title: module.title,
            description: module.description,
            lessons: lessons
              .filter((lesson) => lesson.moduleId === module._id)
              .map((lesson) => ({
                id: lesson._id,
                courseId,
                moduleId: module._id,
                position: lesson.position,
                title: lesson.title,
                description: lesson.description,
                objectives: lesson.objectives,
                keyTopics: lesson.keyTopics,
                resources: lesson.resources,
                generationState: lesson.generationState,
              })),
          })),
        });
      },
      { readConcern: { level: 'snapshot' } },
    );
  } finally {
    await session.endSession();
  }
}
export async function getLesson(ownerSub: string, courseId: string, lessonId: string) {
  await requireOwnedCourse(ownerSub, courseId);
  const lesson = await LessonModel.findOne({ _id: lessonId, courseId }).lean();
  if (!lesson || !(await ModuleModel.exists({ _id: lesson.moduleId, courseId }))) {
    throw new ApiError(404, 'NOT_FOUND', 'This lesson could not be found.');
  }
  const {
    _id,
    __v: _version,
    createdAt: _created,
    updatedAt: _updated,
    generationModel: _model,
    promptVersion: _prompt,
    ...fields
  } = lesson;
  const job = await JobModel.findOne({ targetKey: `lesson:${lessonId}`, ownerSub }).lean();
  return lessonSchema.parse({
    id: _id,
    ...fields,
    ...(job ? { generation: generationInfo(job) } : {}),
  });
}
export async function createCourse(ownerSub: string, input: CreateCourse): Promise<CourseDetail> {
  if (!('templateId' in input))
    throw new ApiError(400, 'INVALID_INPUT', 'Use topic generation for this request.');
  const courseId = randomUUID();
  const moduleIds = new Map(sampleCourse.modules.map((module) => [module.id, randomUUID()]));
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await UserModel.updateOne(
        { _id: ownerSub },
        { $setOnInsert: { auth0Sub: ownerSub, savedCourseCount: 0 } },
        { upsert: true, session },
      );
      const user = await UserModel.findOneAndUpdate(
        { _id: ownerSub, savedCourseCount: { $lt: 100 } },
        { $inc: { savedCourseCount: 1 } },
        { session, returnDocument: 'after' },
      );
      if (!user)
        throw new ApiError(
          409,
          'COURSE_LIMIT',
          'Your library is full. Delete a course before adding another.',
        );
      await CourseModel.create(
        [
          {
            _id: courseId,
            ownerSub,
            title: input.title ?? sampleCourse.title,
            description: sampleCourse.description,
            tags: sampleCourse.tags,
            isSample: true,
            generationState: 'ready',
            moduleCount: 3,
            lessonCount: 9,
          },
        ],
        { session },
      );
      await ModuleModel.insertMany(
        sampleCourse.modules.map((module) => ({
          _id: moduleIds.get(module.id),
          courseId,
          position: module.position,
          title: module.title,
          description: module.description,
        })),
        { session },
      );
      await LessonModel.insertMany(
        sampleLessons.map((sample) => {
          const validated = lessonSchema.parse({
            ...sample,
            id: randomUUID(),
            courseId,
            moduleId: moduleIds.get(sample.moduleId),
            contentHash: createHash('sha256').update(JSON.stringify(sample.content)).digest('hex'),
          });
          const { id, ...fields } = validated;
          return { _id: id, ...fields };
        }),
        { session },
      );
      await ProgressModel.create(
        [{ _id: randomUUID(), courseId, ownerSub, completedLessonIds: [] }],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
  return getCourse(ownerSub, courseId);
}
export async function deleteCourse(ownerSub: string, courseId: string) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const deleted = await CourseModel.deleteOne({ _id: courseId, ownerSub }, { session });
      if (deleted.deletedCount !== 1)
        throw new ApiError(404, 'NOT_FOUND', 'This course could not be found.');
      await LessonModel.deleteMany({ courseId }, { session });
      await ModuleModel.deleteMany({ courseId }, { session });
      await ProgressModel.deleteMany({ courseId }, { session });
      await JobModel.deleteMany({ courseId }, { session });
      await EnhancementModel.deleteMany({ courseId }, { session });
      await AudioAssetModel.updateMany({ courseId }, { $set: { status: 'deleting' } }, { session });
      await UserModel.updateOne(
        { _id: ownerSub, savedCourseCount: { $gt: 0 } },
        { $inc: { savedCourseCount: -1 } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
}
export async function setCompletion(
  ownerSub: string,
  courseId: string,
  lessonId: string,
  completed: boolean,
) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const course = await CourseModel.findOneAndUpdate(
        { _id: courseId, ownerSub, generationState: 'ready' },
        { $inc: { enhancementRevision: 1 } },
        { session },
      ).lean();
      if (!course) throw new ApiError(404, 'NOT_FOUND', 'This course could not be found.');
      const lesson = await LessonModel.findOne({ _id: lessonId, courseId }).session(session).lean();
      if (
        !lesson ||
        !(await ModuleModel.exists({ _id: lesson.moduleId, courseId }).session(session))
      )
        throw new ApiError(404, 'NOT_FOUND', 'This lesson could not be found.');
      if (lesson.generationState !== 'ready')
        throw new ApiError(
          409,
          'LESSON_NOT_READY',
          'Finish generating this lesson before marking it complete.',
        );
      await ProgressModel.updateOne(
        { courseId, ownerSub },
        completed
          ? { $addToSet: { completedLessonIds: lessonId } }
          : { $pull: { completedLessonIds: lessonId } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
  return getCourse(ownerSub, courseId);
}
