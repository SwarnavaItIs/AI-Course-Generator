import {
  BookOpen,
  LayoutGrid,
  ArrowUpRight,
  Menu,
  X,
  LogOut,
  Leaf,
  ChevronRight,
} from 'lucide-react';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useSession } from '../auth';

export function Layout({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(location.pathname);
  const isLesson = location.pathname.includes('/lessons/');
  useEffect(() => {
    if (previousPath.current !== location.pathname) {
      previousPath.current = location.pathname;
      main.current?.focus();
      window.scrollTo({ top: 0 });
    }
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    sidebar.current?.querySelector<HTMLElement>('a,button')?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        menuButton.current?.focus();
      }
      if (event.key === 'Tab' && window.innerWidth < 800) {
        const items = sidebar.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled])',
        );
        const first = items?.[0],
          last = items?.[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  const signIn = () => {
    setAuthError(null);
    void session
      .login(location.pathname.startsWith('/sample') ? '/library' : location.pathname)
      .catch(() => setAuthError('Sign-in couldn’t be started. Please try again.'));
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {open && (
        <button
          className="nav-backdrop"
          tabIndex={-1}
          onClick={() => {
            setOpen(false);
            menuButton.current?.focus();
          }}
          aria-label="Close navigation"
        />
      )}
      <aside
        ref={sidebar}
        className={`workspace-sidebar ${open ? 'open' : ''}`}
        aria-label="Workspace navigation"
      >
        <div className="sidebar-brand">
          <Link to="/" onClick={() => setOpen(false)}>
            <span className="brand-mark">
              <BookOpen size={22} />
            </span>
            <span>
              text<span className="brand-to">to</span>learn<span className="brand-dot">.</span>
            </span>
          </Link>
          <button
            className="icon-button mobile-only"
            onClick={() => {
              setOpen(false);
              menuButton.current?.focus();
            }}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>
        <p className="sidebar-label">YOUR WORKSPACE</p>
        <nav>
          <NavLink to="/library" onClick={() => setOpen(false)}>
            <LayoutGrid size={18} />
            My library
            <ChevronRight size={15} className="nav-chevron" />
          </NavLink>
          <NavLink to="/sample" onClick={() => setOpen(false)}>
            <BookOpen size={18} />
            Sample course
            <ArrowUpRight size={15} className="nav-chevron" />
          </NavLink>
        </nav>
        <div className="sidebar-note">
          <Leaf size={25} />
          <h3>Room to grow.</h3>
          <p>You don’t need to know everything. Just take the next step.</p>
          <Link to="/sample" onClick={() => setOpen(false)}>
            Find your starting point <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="sidebar-footer">
          <span className="user-avatar">
            {session.isAuthenticated ? (session.name?.[0] ?? 'L').toUpperCase() : 'T'}
          </span>
          <div>
            <strong>
              {session.isAuthenticated ? (session.name ?? 'Learner') : 'Your learning space'}
            </strong>
            <span>
              {session.isAuthenticated ? 'A little progress, every day' : 'Curiosity starts here'}
            </span>
          </div>
          {session.isAuthenticated && (
            <button className="icon-button" aria-label="Sign out" onClick={session.logout}>
              <LogOut size={18} />
            </button>
          )}
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div>
            <button
              ref={menuButton}
              className="icon-button mobile-only"
              aria-label="Open navigation"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">
              Workspace <span>/</span>{' '}
              {isLesson
                ? 'Lesson'
                : location.pathname.startsWith('/sample') ||
                    location.pathname.startsWith('/courses')
                  ? 'Course'
                  : 'My library'}
            </span>
          </div>
          <div className="topbar-right">
            <span className="quiet-label">One idea at a time</span>
            {!session.isAuthenticated && session.configured && (
              <button className="button small secondary" onClick={signIn}>
                Sign in <ArrowUpRight size={15} />
              </button>
            )}
          </div>
        </header>
        {authError && (
          <p role="alert" className="auth-error">
            {authError}
          </p>
        )}
        <main
          id="main-content"
          ref={main}
          tabIndex={-1}
          className={isLesson ? 'page lesson-page' : 'page'}
        >
          {children}
        </main>
        <footer className="page-footer">
          <span>Text to Learn</span>
          <span>Stay curious. Keep going.</span>
        </footer>
      </div>
    </div>
  );
}
