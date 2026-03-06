import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { gql } from '@apollo/client';
import { useMeLazyQuery } from './__generated__/AuthContext.generated';

export const TOKEN_KEY = 'trace_token';
export const USER_KEY = 'trace_user';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3100';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
  setAuth: (token: string, user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isLoading: true,
  login: () => {},
  logout: () => {},
  setAuth: () => {},
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
  return localStorage.getItem(TOKEN_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem(USER_KEY);
    if (stored) {
      try {
        return JSON.parse(stored) as AuthUser;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [isLoading, setIsLoading] = useState(!!localStorage.getItem(TOKEN_KEY));
  const [executeMe] = useMeLazyQuery();

  const login = useCallback(() => {
    window.location.href = `${SERVER_URL}/auth/github/web`;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const setAuth = useCallback((newToken: string, newUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function validateToken() {
      try {
        const { data } = await executeMe();
        if (cancelled) return;

        if (data?.me) {
          const validatedUser: AuthUser = {
            id: data.me.id,
            email: data.me.email,
            name: data.me.name,
            avatarUrl: data.me.avatarUrl ?? undefined,
          };
          setUser(validatedUser);
          localStorage.setItem(USER_KEY, JSON.stringify(validatedUser));
        } else {
          // Token invalid — clear everything
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          setToken(null);
          setUser(null);
        }
      } catch {
        // Network error — keep cached user so the app isn't stuck on login
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    validateToken();
    return () => { cancelled = true; };
  }, [executeMe]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, setAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
