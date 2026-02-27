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
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }

    executeMe().then(({ data }) => {
      if (data?.me) {
        setUser({
          id: data.me.id,
          email: data.me.email,
          name: data.me.name,
          avatarUrl: data.me.avatarUrl ?? null,
        });
      } else {
        // Token is invalid, clear it
        localStorage.removeItem(AUTH_TOKEN_KEY);
      }
      setIsLoading(false);
    }).catch(() => {
      setIsLoading(false);
    });
  }, [executeMe]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
