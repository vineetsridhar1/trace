import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { expressMiddleware } from "@as-integrations/express5";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { WebSocketServer, type WebSocket } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { resolvers } from "./schema/resolvers.js";
import type { Context } from "./context.js";
import { authRouter } from "./routes/auth.js";
import { uploadRouter } from "./routes/upload.js";
import { localStorageRouter } from "./lib/storage/index.js";
import webhookRouter from "./routes/webhook.js";
import { buildContext, buildWsContext, verifyBridgeAuthToken } from "./lib/auth.js";
import { handleBridgeConnection, type BridgeConnectionRequest } from "./lib/bridge-handler.js";
import {
  formatGraphQLError,
  hardeningValidationRules,
} from "./lib/graphql-hardening.js";
import { rateLimit } from "./lib/rate-limit.js";
import { sessionRouter } from "./lib/session-router.js";
import { sessionService } from "./services/session.js";
import { CloudMachineService } from "./lib/cloud-machine-service.js";
import { flyProvider } from "./lib/fly-provider.js";
import { runtimeDebug } from "./lib/runtime-debug.js";
import { handleTerminalConnection } from "./lib/terminal-handler.js";
import { connectRedis, disconnectRedis } from "./lib/redis.js";
import { pubsub } from "./lib/pubsub.js";
import { runtimeAccessService } from "./services/runtime-access.js";

const require = createRequire(import.meta.url);
const typeDefs = readFileSync(require.resolve("@trace/gql/schema.graphql"), "utf-8");

async function main() {
  const app = express();
  const httpServer = createServer(app);
  const schema = makeExecutableSchema({ typeDefs, resolvers });
  const PORT = Number(process.env.PORT) || 4000 + Number(process.env.TRACE_PORT || 0);
  let startupReady = false;

  app.get("/health", (_req: express.Request, res: express.Response) => {
    res.json({ status: "ok", ready: startupReady });
  });

  // Initialize cloud machine service and inject into session router
  const cloudMachineService = new CloudMachineService(flyProvider, "fly");
  sessionRouter.setCloudMachineService(cloudMachineService);

  const WEB_URL =
    process.env.TRACE_WEB_URL ||
    `http://localhost:${3000 + Number(process.env.TRACE_PORT || 0)}`;
  const corsAllowed = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const defaultAllowed =
    corsAllowed.length > 0 ? corsAllowed : [WEB_URL];
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow same-origin / server-to-server (no Origin header) requests.
        if (!origin) return callback(null, true);
        if (defaultAllowed.includes(origin)) return callback(null, true);
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    }),
  );
  // Trust the first proxy hop (Fly / nginx) so req.secure reflects real TLS.
  app.set("trust proxy", 1);

  // Basic security headers (equivalent to helmet essentials).
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (process.env.NODE_ENV === "production") {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }
    next();
  });
  // Webhook route needs raw body for signature verification — register before express.json()
  app.use("/webhooks/github", express.raw({ type: "application/json" }), webhookRouter);

  // Local storage PUT accepts raw body — register BEFORE express.json()
  if (localStorageRouter) app.use(localStorageRouter);

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(authRouter);
  app.use(uploadRouter);

  // GraphQL subscriptions
  const wsServer = new WebSocketServer({ noServer: true });
  const wsServerCleanup = useServer(
    {
      schema,
      onConnect: async (ctx: {
        connectionParams?: Readonly<Record<string, unknown>>;
        extra: Record<string, unknown> & { request?: { headers: { cookie?: string } } };
      }) => {
        try {
          const context = await buildWsContext(
            ctx.connectionParams as Record<string, unknown> | undefined,
            ctx.extra?.request?.headers?.cookie,
          );
          (ctx.extra as Record<string, unknown>).__context = context;
          return true;
        } catch (err) {
          console.warn("[ws] connection rejected:", (err as Error).message);
          return false;
        }
      },
      context: async (ctx: { extra: Record<string, unknown> }) => {
        return (ctx.extra as Record<string, unknown>).__context as Context;
      },
    },
    wsServer,
  );

  // Bridge for Electron/desktop session control
  const bridgeWss = new WebSocketServer({ noServer: true });
  bridgeWss.on("connection", handleBridgeConnection);

  // Terminal relay for frontend terminal sessions
  const terminalWss = new WebSocketServer({ noServer: true });
  terminalWss.on("connection", handleTerminalConnection);

  const staleRuntimeMonitor = setInterval(() => {
    const staleRuntimes = sessionRouter.checkStaleRuntimes();
    for (const stale of staleRuntimes) {
      runtimeDebug("stale runtime monitor evicting runtime", {
        runtimeId: stale.runtimeId,
        sessionIds: stale.sessionIds,
      });
      const affectedSessions = sessionRouter.unregisterRuntime(stale.runtimeId);
      if (stale.runtimeId) {
        void runtimeAccessService.markRuntimeDisconnected(stale.runtimeId);
      }
      for (const sessionId of affectedSessions) {
        runtimeDebug("marking session disconnected after stale runtime eviction", {
          runtimeId: stale.runtimeId,
          sessionId,
        });
        void sessionService.markConnectionLost(
          sessionId,
          "runtime_heartbeat_timeout",
          stale.runtimeId,
        );
      }
    }
  }, 5_000);

  // Route WebSocket upgrades by path
  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname } = new URL(req.url ?? "", "http://localhost");

    if (pathname === "/ws") {
      wsServer.handleUpgrade(req, socket, head, (ws: WebSocket) => {
        wsServer.emit("connection", ws, req);
      });
    } else if (pathname === "/bridge") {
      const url = new URL(req.url ?? "", "http://localhost");
      const cloudToken = url.searchParams.get("token");
      const bridgeAuthToken = url.searchParams.get("bridgeAuthToken");

      const validateAndUpgrade = async () => {
        const bridgeReq = req as IncomingMessage & BridgeConnectionRequest;

        if (cloudToken) {
          if (!(await cloudMachineService.isValidBridgeToken(cloudToken))) {
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket.destroy();
            return;
          }
          bridgeReq.bridgeAuth = { kind: "cloud" };
        } else if (bridgeAuthToken) {
          const payload = verifyBridgeAuthToken(bridgeAuthToken);
          if (!payload) {
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket.destroy();
            return;
          }
          bridgeReq.bridgeAuth = {
            kind: "local",
            userId: payload.userId,
            organizationId: payload.organizationId,
            instanceId: payload.instanceId,
          };
        } else {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        bridgeWss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
          bridgeWss.emit("connection", ws, bridgeReq);
        });
      };
      validateAndUpgrade().catch(() => socket.destroy());
    } else if (pathname === "/terminal") {
      terminalWss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
        terminalWss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  // Apollo Server
  const apollo = new ApolloServer<Context>({
    schema,
    introspection: process.env.NODE_ENV !== "production",
    validationRules: hardeningValidationRules(),
    formatError: (formatted, error) => formatGraphQLError(formatted, error),
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await wsServerCleanup.dispose();
              clearInterval(staleRuntimeMonitor);
              bridgeWss.close();
              terminalWss.close();
              await disconnectRedis();
            },
          };
        },
      },
    ],
  });

  await apollo.start();
  // Per-IP GraphQL rate limit: 600 req/min ≈ 10/s steady-state, leaves headroom
  // for subscription set-up bursts while blocking brute force and aggressive
  // scrapers. Auth endpoints are rate limited separately at tighter levels.
  const graphqlLimiter = rateLimit({
    name: "graphql",
    max: 600,
    windowSeconds: 60,
  });
  app.use("/graphql", graphqlLimiter, expressMiddleware(apollo, { context: buildContext }));

  const bindHost = process.env.TRACE_BIND_HOST ?? "127.0.0.1";
  await new Promise<void>((resolve) => {
    httpServer.listen(PORT, bindHost, () => {
      console.log(`Server ready at http://localhost:${PORT}/graphql (bound ${bindHost})`);
      console.log(`Subscriptions ready at ws://localhost:${PORT}/ws`);
      console.log(`Bridge ready at ws://localhost:${PORT}/bridge`);
      resolve();
    });
  });

  // Connect Redis and initialize pub/sub message listener after binding the health check port.
  try {
    await connectRedis();
    pubsub.init();
  } catch {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    console.error(`\n[redis] Failed to connect to Redis at ${url}`);
    console.error(
      "[redis] Start Redis locally, for example: docker run -d --name trace-redis -p 6379:6379 redis:7-alpine\n",
    );
    process.exit(1);
  }

  // Restore cloud machine state from DB
  await cloudMachineService.restoreFromDb();

  startupReady = true;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
