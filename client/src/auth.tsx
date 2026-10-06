import { Auth0Provider, useAuth0, type AppState } from '@auth0/auth0-react';
import { createContext, useContext, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { safeReturnTo } from './return-path';

interface Session {
  configured: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  name?: string;
  error?: string;
  login: (returnTo?: string) => Promise<void>;
  logout: () => void;
  getToken: () => Promise<string>;
}
const unavailable: Session = {
  configured: false,
  isLoading: false,
  isAuthenticated: false,
  login: async () => {
    throw new Error('Sign-in is currently unavailable.');
  },
  logout: () => {},
  getToken: async () => {
    throw new Error('Sign in to open your library.');
  },
};
const SessionContext = createContext<Session>(unavailable);
export const useSession = () => useContext(SessionContext);

function AuthBridge({ children }: { children: ReactNode }) {
  const auth = useAuth0();
  return (
    <SessionContext.Provider
      value={{
        configured: true,
        isLoading: auth.isLoading,
        isAuthenticated: auth.isAuthenticated,
        name: auth.user?.given_name ?? auth.user?.name,
        error: auth.error ? 'We couldn’t finish signing you in. Please try again.' : undefined,
        login: async (returnTo = '/library') => {
          await auth.loginWithRedirect({ appState: { returnTo: safeReturnTo(returnTo) } });
        },
        logout: () => auth.logout({ logoutParams: { returnTo: window.location.origin } }),
        getToken: async () => {
          const token = await auth.getAccessTokenSilently();
          if (!token) throw new Error('Your session has expired. Please sign in again.');
          return token;
        },
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const domain = import.meta.env.VITE_AUTH0_DOMAIN as string | undefined;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined;
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined;
  const configured = Boolean(
    domain && clientId && audience && !domain.startsWith('your-') && !clientId.startsWith('your-'),
  );
  if (!configured)
    return <SessionContext.Provider value={unavailable}>{children}</SessionContext.Provider>;
  if (!/^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(domain!)) {
    return (
      <SessionContext.Provider
        value={{
          ...unavailable,
          error: 'Sign-in is temporarily unavailable. Please try again later.',
        }}
      >
        {children}
      </SessionContext.Provider>
    );
  }
  const onRedirect = (state?: AppState) =>
    navigate(safeReturnTo(state?.returnTo as string | undefined), { replace: true });
  return (
    <Auth0Provider
      domain={domain!}
      clientId={clientId!}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience,
        scope: 'openid profile email',
      }}
      onRedirectCallback={onRedirect}
      cacheLocation="memory"
    >
      <AuthBridge>{children}</AuthBridge>
    </Auth0Provider>
  );
}
