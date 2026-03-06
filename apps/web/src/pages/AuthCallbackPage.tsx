import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  // Capture hash immediately on first render (before StrictMode re-runs clear it)
  const hashRef = useRef(window.location.hash.substring(1));

  useEffect(() => {
    try {
      const params = new URLSearchParams(hashRef.current);
      const token = params.get('token');
      const userParam = params.get('user');

      if (!token || !userParam) {
        navigate('/login?error=auth_failed', { replace: true });
        return;
      }

      const parsed = JSON.parse(decodeURIComponent(userParam));
      if (
        typeof parsed?.id !== 'string' ||
        typeof parsed?.name !== 'string' ||
        typeof parsed?.email !== 'string'
      ) {
        navigate('/login?error=auth_failed', { replace: true });
        return;
      }

      setAuth(token, {
        id: parsed.id,
        name: parsed.name,
        email: parsed.email,
        avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : undefined,
      });

      navigate('/', { replace: true });
    } catch {
      navigate('/login?error=auth_failed', { replace: true });
    }
  }, [navigate, setAuth]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'var(--th-surface)',
      color: 'var(--th-muted)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      Signing in...
    </div>
  );
}
