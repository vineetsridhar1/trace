import { createApp, schema } from './app';
import { config } from './config';
import { initStorage } from './services/storageService';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/use/ws';

initStorage(config.storagePath);

async function main() {
  const app = await createApp();

  const httpServer = app.listen(config.port, () => {
    console.log(`Trace server listening on http://localhost:${config.port}`);
  });

  // WebSocket server for GraphQL subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  const wsCleanup = useServer({ schema }, wsServer);

  // Graceful shutdown
  const shutdown = async () => {
    await wsCleanup.dispose();
    httpServer.close();
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void main();
