import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowRight,
  Plus,
  BookOpen,
  Layers,
  CheckCircle2,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import {
  coursesResponseSchema,
  courseResponseSchema,
  sampleCourse,
  type CourseSummary,
} from '@text-to-learn/contracts';
import { useSession } from '../auth';
import { useApi } from '../api';
import { CourseCard, ErrorState, Loading } from '../components/common';

export function Library() {
  const session = useSession();
  const api = useApi();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(sampleCourse.title);
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<unknown>(null);
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [topicError, setTopicError] = useState<unknown>(null);
  const pendingRequest = useRef<{ topic: string; requestId: string } | null>(null);
  const generate = async (event: React.FormEvent) => {
    event.preventDefault();
    setGenerating(true);
    setTopicError(null);
    const normalized = topic.trim();
    if (pendingRequest.current?.topic !== normalized)
      pendingRequest.current = { topic: normalized, requestId: crypto.randomUUID() };
    try {
      const result = await api('/api/courses', courseResponseSchema, {
        method: 'POST',
        body: pendingRequest.current,
      });
      pendingRequest.current = null;
      navigate(`/courses/${result.course.id}`);
    } catch (failure) {
      setTopicError(failure);
    } finally {
      setGenerating(false);
    }
  };
  useEffect(() => {
    if (!session.isAuthenticated) return;
    const controller = new AbortController();
    setCourses(null);
    setError(null);
    void api('/api/courses', coursesResponseSchema, { signal: controller.signal })
      .then((result) => setCourses(result.courses))
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure);
      });
    return () => controller.abort();
  }, [api, session.isAuthenticated, reload]);
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setCreateError(null);
    try {
      const result = await api('/api/courses', courseResponseSchema, {
        method: 'POST',
        body: { templateId: 'web-foundations', title },
      });
      navigate(`/courses/${result.course.id}`);
    } catch (failure) {
      setCreateError(failure);
    } finally {
      setSaving(false);
    }
  };
  if (session.isLoading) return <Loading text="Getting your learning space ready…" />;
  return (
    <>
      <div className="page-title-row">
        <div>
          <p className="eyebrow">A SPACE FOR YOUR NEXT IDEA</p>
          <h1>{session.isAuthenticated ? 'Your learning library' : 'Follow your curiosity.'}</h1>
          <p className="muted">
            {session.isAuthenticated
              ? 'Pick up where you left off, or find a new place to start.'
              : 'Good questions are the beginning of something great.'}
          </p>
        </div>
        {session.isAuthenticated && (
          <button
            className="button"
            onClick={() => {
              setShowCreate(!showCreate);
              setCreateError(null);
            }}
            aria-expanded={showCreate}
          >
            <Plus size={18} />
            Add sample course
          </button>
        )}
      </div>
      {session.error && <ErrorState error={new Error(session.error)} />}
      {session.isAuthenticated && (
        <section className="topic-panel">
          <div>
            <p className="eyebrow">START WITH A QUESTION</p>
            <h2>What would you like to learn?</h2>
            <p className="muted">
              Turn a topic into a course. Open each lesson when you’re ready to explore it.
            </p>
          </div>
          <form
            onSubmit={(event) => {
              void generate(event);
            }}
          >
            <label htmlFor="learning-topic">Learning topic</label>
            <textarea
              id="learning-topic"
              rows={2}
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Python for beginners, persuasive writing, world history…"
              minLength={3}
              maxLength={300}
              required
              disabled={generating}
            />
            <div className="form-actions">
              <button
                className="button"
                type="submit"
                disabled={generating || topic.trim().length < 3}
              >
                {generating ? 'Saving your request…' : 'Generate course'}
                <Sparkles size={17} />
              </button>
              <small className="muted">3–6 modules · 3–5 lessons per module</small>
            </div>
          </form>
          {Boolean(topicError) && <ErrorState error={topicError} />}
        </section>
      )}
      <section className="welcome-panel">
        <div className="welcome-copy">
          <span className="hero-label">
            <span />A LITTLE CURIOSITY GOES A LONG WAY
          </span>
          <h2>
            Make room for
            <br />
            <em>something new.</em>
          </h2>
          <p>
            Explore an idea. Connect the dots.
            <br />
            Build understanding, one lesson at a time.
          </p>
          <Link className="button lime" to="/sample">
            Explore the sample <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="learning-illustration" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="illustration-center">
            <BookOpen size={44} strokeWidth={1.3} />
          </div>
          <div className="floating-card code-card">
            <span>&lt;/&gt;</span>
            <small>A new perspective</small>
          </div>
          <div className="floating-card idea-card">
            <Sparkles size={25} />
            <small>Start with an idea</small>
          </div>
          <span className="illustration-star">✳</span>
          <span className="illustration-dot" />
        </div>
      </section>
      {session.isAuthenticated && courses && (
        <div className="stats-grid">
          {[
            { icon: BookOpen, value: courses.length, label: 'Saved courses' },
            {
              icon: Layers,
              value: courses.reduce((total, course) => total + course.lessonCount, 0),
              label: 'Lessons to explore',
            },
            {
              icon: CheckCircle2,
              value: courses.reduce((total, course) => total + course.completedLessonCount, 0),
              label: 'Lessons completed',
            },
          ].map(({ icon: Icon, value, label }) => (
            <div className="stat" key={label}>
              <span>
                <Icon size={20} />
              </span>
              <div>
                <strong>{value}</strong>
                <p>{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {showCreate && session.isAuthenticated && (
        <section className="create-panel">
          <div>
            <p className="eyebrow">YOUR FIRST SAVED COURSE</p>
            <h2>A foundation you can come back to.</h2>
            <p className="muted">
              Save your own copy of the authored Web Foundations sample. It contains 3 modules and 9
              lessons.
            </p>
          </div>
          <form
            onSubmit={(event) => {
              void create(event);
            }}
          >
            <label htmlFor="course-title">Course title</label>
            <input
              id="course-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              minLength={3}
              maxLength={120}
              required
              autoFocus
            />
            <div className="form-actions">
              <button className="button" disabled={saving || title.trim().length < 3} type="submit">
                {saving ? 'Saving your course…' : 'Save to my library'}
                <ArrowRight size={17} />
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={saving}
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
            </div>
          </form>
          {Boolean(createError) && <ErrorState error={createError} />}
        </section>
      )}
      <div className="section-title-row">
        <div>
          <p className="eyebrow">
            {session.isAuthenticated ? 'KEEP THE MOMENTUM' : 'A GOOD PLACE TO BEGIN'}
          </p>
          <h2>{session.isAuthenticated ? 'My courses' : 'A small course. A solid foundation.'}</h2>
        </div>
        <span className="quiet-label">
          {session.isAuthenticated && courses
            ? `${courses.length} saved`
            : 'Made for curious minds'}
        </span>
      </div>
      {session.isAuthenticated ? (
        error ? (
          <ErrorState error={error} retry={() => setReload((value) => value + 1)} />
        ) : !courses ? (
          <Loading text="Loading your saved courses…" />
        ) : courses.length === 0 ? (
          <div className="empty-library">
            <span className="empty-icon">
              <BookOpen size={29} />
            </span>
            <h3>Your next chapter starts here.</h3>
            <p>No saved courses yet. Generate a topic above or add the sample to begin.</p>
            <button className="button secondary" onClick={() => setShowCreate(true)}>
              Add your first course <Plus size={17} />
            </button>
          </div>
        ) : (
          <div className="course-grid">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )
      ) : (
        <section className="sample-feature">
          <div className="sample-feature-icon" aria-hidden="true">
            &lt;/&gt;
          </div>
          <div>
            <span className="badge light">AUTHORED SAMPLE · BEGINNER</span>
            <h3>{sampleCourse.title}</h3>
            <p>{sampleCourse.description}</p>
            <div className="course-meta">
              <BookOpen size={15} />3 modules<span>·</span>9 lessons<span>·</span>Read at your own
              pace
            </div>
          </div>
          <Link className="icon-link" to="/sample" aria-label="Open Web Foundations sample">
            <ArrowRight size={23} />
          </Link>
        </section>
      )}
      {!session.isAuthenticated && (
        <div className="signin-note">
          <span>
            <strong>Keep your learning in one place.</strong>
            <br />
            {session.configured
              ? 'Sign in to save a course and return to it anytime.'
              : 'Sign-in is currently unavailable. The sample is open for you to explore.'}
          </span>
          {session.configured && (
            <button
              className="button secondary"
              onClick={() => {
                void session.login('/library').catch((failure: unknown) => setCreateError(failure));
              }}
            >
              Sign in to get started <ArrowRight size={17} />
            </button>
          )}
        </div>
      )}
      {!session.isAuthenticated && Boolean(createError) && <ErrorState error={createError} />}
    </>
  );
}
