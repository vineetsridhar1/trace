import express from 'express';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import { readFileSync } from 'fs';
import { join } from 'path';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { resolvers } from './schema/resolvers.generated';
import eventsRouter from './routes/events';
import attachmentsRouter from './routes/attachments';
import authRouter from './routes/auth';
import { errorHandler } from './middleware/errorHandler';
import { verifyJwt } from './services/authService';
import prisma from './lib/prisma';

const typeDefs = readFileSync(
  join(__dirname, './schema/schema.generated.graphqls'),
  'utf8',
);

export const schema = makeExecutableSchema({ typeDefs, resolvers });

export async function createApp() {
  const app = express();

  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '10mb' }));

  // GraphQL (HTTP)
  const server = new ApolloServer({ schema });
  await server.start();
  app.use(
    '/graphql',
    cors({ origin: '*' }),
    expressMiddleware(server, {
      context: async ({ req }) => {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
          const token = authHeader.slice(7);
          const payload = verifyJwt(token);
          if (payload) {
            const user = await prisma.user.findUnique({ where: { id: payload.userId } });
            if (user) return { user };
          }
        }
        return {};
      },
    }),
  );

  // Auth routes
  app.use('/auth', authRouter);

  // REST endpoints that stay
  app.use('/events', eventsRouter);
  app.use('/attachments', attachmentsRouter);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(errorHandler);

  return app;
}
