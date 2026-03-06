import { createApp, schema } from './app';
import { config } from './config';
import { initStorage } from './services/storageService';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/use/ws';
import { handleInstanceSocket } from './ws/instanceSocket';

initStorage(config.storagePath);

async function main() {
  const app = await createApp();

  const httpServer = app.listen(config.port, () => {
    console.log(`Trace server listening on http://localhost:${config.port}`);
  });

  // Use noServer mode so we can manually route upgrade requests to the right WS server
  const wsServer = new WebSocketServer({ noServer: true });
  const wsCleanup = useServer({ schema }, wsServer);

  const instanceWsServer = new WebSocketServer({ noServer: true });
  instanceWsServer.on('connection', (ws, req) => {
    void handleInstanceSocket(ws, req);
  });

  httpServer.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url ?? '', 'http://localhost');

    if (pathname === '/graphql') {
      wsServer.handleUpgrade(req, socket, head, (ws) => {
        wsServer.emit('connection', ws, req);
      });
    } else if (pathname === '/instance') {
      instanceWsServer.handleUpgrade(req, socket, head, (ws) => {
        instanceWsServer.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  // Graceful shutdown
  const shutdown = async () => {
    await wsCleanup.dispose();
    instanceWsServer.close();
    httpServer.close();
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void main();
