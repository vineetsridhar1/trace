import express from 'express';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolvers } from './schema/resolvers.generated';
import eventsRouter from './routes/events';
import sseRouter from './routes/sse';
import attachmentsRouter from './routes/attachments';
import { errorHandler } from './middleware/errorHandler';

export async function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // GraphQL
  const typeDefs = readFileSync(
    join(__dirname, './schema/schema.generated.graphqls'),
    'utf8',
  );
  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
  app.use('/graphql', expressMiddleware(server));

  // REST endpoints that stay
  app.use('/events', eventsRouter);
  app.use('/sse', sseRouter);
  app.use('/attachments', attachmentsRouter);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(errorHandler);

  return app;
}
