import { useState } from 'react';
import { FiGithub } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';

export function LoginScreen() {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGitHubLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.traceAPI.githubLogin();
      if (result.success && result.token && result.user) {
        login(result.token, result.user);
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#1a1a2e',
      color: '#e0e0e0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '24px',
        padding: '48px',
        borderRadius: '12px',
        background: '#16213e',
        border: '1px solid #2a2a4a',
      }}>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 600 }}>Trace</h1>
        <p style={{ margin: 0, color: '#888', fontSize: '14px' }}>Sign in to continue</p>

        <button
          onClick={handleGitHubLogin}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 24px',
            fontSize: '15px',
            fontWeight: 500,
            color: '#fff',
            background: '#238636',
            border: 'none',
            borderRadius: '8px',
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          <FiGithub size={20} />
          {loading ? 'Signing in...' : 'Sign in with GitHub'}
        </button>

        {error && (
          <p style={{ margin: 0, color: '#f44', fontSize: '13px', maxWidth: '280px', textAlign: 'center' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
