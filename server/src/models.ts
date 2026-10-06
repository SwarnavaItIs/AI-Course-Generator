import mongoose, { Schema } from 'mongoose';
import {
  lessonContentSchema,
  type Lesson,
  type EnhancementKind,
  type Video,
} from '@text-to-learn/contracts';

interface UserRecord {
  _id: string;
  auth0Sub: string;
  savedCourseCount: number;
  generationRevision: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface CourseRecord {
  _id: string;
  ownerSub: string;
  title: string;
  description: string;
  tags: string[];
  isSample: boolean;
  generationState: 'not_started' | 'generating' | 'ready' | 'failed';
  moduleCount: number;
  lessonCount: number;
  topic?: string;
  requestId?: string;
  generationModel?: string;
  promptVersion?: number;
  enhancementRevision: number;
  createdAt: Date;
  updatedAt: Date;
}
interface ModuleRecord {
  _id: string;
  courseId: string;
  position: number;
  title: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}
type LessonRecord = Omit<Lesson, 'id' | 'generation'> & {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
  generationModel?: string;
  promptVersion?: number;
};
export interface JobRecord {
  _id: string;
  targetKey: string;
  kind: 'course' | 'lesson' | EnhancementKind;
  enhancementId?: string;
  courseId: string;
  lessonId?: string;
  ownerSub: string;
  model: string;
  promptVersion: number;
  status: 'queued' | 'running' | 'ready' | 'failed';
  attempts: number;
  runLimit: number;
  leaseToken: string | null;
  leaseUntil: Date | null;
  nextAttemptAt: Date;
  error: { code: string; message: string } | null;
  createdAt: Date;
  updatedAt: Date;
}
interface ProgressRecord {
  _id: string;
  courseId: string;
  ownerSub: string;
  completedLessonIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserRecord>(
  {
    _id: { type: String, required: true },
    auth0Sub: { type: String, required: true, unique: true },
    savedCourseCount: { type: Number, required: true, default: 0, min: 0, max: 100 },
    generationRevision: { type: Number, default: 0 },
  },
  { timestamps: true },
);
const courseSchema = new Schema<CourseRecord>(
  {
    _id: { type: String, required: true },
    ownerSub: { type: String, required: true },
    title: { type: String, required: true, minlength: 3, maxlength: 120 },
    description: { type: String, required: true, maxlength: 2000 },
    tags: { type: [String], required: true },
    isSample: { type: Boolean, required: true },
    generationState: {
      type: String,
      enum: ['not_started', 'generating', 'ready', 'failed'],
      required: true,
    },
    moduleCount: { type: Number, min: 0, max: 6, required: true },
    lessonCount: { type: Number, min: 0, max: 30, required: true },
    topic: String,
    requestId: String,
    generationModel: String,
    promptVersion: Number,
    enhancementRevision: { type: Number, default: 0 },
  },
  { timestamps: true },
);
courseSchema.index({ ownerSub: 1, createdAt: -1, _id: 1 });
courseSchema.index(
  { ownerSub: 1, requestId: 1 },
  { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } },
);
const moduleSchema = new Schema<ModuleRecord>(
  {
    _id: { type: String, required: true },
    courseId: { type: String, required: true, ref: 'Course' },
    position: { type: Number, required: true, min: 0 },
    title: { type: String, required: true },
    description: { type: String, required: true },
  },
  { timestamps: true },
);
moduleSchema.index({ courseId: 1, position: 1 }, { unique: true });
const resourceSchema = new Schema(
  {
    title: String,
    url: String,
    source: { type: String, enum: ['catalogue', 'unverified_suggestion'] },
  },
  { _id: false },
);
const lessonSchema = new Schema<LessonRecord>(
  {
    _id: { type: String, required: true },
    courseId: { type: String, required: true, ref: 'Course' },
    moduleId: { type: String, required: true, ref: 'Module' },
    position: { type: Number, required: true, min: 0 },
    title: { type: String, required: true },
    description: { type: String, required: true },
    objectives: { type: [String], required: true },
    keyTopics: { type: [String], required: true },
    resources: { type: [resourceSchema], required: true },
    generationState: {
      type: String,
      enum: ['not_started', 'generating', 'ready', 'failed'],
      required: true,
    },
    contentVersion: { type: Number, required: true, min: 1 },
    contentHash: { type: String, default: null },
    generationModel: String,
    promptVersion: Number,
    content: {
      type: Schema.Types.Mixed,
      default: null,
      validate: (value: unknown) => value === null || lessonContentSchema.safeParse(value).success,
    },
  },
  { timestamps: true },
);
lessonSchema.index({ courseId: 1, moduleId: 1, position: 1 }, { unique: true });
const progressSchema = new Schema<ProgressRecord>(
  {
    _id: { type: String, required: true },
    courseId: { type: String, required: true, ref: 'Course' },
    ownerSub: { type: String, required: true },
    completedLessonIds: { type: [String], required: true, default: [] },
  },
  { timestamps: true },
);
progressSchema.index({ courseId: 1, ownerSub: 1 }, { unique: true });
const jobSchema = new Schema<JobRecord>(
  {
    _id: { type: String, required: true },
    targetKey: { type: String, required: true, unique: true },
    kind: {
      type: String,
      required: true,
      enum: ['course', 'lesson', 'videos', 'transcript', 'audio'],
    },
    enhancementId: String,
    courseId: { type: String, required: true },
    lessonId: String,
    ownerSub: { type: String, required: true },
    model: { type: String, required: true },
    promptVersion: { type: Number, required: true },
    status: { type: String, required: true, enum: ['queued', 'running', 'ready', 'failed'] },
    attempts: { type: Number, default: 0, min: 0, max: 4 },
    runLimit: { type: Number, default: 2, min: 2, max: 4 },
    leaseToken: { type: String, default: null },
    leaseUntil: { type: Date, default: null },
    nextAttemptAt: { type: Date, required: true },
    error: { type: new Schema({ code: String, message: String }, { _id: false }), default: null },
  },
  { timestamps: true },
);
jobSchema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 });
jobSchema.index({ courseId: 1 });

export const UserModel = mongoose.model<UserRecord>('User', userSchema);
export const CourseModel = mongoose.model<CourseRecord>('Course', courseSchema);
export const ModuleModel = mongoose.model<ModuleRecord>('Module', moduleSchema);
export const LessonModel = mongoose.model<LessonRecord>('Lesson', lessonSchema);
export const ProgressModel = mongoose.model<ProgressRecord>('Progress', progressSchema);
export const JobModel = mongoose.model<JobRecord>('GenerationJob', jobSchema);
export interface EnhancementRecord {
  _id: string;
  cacheKey: string;
  ownerSub: string;
  courseId: string;
  lessonId: string;
  kind: EnhancementKind;
  sourceHash: string;
  contentVersion: number;
  model: string;
  language: string;
  voice: string;
  generationState: 'generating' | 'ready' | 'failed';
  videos: Video[];
  transcript: string | null;
  transcriptHash: string | null;
  audioAssetId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
const enhancementSchema = new Schema<EnhancementRecord>(
  {
    _id: { type: String, required: true },
    cacheKey: { type: String, required: true, unique: true },
    ownerSub: { type: String, required: true },
    courseId: { type: String, required: true },
    lessonId: { type: String, required: true },
    kind: { type: String, required: true, enum: ['videos', 'transcript', 'audio'] },
    sourceHash: { type: String, required: true },
    contentVersion: Number,
    model: String,
    language: String,
    voice: String,
    generationState: { type: String, required: true, enum: ['generating', 'ready', 'failed'] },
    videos: {
      type: [new Schema({ id: String, title: String, channel: String }, { _id: false })],
      default: [],
    },
    transcript: { type: String, default: null },
    transcriptHash: { type: String, default: null },
    audioAssetId: { type: String, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);
enhancementSchema.index({ courseId: 1 });
enhancementSchema.index({ expiresAt: 1 });
export const EnhancementModel = mongoose.model<EnhancementRecord>('Enhancement', enhancementSchema);
export interface AudioAssetRecord {
  _id: string;
  fileId: string;
  ownerSub: string;
  courseId: string;
  lessonId: string;
  enhancementId: string;
  status: 'uploading' | 'ready' | 'deleting';
  bytes: number;
  durationSeconds: number;
  mimeType: 'audio/wav';
  cleanupAfter: Date;
  createdAt: Date;
  updatedAt: Date;
}
const audioAssetRecordSchema = new Schema<AudioAssetRecord>(
  {
    _id: { type: String, required: true },
    fileId: { type: String, required: true, unique: true },
    ownerSub: String,
    courseId: String,
    lessonId: String,
    enhancementId: String,
    status: { type: String, required: true, enum: ['uploading', 'ready', 'deleting'] },
    bytes: Number,
    durationSeconds: Number,
    mimeType: { type: String, enum: ['audio/wav'] },
    cleanupAfter: { type: Date, required: true },
  },
  { timestamps: true },
);
audioAssetRecordSchema.index({ courseId: 1 });
audioAssetRecordSchema.index({ status: 1, cleanupAfter: 1 });
export const AudioAssetModel = mongoose.model<AudioAssetRecord>(
  'AudioAsset',
  audioAssetRecordSchema,
);
export async function initializeIndexes() {
  await Promise.all([
    UserModel.init(),
    CourseModel.init(),
    ModuleModel.init(),
    LessonModel.init(),
    ProgressModel.init(),
    JobModel.init(),
    EnhancementModel.init(),
    AudioAssetModel.init(),
  ]);
}
