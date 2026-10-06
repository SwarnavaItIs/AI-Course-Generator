import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Layers,
  Trash2,
} from 'lucide-react';
import {
  courseResponseSchema,
  lessonResponseSchema,
  sampleCourse,
  sampleLessons,
  type CourseDetail,
  type Lesson,
} from '@text-to-learn/contracts';
import { useApi } from '../api';
import { ErrorState, GenerationPanel, LessonContent, Loading } from '../components/common';
import { LessonTools } from '../components/lesson-tools';

function useCourse(preview: boolean, courseId?: string) {
  const api = useApi();
  const [course, setCourse] = useState<CourseDetail | null>(preview ? sampleCourse : null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pollUntil = Date.now() + 300_000;
    setError(null);
    if (preview) {
      setCourse(sampleCourse);
      return;
    }
    setCourse(null);
    const load = async () => {
      try {
        const result = await api(`/api/courses/${courseId}`, courseResponseSchema, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setCourse(result.course);
        if (result.course.generationState === 'generating' && Date.now() < pollUntil)
          timer = setTimeout(() => {
            void load();
          }, 2000);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure);
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [api, preview, courseId, reload]);
  return { course, error, setCourse, retry: () => setReload((value) => value + 1) };
}

export function CourseOverview({ preview = false }: { preview?: boolean }) {
  const { courseId } = useParams();
  const { course, error, retry } = useCourse(preview, courseId);
  const api = useApi();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);
  const [generationError, setGenerationError] = useState<unknown>(null);
  const base = preview ? '/sample' : `/courses/${courseId}`;
  if (error) return <ErrorState error={error} retry={retry} />;
  if (!course) return <Loading text="Opening your course…" />;
  const lessons = course.modules.flatMap((module) => module.lessons);
  const nextLesson =
    lessons.find((lesson) => !course.completedLessonIds.includes(lesson.id)) ?? lessons[0];
  const retryGeneration = async () => {
    setGenerationError(null);
    try {
      await api(`/api/courses/${course.id}/retry`, courseResponseSchema, {
        method: 'POST',
        body: {},
      });
      retry();
    } catch (failure) {
      setGenerationError(failure);
    }
  };
  const remove = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api(`/api/courses/${course.id}`, null, { method: 'DELETE' });
      navigate('/library');
    } catch (failure) {
      setDeleteError(failure);
      setDeleting(false);
    }
  };
  return (
    <>
      <Link to={preview ? '/' : '/library'} className="back-link">
        <ArrowLeft size={16} />
        Back to my library
      </Link>
      <div className="course-heading">
        <div>
          <p className="eyebrow">
            {preview ? 'EXPLORE THE LEARNING EXPERIENCE' : 'ONE LESSON AT A TIME'}
          </p>
          <span className="badge light">{course.isSample ? 'AUTHORED SAMPLE' : 'AI COURSE'}</span>
          <h1>{course.title}</h1>
          <p>{course.description}</p>
          <div className="tag-row">
            {course.tags.map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="course-heading-art" aria-hidden="true">
          <span>&lt;/&gt;</span>
          <i />
        </div>
      </div>
      {nextLesson && (
        <div className="course-action-bar">
          <div className="course-meta">
            <Layers size={17} />
            {course.moduleCount} modules<span>·</span>
            <BookOpen size={17} />
            {course.lessonCount} lessons
          </div>
          <Link to={`${base}/lessons/${nextLesson.id}`} className="button">
            {course.completedLessonCount > 0 ? 'Continue learning' : 'Start learning'}
            <ArrowRight size={17} />
          </Link>
        </div>
      )}
      {Boolean(generationError) && <ErrorState error={generationError} />}
      {course.generationState !== 'ready' && (
        <GenerationPanel
          subject="course"
          state={course.generationState}
          info={course.generation}
          refresh={retry}
          retry={() => {
            void retryGeneration();
          }}
        />
      )}
      {preview && (
        <div className="preview-note">
          <BookOpen size={18} />
          <p>
            You’re exploring an authored sample.{' '}
            <Link to="/library">Sign in to save your own copy.</Link>
          </p>
        </div>
      )}
      <div className="overview-grid">
        <section>
          {course.modules.length > 0 && (
            <div className="section-title-row">
              <div>
                <p className="eyebrow">YOUR PATH THROUGH THE COURSE</p>
                <h2>Small steps. Solid understanding.</h2>
              </div>
            </div>
          )}
          <div className="module-list">
            {course.modules.map((module, index) => (
              <section className="module-card" key={module.id}>
                <div className="module-header">
                  <span className="module-number">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <h3>{module.title}</h3>
                    <p>{module.description}</p>
                  </div>
                  <span className="quiet-label">{module.lessons.length} lessons</span>
                </div>
                <ol>
                  {module.lessons.map((lesson) => (
                    <li key={lesson.id}>
                      <Link to={`${base}/lessons/${lesson.id}`}>
                        <span className="lesson-list-icon">
                          {course.completedLessonIds.includes(lesson.id) ? (
                            <CheckCircle2 size={17} />
                          ) : (
                            <BookOpen size={17} />
                          )}
                        </span>
                        <span>
                          <strong>{lesson.title}</strong>
                          <small>{lesson.keyTopics.join(' · ')}</small>
                        </span>
                        <ArrowUpRightIcon />
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </section>
        <aside className="course-detail-aside">
          {lessons.length > 0 && (
            <div className="overview-note">
              <p className="eyebrow">BUILD A STRONG FOUNDATION</p>
              <h3>What you’ll take away</h3>
              <ul>
                {lessons
                  .flatMap((lesson) => lesson.objectives)
                  .slice(0, 4)
                  .map((objective) => (
                    <li key={objective}>{objective}</li>
                  ))}
              </ul>
            </div>
          )}
          <div className="overview-note subtle">
            <h3>Learn at your own pace.</h3>
            <p>
              Read, try the examples, and test your understanding. You can revisit any lesson
              whenever you need to.
            </p>
          </div>
          {!preview && (
            <button
              className="delete-link"
              onClick={() => {
                setDeleteError(null);
                dialog.current?.showModal();
              }}
            >
              <Trash2 size={16} />
              Delete this course
            </button>
          )}
        </aside>
      </div>
      {!preview && (
        <dialog
          ref={dialog}
          className="confirm-dialog"
          aria-labelledby="delete-title"
          onCancel={(event) => {
            if (deleting) event.preventDefault();
          }}
        >
          <h2 id="delete-title">Delete this saved course?</h2>
          <p>
            “{course.title}” and its {course.lessonCount} saved lessons will be removed from your
            library.
          </p>
          {Boolean(deleteError) && <ErrorState error={deleteError} />}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={deleting}
              onClick={() => dialog.current?.close()}
              autoFocus
            >
              Keep course
            </button>
            <button
              className="button danger"
              disabled={deleting}
              onClick={() => {
                void remove();
              }}
            >
              {deleting ? 'Deleting…' : 'Delete course'}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
function ArrowUpRightIcon() {
  return <ChevronRight size={17} className="lesson-list-arrow" />;
}

export function LessonPage({ preview = false }: { preview?: boolean }) {
  const { courseId, lessonId } = useParams();
  const {
    course,
    error: courseError,
    retry: retryCourse,
    setCourse,
  } = useCourse(preview, courseId);
  const api = useApi();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const retryRequested = useRef(false);
  const base = preview ? '/sample' : `/courses/${courseId}`;
  const [outlineOpen, setOutlineOpen] = useState(
    () => window.matchMedia('(min-width: 1000px)').matches,
  );
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pollUntil = Date.now() + 300_000;
    const shouldRetry = retryRequested.current;
    retryRequested.current = false;
    setLesson(null);
    setError(null);
    if (preview) {
      const selected = sampleLessons.find((item) => item.id === lessonId);
      if (selected) setLesson(selected);
      else setError(new Error('This sample lesson could not be found.'));
      return;
    }
    const path = `/api/courses/${courseId}/lessons/${lessonId}`;
    const load = async (first = false) => {
      try {
        let result = await api(path, lessonResponseSchema, { signal: controller.signal });
        if (
          first &&
          (result.lesson.generationState === 'not_started' ||
            (shouldRetry && result.lesson.generationState === 'failed'))
        )
          result = await api(`${path}/generate`, lessonResponseSchema, {
            method: 'POST',
            body: { retry: shouldRetry },
            signal: controller.signal,
          });
        if (controller.signal.aborted) return;
        setLesson(result.lesson);
        if (result.lesson.generationState === 'generating' && Date.now() < pollUntil)
          timer = setTimeout(() => {
            void load();
          }, 2000);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure);
      }
    };
    void load(true);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [api, preview, courseId, lessonId, reload]);
  if (courseError) return <ErrorState error={courseError} retry={retryCourse} />;
  if (error)
    return (
      <>
        <Link to={base} className="back-link">
          <ArrowLeft size={16} />
          Back to course
        </Link>
        <ErrorState error={error} retry={() => setReload((value) => value + 1)} />
      </>
    );
  if (!course || !lesson) return <Loading text="Opening your lesson…" />;
  const lessons = course.modules.flatMap((module) => module.lessons);
  const index = lessons.findIndex((item) => item.id === lesson.id);
  const previous = lessons[index - 1],
    next = lessons[index + 1];
  const module = course.modules.find((item) => item.id === lesson.moduleId)!;
  return (
    <>
      <Link to={base} className="back-link">
        <ArrowLeft size={16} />
        Course overview
      </Link>
      <div className="lesson-layout">
        <aside className="lesson-outline">
          <details
            open={outlineOpen}
            onToggle={(event) => setOutlineOpen(event.currentTarget.open)}
          >
            <summary>
              Course contents <ChevronDown size={17} />
            </summary>
            <div>
              <Link to={base} className="outline-course-title">
                {course.title}
              </Link>
              <p className="outline-progress">
                Lesson {index + 1} of {course.lessonCount}
              </p>
              {course.modules.map((item, moduleIndex) => (
                <section key={item.id}>
                  <h2>
                    <span>{String(moduleIndex + 1).padStart(2, '0')}</span>
                    {item.title}
                  </h2>
                  <ol>
                    {item.lessons.map((entry) => (
                      <li key={entry.id}>
                        <NavLink to={`${base}/lessons/${entry.id}`}>
                          <span className="outline-dot" />
                          {entry.title}
                        </NavLink>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          </details>
        </aside>
        <article className="lesson-article" key={lesson.id}>
          <header className="lesson-header">
            <div className="lesson-kicker">
              <span className="badge light">
                {preview ? 'SAMPLE PREVIEW' : course.isSample ? 'AUTHORED SAMPLE' : 'AI LESSON'}
              </span>
              <span>
                {module.title} <span className="dot-separator">·</span> Lesson {lesson.position + 1}
              </span>
            </div>
            <h1>{lesson.title}</h1>
            <p>{lesson.description}</p>
          </header>
          <section className="objectives-panel">
            <p className="eyebrow">BY THE END OF THIS LESSON</p>
            <ul>
              {lesson.objectives.map((objective) => (
                <li key={objective}>
                  <CheckCircle2 size={17} />
                  {objective}
                </li>
              ))}
            </ul>
            <div className="tag-row">
              {lesson.keyTopics.map((topic) => (
                <span className="tag" key={topic}>
                  {topic}
                </span>
              ))}
            </div>
          </section>
          {lesson.generationState === 'ready' ? (
            <>
              <LessonContent lesson={lesson} />
              <LessonTools
                key={lesson.id}
                lesson={lesson}
                course={course}
                preview={preview}
                onCourse={setCourse}
              />
            </>
          ) : (
            <GenerationPanel
              subject="lesson"
              state={lesson.generationState}
              info={lesson.generation}
              refresh={() => setReload((value) => value + 1)}
              retry={() => {
                retryRequested.current = true;
                setReload((value) => value + 1);
              }}
            />
          )}
          <nav className="lesson-navigation" aria-label="Lesson navigation">
            {previous ? (
              <Link to={`${base}/lessons/${previous.id}`}>
                <ArrowLeft size={20} />
                <span>
                  <small>PREVIOUS LESSON</small>
                  {previous.title}
                </span>
              </Link>
            ) : (
              <Link to={base}>
                <ArrowLeft size={20} />
                <span>
                  <small>BACK TO</small>Course overview
                </span>
              </Link>
            )}
            {next ? (
              <Link to={`${base}/lessons/${next.id}`}>
                <span>
                  <small>UP NEXT</small>
                  {next.title}
                </span>
                <ArrowRight size={20} />
              </Link>
            ) : (
              <Link to={base}>
                <span>
                  <small>YOU’VE REACHED THE LAST LESSON</small>Return to the course
                </span>
                <CheckCircle2 size={20} />
              </Link>
            )}
          </nav>
        </article>
      </div>
    </>
  );
}
