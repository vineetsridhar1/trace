import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { expressMiddleware } from "@as-integrations/express5";
import type { ExpressContextFunctionArgument } from "@as-integrations/express5";
import express from "express";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { makeExecutableSchema } from "@graphql-tools/schema";
import jwt from "jsonwebtoken";
import { resolvers } from "./schema/resolvers.js";
import type { Context } from "./context.js";
import { AuthenticationError } from "./lib/errors.js";
import { prisma } from "./lib/db.js";
import { authRouter } from "./routes/auth.js";

const require = createRequire(import.meta.url);
const typeDefs = readFileSync(require.resolve("@trace/gql/schema.graphql"), "utf-8");

const JWT_SECRET = process.env.JWT_SECRET || "trace-dev-secret";

function parseCookieToken(cookieHeader?: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/trace_token=([^;]+)/);
  return match?.[1];
}

async function buildContext({ req }: ExpressContextFunctionArgument): Promise<Context> {
  // Support JWT cookie auth (primary) and x-user-id header (dev fallback)
  let userId: string | undefined;

  const token = req.cookies?.trace_token;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
      userId = payload.userId;
    } catch {
      throw new AuthenticationError("Invalid token");
    }
  } else {
    // Dev fallback: x-user-id header
    const rawUserId = req.headers["x-user-id"];
    userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
  }

  if (!userId) {
    throw new AuthenticationError();
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, organizationId: true, role: true },
  });

  if (!user) {
    throw new AuthenticationError("User not found");
  }

  return {
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role as Context["role"],
    actorType: "user",
  };
}

async function main() {
  const app = express();
  const httpServer = createServer(app);

  const schema = makeExecutableSchema({ typeDefs, resolvers });

  app.use(express.json());
  app.use(cookieParser());
  app.use(authRouter);

  // WebSocket server for subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: "/ws",
  });
  const wsServerCleanup = useServer(
    {
      schema,
      context: async (ctx) => {
        // Extract token from connection params or cookie header
        const token =
          (ctx.connectionParams?.token as string) ??
          parseCookieToken(ctx.extra?.request?.headers?.cookie);

        if (!token) throw new AuthenticationError("Missing auth token for WebSocket");

        let userId: string;
        try {
          const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
          userId = payload.userId;
        } catch {
          throw new AuthenticationError("Invalid token");
        }

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, organizationId: true, role: true },
        });
        if (!user) throw new AuthenticationError("User not found");

        return {
          userId: user.id,
          organizationId: user.organizationId,
          role: user.role as Context["role"],
          actorType: "user",
        } satisfies Context;
      },
    },
    wsServer,
  );

  // Bridge WebSocket server for Electron connections
  const bridgeWss = new WebSocketServer({
    server: httpServer,
    path: "/bridge",
  });

  bridgeWss.on("connection", (ws, req) => {
    console.log("[bridge] new connection from", req.url);
    ws.on("message", (data) => {
      console.log("[bridge] message:", data.toString());
    });
    ws.on("close", () => {
      console.log("[bridge] connection closed");
    });
  });

  // Apollo Server
  const apollo = new ApolloServer<Context>({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await wsServerCleanup.dispose();
              bridgeWss.close();
            },
          };
        },
      },
    ],
  });

  await apollo.start();

  app.use("/graphql", expressMiddleware(apollo, { context: buildContext }));

  const PORT = process.env.PORT ?? 4000;
  httpServer.listen(PORT, () => {
    console.log(`Server ready at http://localhost:${PORT}/graphql`);
    console.log(`Subscriptions ready at ws://localhost:${PORT}/ws`);
    console.log(`Bridge ready at ws://localhost:${PORT}/bridge`);
  });
}

main().catch(console.error);
