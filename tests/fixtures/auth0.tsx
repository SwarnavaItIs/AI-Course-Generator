// Vite aliases the Auth0 SDK to this file ONLY in tests/vite.config.ts.
// This simulates the external login redirect, never the backend JWT verifier.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

const Context = createContext<ReturnType<typeof useFixture> | null>(null);
function useFixture(onRedirect?: (state: { returnTo: string }) => void) {
  const [subject, setSubject] = useState(() => localStorage.getItem('test-only-subject'));
  const getAccessTokenSilently = useCallback(async () => {
    if (!subject) throw new Error('Not signed in');
    const response = await fetch(`/__fixture/token?subject=${encodeURIComponent(subject)}`);
    const result = (await response.json()) as { token: string };
    return result.token;
  }, [subject]);
  return {
    isLoading: false,
    isAuthenticated: Boolean(subject),
    error: undefined,
    user: subject ? { given_name: 'Avery', name: 'Avery' } : undefined,
    getAccessTokenSilently,
    loginWithRedirect: async ({ appState }: { appState?: { returnTo?: string } } = {}) => {
      const next = `auth0|browser-${crypto.randomUUID()}`;
      localStorage.setItem('test-only-subject', next);
      setSubject(next);
      onRedirect?.({ returnTo: appState?.returnTo ?? '/library' });
    },
    logout: () => {
      localStorage.removeItem('test-only-subject');
      setSubject(null);
      window.location.assign('/');
    },
  };
}
export function Auth0Provider({
  children,
  onRedirectCallback,
}: {
  children: ReactNode;
  onRedirectCallback?: (state: { returnTo: string }) => void;
}) {
  const value = useFixture(onRedirectCallback);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth0() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing test auth provider');
  return value;
}
