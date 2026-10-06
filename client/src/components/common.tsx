import { AlertCircle, ArrowRight, LoaderCircle, BookOpen, Check, ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { lazy, Suspense, useState } from 'react';
import type { CourseSummary, Lesson, Mcq, GenerationInfo } from '@text-to-learn/contracts';
import { RequestError } from '../api';
const HighlightedCode = lazy(() =>
  import('./code').then((module) => ({ default: module.HighlightedCode })),
);

export function GenerationPanel({
  state,
  info,
  retry,
  refresh,
  subject,
}: {
  state: string;
  info?: GenerationInfo;
  retry?: () => void;
  refresh?: () => void;
  subject: string;
}) {
  if (state === 'failed')
    return (
      <div className="error-panel" role="alert">
        <AlertCircle size={24} />
        <div>
          <h2>Your {subject} needs another try</h2>
          <p>{info?.error?.message ?? 'Generation could not finish. Please retry.'}</p>
          <p className="muted">
            {info?.attempts ?? 0} of {info?.maxAttempts ?? 4} attempts used.
          </p>
          {info?.canRetry && retry ? (
            <button className="button secondary" onClick={retry}>
              Retry generation
            </button>
          ) : (
            <p>Return to your library to start a new course.</p>
          )}
        </div>
      </div>
    );
  return (
    <section className="generation-panel" aria-label={`${subject} generation`}>
      <div role="status">
        <LoaderCircle className="spin" size={28} />
        <h2>Preparing your {subject}…</h2>
        <p>
          {subject === 'course'
            ? 'Building a curriculum with objectives and resources for every lesson.'
            : 'Writing examples, explanations and questions for this lesson.'}
        </p>
      </div>
      <progress aria-label="Generation in progress" />
      <p className="muted">
        Your request is saved. You can leave this page and return later.
        {info && info.attempts > 0 ? ` Attempt ${info.attempts} of ${info.maxAttempts}.` : ''}
      </p>
      {refresh && (
        <button className="button secondary" onClick={refresh}>
          Check status
        </button>
      )}
    </section>
  );
}

export function Loading({ text = 'Opening your learning space…' }: { text?: string }) {
  return (
    <div className="state-panel" role="status">
      <LoaderCircle className="spin" size={26} />
      <p>{text}</p>
    </div>
  );
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="error-panel" role="alert">
      <AlertCircle size={22} />
      <div>
        <h2>Let’s try that again</h2>
        <p>{error instanceof Error ? error.message : 'Something went wrong. Please try again.'}</p>
        {error instanceof RequestError && error.requestId && (
          <small>Reference: {error.requestId}</small>
        )}
        {retry && (
          <button className="button secondary" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
export function CourseCard({ course }: { course: CourseSummary }) {
  const percent = course.lessonCount
    ? Math.round((course.completedLessonCount / course.lessonCount) * 100)
    : 0;
  return (
    <article className="course-card">
      <div className="course-art">
        <div className="code-orbit">
          <span>&lt;/&gt;</span>
        </div>
        <span className="badge">
          {course.isSample
            ? 'AUTHORED SAMPLE'
            : course.generationState === 'ready'
              ? 'AI COURSE'
              : course.generationState === 'failed'
                ? 'NEEDS A RETRY'
                : 'GENERATING'}
        </span>
      </div>
      <div className="course-card-body">
        <div className="tag-row">
          {course.tags.map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
        <h3>
          <Link to={`/courses/${course.id}`}>{course.title}</Link>
        </h3>
        <p>{course.description}</p>
        {course.generationState === 'ready' ? (
          <>
            <div className="course-meta">
              <BookOpen size={15} />
              {course.moduleCount} modules<span>·</span>
              {course.lessonCount} lessons
            </div>
            <div className="progress-label">
              <span>
                {course.completedLessonCount} of {course.lessonCount} completed
              </span>
              <span>{percent}%</span>
            </div>
            <progress
              value={course.completedLessonCount}
              max={course.lessonCount}
              aria-label={`${course.title} progress`}
            />
          </>
        ) : (
          <p className="muted">
            {course.generationState === 'failed'
              ? 'Open your course to retry generation.'
              : 'Your curriculum is being prepared.'}
          </p>
        )}
        <Link className="card-link" to={`/courses/${course.id}`}>
          Open course <ArrowRight size={17} />
        </Link>
      </div>
    </article>
  );
}
function QuizQuestion({ item, number }: { item: Mcq; number: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <fieldset className="quiz-question">
      <legend>
        <span>{String(number).padStart(2, '0')}</span>
        {item.question}
      </legend>
      <div className="quiz-options">
        {item.options.map((option, index) => (
          <label key={option} className={selected === index ? 'selected' : ''}>
            <input
              type="radio"
              name={`question-${number}`}
              checked={selected === index}
              onChange={() => setSelected(index)}
            />
            <span>{option}</span>
            {selected === index && selected === item.correctAnswerIndex && <Check size={18} />}
          </label>
        ))}
      </div>
      {selected !== null && (
        <div
          className={`answer-feedback ${selected === item.correctAnswerIndex ? 'correct' : ''}`}
          role="status"
        >
          <strong>
            {selected === item.correctAnswerIndex ? 'That’s right.' : 'Take another look.'}
          </strong>{' '}
          {item.explanation}
        </div>
      )}
    </fieldset>
  );
}
export function LessonContent({ lesson }: { lesson: Lesson }) {
  if (!lesson.content)
    return (
      <div className="state-panel">
        <p>This lesson’s content is not available yet.</p>
      </div>
    );
  return (
    <>
      <div className="lesson-prose">
        {lesson.content.blocks.map((block, index) => {
          if (block.type === 'heading') return <h2 key={index}>{block.text}</h2>;
          if (block.type === 'paragraph') return <p key={index}>{block.text}</p>;
          if (block.type === 'code')
            return (
              <div className="code-block" key={index}>
                <div>
                  <span>{block.language}</span>
                  <span>Example</span>
                </div>
                <Suspense
                  fallback={
                    <pre>
                      <code>{block.code}</code>
                    </pre>
                  }
                >
                  <HighlightedCode language={block.language} code={block.code} />
                </Suspense>
              </div>
            );
          return (
            <aside className="callout" key={index}>
              <span className="callout-icon">↗</span>
              <div>
                <h3>{block.title}</h3>
                <p>{block.text}</p>
              </div>
            </aside>
          );
        })}
      </div>
      <section className="resource-section">
        <p className="eyebrow">GO A LITTLE DEEPER</p>
        <h2>Keep exploring</h2>
        {lesson.resources.map((resource) => (
          <div key={resource.title}>
            {resource.source === 'catalogue' && resource.url ? (
              <a href={resource.url} target="_blank" rel="noopener noreferrer">
                {resource.title}
                <ExternalLink size={16} />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              <p>
                {resource.title} <span className="tag">Unverified suggestion</span>
              </p>
            )}
          </div>
        ))}
      </section>
      {lesson.content.videoQueries && (
        <section className="video-queries">
          <p className="eyebrow">A DIFFERENT WAY TO EXPLORE</p>
          <h2>Video search ideas</h2>
          <p className="muted">
            Suggested searches for this lesson. Use the lesson tools below to find existing YouTube
            videos.
          </p>
          <ul>
            {lesson.content.videoQueries.map((query) => (
              <li key={query}>{query}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="quiz-section">
        <p className="eyebrow">MAKE IT STICK</p>
        <h2>Check your understanding</h2>
        <p className="muted">Choose an answer to see an explanation. Practice at your own pace.</p>
        {lesson.content.quiz.map((item, index) => (
          <QuizQuestion key={item.question} item={item} number={index + 1} />
        ))}
      </section>
    </>
  );
}
