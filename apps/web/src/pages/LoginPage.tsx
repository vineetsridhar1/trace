import { useSearchParams } from 'react-router-dom';
import { FiGithub } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'var(--th-surface)',
      color: 'var(--th-heading)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '24px',
        padding: '48px',
        borderRadius: '12px',
        background: 'var(--th-surface-elevated)',
        border: '1px solid var(--th-surface-hover)',
      }}>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 600 }}>Trace</h1>
        <p style={{ margin: 0, color: 'var(--th-muted)', fontSize: '14px' }}>Sign in to continue</p>

        <button
          onClick={login}
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
            cursor: 'pointer',
          }}
        >
          <FiGithub size={20} />
          Sign in with GitHub
        </button>

        {error && (
          <p style={{ margin: 0, color: '#f44', fontSize: '13px', maxWidth: '280px', textAlign: 'center' }}>
            Authentication failed. Please try again.
          </p>
        )}
      </div>
    </div>
  );
}
