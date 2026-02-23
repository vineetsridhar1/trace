import express from 'express';
import cors from 'cors';
import eventsRouter from './routes/events';
import sessionsRouter from './routes/sessions';
import sseRouter from './routes/sse';
import channelsRouter from './routes/channels';
import kanbanRouter from './routes/kanban';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.use('/events', eventsRouter);
  app.use('/sessions', sessionsRouter);
  app.use('/sse', sseRouter);
  app.use('/channels', channelsRouter);
  app.use('/channels', kanbanRouter);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(errorHandler);

  return app;
}
