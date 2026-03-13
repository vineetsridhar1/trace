import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import express, { type RequestHandler } from "express";
import { createServer } from "http";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { resolvers } from "./schema/resolvers.js";

const require = createRequire(import.meta.url);
const typeDefs = readFileSync(require.resolve("@trace/gql/schema.graphql"), "utf-8");

async function main() {
  const app = express();
  const httpServer = createServer(app);

  const schema = makeExecutableSchema({ typeDefs, resolvers });

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
  const apollo = new ApolloServer({
    schema,
    plugins: [
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await wsServerCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  await apollo.start();

  app.use(express.json());
  app.use(
    "/graphql",
    expressMiddleware(apollo, {
      context: async ({ req }) => ({
        // TODO: auth context
        userId: req.headers["x-user-id"] as string | undefined,
        actorType: "user" as const,
      }),
    }) as unknown as RequestHandler,
  );

  const PORT = process.env.PORT ?? 4000;
  httpServer.listen(PORT, () => {
    console.log(`Server ready at http://localhost:${PORT}/graphql`);
    console.log(`Subscriptions ready at ws://localhost:${PORT}/ws`);
    console.log(`Bridge ready at ws://localhost:${PORT}/bridge`);
  });
}

main().catch(console.error);
