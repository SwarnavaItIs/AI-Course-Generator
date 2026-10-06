import { useState, type ReactNode } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { useSession } from './auth';
import { Layout } from './components/layout';
import { Loading, ErrorState } from './components/common';
import { Library } from './pages/library';
import { CourseOverview, LessonPage } from './pages/course';

function Protected({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  const [error, setError] = useState<unknown>(null);
  if (session.isLoading) return <Loading text="Checking your session…" />;
  if (session.isAuthenticated) return children;
  return (
    <section className="signin-panel">
      <span className="empty-icon">
        <LockKeyhole size={30} />
      </span>
      <p className="eyebrow">YOUR PERSONAL LEARNING SPACE</p>
      <h1>A place for your next chapter.</h1>
      <p>
        {session.configured
          ? 'Sign in to open your library and come back to the courses you’ve saved.'
          : 'Sign-in is currently unavailable. You can still explore the authored sample course.'}
      </p>
      <div className="form-actions">
        {session.configured && (
          <button
            className="button"
            onClick={() => {
              void session.login(location.pathname).catch((failure: unknown) => setError(failure));
            }}
          >
            Sign in to continue <ArrowRight size={17} />
          </button>
        )}
        <Link className="button secondary" to="/sample">
          Explore the sample
        </Link>
      </div>
      {(error || session.error) && <ErrorState error={error ?? new Error(session.error)} />}
    </section>
  );
}
export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Library />} />
        <Route
          path="/library"
          element={
            <Protected>
              <Library />
            </Protected>
          }
        />
        <Route path="/sample" element={<CourseOverview preview />} />
        <Route path="/sample/lessons/:lessonId" element={<LessonPage preview />} />
        <Route
          path="/courses/:courseId"
          element={
            <Protected>
              <CourseOverview />
            </Protected>
          }
        />
        <Route
          path="/courses/:courseId/lessons/:lessonId"
          element={
            <Protected>
              <LessonPage />
            </Protected>
          }
        />
        <Route
          path="*"
          element={
            <div className="state-panel">
              <p className="eyebrow">PAGE NOT FOUND</p>
              <h1>Let’s find your way back.</h1>
              <p>This page doesn’t exist. Your next idea is waiting in your library.</p>
              <Link className="button" to="/">
                Go to my library <ArrowRight size={17} />
              </Link>
            </div>
          }
        />
      </Routes>
    </Layout>
  );
}
