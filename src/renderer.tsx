import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { GraphQLProvider } from './graphql/provider';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <GraphQLProvider>
      <App />
    </GraphQLProvider>
  </StrictMode>,
);
