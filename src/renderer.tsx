import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { GraphQLProvider } from './graphql/provider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import './index.css';

function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1a2e', color: '#888' }}>
        Loading...
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
