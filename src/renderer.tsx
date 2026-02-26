import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { GraphQLProvider } from './graphql/provider';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <GraphQLProvider>
        <App />
      </GraphQLProvider>
    </ErrorBoundary>
  </StrictMode>,
);
