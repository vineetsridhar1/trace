import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { expressMiddleware } from "@as-integrations/express5";
import type { ExpressContextFunctionArgument } from "@as-integrations/express5";
import express from "express";
import { createServer } from "http";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { resolvers } from "./schema/resolvers.js";
import type { Context } from "./context.js";
import { AuthenticationError } from "./lib/errors.js";
import { prisma } from "./lib/db.js";

const require = createRequire(import.meta.url);
const typeDefs = readFileSync(require.resolve("@trace/gql/schema.graphql"), "utf-8");

async function buildContext({ req }: ExpressContextFunctionArgument): Promise<Context> {
  // TODO: Replace header-based auth with JWT verification
  const rawUserId = req.headers["x-user-id"];
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;

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

  // WebSocket server for subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: "/ws",
  });
  const wsServerCleanup = useServer({ schema }, wsServer);

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
