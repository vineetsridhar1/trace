import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { gql } from '@apollo/client';
import { useMeLazyQuery } from './__generated__/AuthContext.generated';

const AUTH_TOKEN_KEY = 'trace-auth-token';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isRetrying: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isRetrying: false,
  login: () => {},
  logout: () => {},
});

export const GQL_ME = gql`
  query Me {
    me {
      id
      email
      name
      avatarUrl
      role
    }
  }
`;

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [executeMe] = useMeLazyQuery();

  const login = useCallback((token: string, userData: AuthUser) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }

    async function validateToken() {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (cancelled) return;

        try {
          const { data } = await executeMe();

          if (cancelled) return;

          if (data?.me) {
            setUser({
              id: data.me.id,
              email: data.me.email,
              name: data.me.name,
              avatarUrl: data.me.avatarUrl ?? null,
            });
          } else {
            // Token is genuinely invalid — clear it, no retries
            localStorage.removeItem(AUTH_TOKEN_KEY);
          }
          setIsRetrying(false);
          setIsLoading(false);
          return;
        } catch {
          // Network error — retry with backoff
          if (cancelled) return;

          if (attempt < MAX_RETRIES) {
            setIsRetrying(true);
            setIsLoading(false);
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
          } else {
            // Retries exhausted — show login but preserve token for next restart
            setIsRetrying(false);
            setIsLoading(false);
          }
        }
      }
    }

    validateToken();

    return () => {
      cancelled = true;
    };
  }, [executeMe]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, isRetrying, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
