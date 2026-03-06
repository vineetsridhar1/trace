import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { GraphQLProvider } from './graphql/provider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { setServerUrl } from '@trace/shared-ui';
import { getServerUrl } from './types';
import './stores/themeStore'; // eagerly apply saved theme before React renders
import './index.css';

// Initialize shared-ui server URL from Electron IPC
setServerUrl(getServerUrl());

function AuthGate() {
  const { isAuthenticated, isLoading, isRetrying } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--th-surface)', color: 'var(--th-muted)' }}>
        Loading...
      </div>
    );
  }

  if (isRetrying) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--th-surface)', color: 'var(--th-muted)' }}>
        Reconnecting to server...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <App />;
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <GraphQLProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </GraphQLProvider>
    </ErrorBoundary>
  </StrictMode>,
);
