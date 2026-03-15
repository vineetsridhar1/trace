import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { expressMiddleware } from "@as-integrations/express5";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { resolvers } from "./schema/resolvers.js";
import type { Context } from "./context.js";
import { authRouter } from "./routes/auth.js";
import { buildContext, buildWsContext } from "./lib/auth.js";
import { handleBridgeConnection } from "./lib/bridge-handler.js";

const require = createRequire(import.meta.url);
const typeDefs = readFileSync(require.resolve("@trace/gql/schema.graphql"), "utf-8");

async function main() {
  const app = express();
  const httpServer = createServer(app);
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  app.use(cors({
    origin: process.env.CORS_ALLOWED_ORIGINS
      ? process.env.CORS_ALLOWED_ORIGINS.split(",")
      : true,
    credentials: true,
  }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(authRouter);

  // GraphQL subscriptions
  const wsServer = new WebSocketServer({ noServer: true });
  const wsServerCleanup = useServer(
    {
      schema,
      context: async (ctx) =>
        buildWsContext(
          ctx.connectionParams as Record<string, unknown> | undefined,
          ctx.extra?.request?.headers?.cookie,
        ),
    },
    wsServer,
  );

  // Bridge for Electron/desktop session control
  const bridgeWss = new WebSocketServer({ noServer: true });
  bridgeWss.on("connection", handleBridgeConnection);

  // Route WebSocket upgrades by path
  httpServer.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "", "http://localhost");

    if (pathname === "/ws") {
      wsServer.handleUpgrade(req, socket, head, (ws) => {
        wsServer.emit("connection", ws, req);
      });
    } else if (pathname === "/bridge") {
      bridgeWss.handleUpgrade(req, socket, head, (ws) => {
        bridgeWss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
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
