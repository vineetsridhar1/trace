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
import { sessionRouter } from "./lib/session-router.js";
import { authenticateProvisionedRuntimeToken } from "./lib/runtime-adapters.js";
import { sessionService } from "./services/session.js";
import { createLegacyCloudMachineCompatibilityService } from "./lib/cloud-machine-compatibility.js";
import { runtimeDebug } from "./lib/runtime-debug.js";
import { handleTerminalConnection } from "./lib/terminal-handler.js";
import { connectRedis, disconnectRedis } from "./lib/redis.js";
import { pubsub } from "./lib/pubsub.js";
import { runtimeAccessService } from "./services/runtime-access.js";
import { isLocalMode } from "./lib/mode.js";
import {
  getAllowedCorsOrigins,
  hasSessionCookie,
  isAllowedBrowserOrigin,
  isCorsOriginAllowed,
  readHeaderValue,
  shouldRejectCredentialedBrowserUpgrade,
} from "./lib/cors.js";
import { buildAppleAppSiteAssociation } from "./lib/apple-app-site-association.js";

const require = createRequire(import.meta.url);
const typeDefs = readFileSync(require.resolve("@trace/gql/schema.graphql"), "utf-8");
const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requestHasSessionCookie(req: Pick<express.Request, "headers">): boolean {
  return hasSessionCookie(req.headers);
}

function requestHasBearerToken(req: Pick<express.Request, "headers">): boolean {
  return readHeaderValue(req.headers, "authorization")?.startsWith("Bearer ") ?? false;
}

async function main() {
  const app = express();
  const httpServer = createServer(app);
  const schema = makeExecutableSchema({ typeDefs, resolvers });
  const PORT = Number(process.env.PORT) || 4000 + Number(process.env.TRACE_PORT || 0);
  const localMode = isLocalMode();
  const allowedCorsOrigins = getAllowedCorsOrigins({
    localMode,
    nodeEnv: process.env.NODE_ENV,
    traceWebUrl: process.env.TRACE_WEB_URL,
    corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS,
  });
  let startupReady = false;

  app.get("/health", (_req: express.Request, res: express.Response) => {
    res.json({ status: "ok", ready: startupReady });
  });

  const appleTeamId = process.env.APPLE_TEAM_ID?.trim();
  const sendAppleAppSiteAssociation = (_req: express.Request, res: express.Response) => {
    if (!appleTeamId) {
      res.status(404).json({ error: "APPLE_TEAM_ID is not configured" });
      return;
    }
    res.type("application/json");
    res.set("Cache-Control", "public, max-age=300");
    res.send(buildAppleAppSiteAssociation(appleTeamId));
  };
  app.get("/.well-known/apple-app-site-association", sendAppleAppSiteAssociation);
  app.get("/apple-app-site-association", sendAppleAppSiteAssociation);

  const cloudMachineService = createLegacyCloudMachineCompatibilityService({ localMode });

  app.use(
    cors({
      origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
        if (isCorsOriginAllowed(allowedCorsOrigins, origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
    }),
  );
  // Webhook route needs raw body for signature verification — register before express.json()
  app.use("/webhooks/github", express.raw({ type: "application/json" }), webhookRouter);

  // Local storage PUT accepts raw body — register BEFORE express.json()
  if (localStorageRouter) app.use(localStorageRouter);

  app.use(express.json());
  app.use(cookieParser());
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (
      SAFE_HTTP_METHODS.has(req.method) ||
      !requestHasSessionCookie(req) ||
      requestHasBearerToken(req)
    ) {
      next();
      return;
    }

    if (!isAllowedBrowserOrigin(allowedCorsOrigins, req.headers)) {
      res.status(403).json({ error: "Invalid request origin" });
      return;
    }

    next();
  });
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
            ctx.extra?.request,
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
        lastHeartbeat: stale.lastHeartbeat,
      });
      const eviction = sessionRouter.evictRuntimeIfStale(stale.runtimeId, stale.lastHeartbeat);
      if (!eviction.evicted) {
        continue;
      }
      if (stale.runtimeId) {
        void runtimeAccessService.markRuntimeDisconnected(stale.runtimeId);
      }
      for (const sessionId of eviction.affectedSessions) {
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

  const deprovisionReconciler = setInterval(() => {
    void sessionService.reconcileStuckDeprovisions().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[deprovision-reconciler] iteration failed: ${message}`);
    });
  }, 30_000);

  // Route WebSocket upgrades by path
  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname } = new URL(req.url ?? "", "http://localhost");
    const rejectUpgrade = (statusCode: number, message: string): void => {
      socket.write(`HTTP/1.1 ${statusCode} ${message}\r\n\r\n`);
      socket.destroy();
    };
    if (
      (pathname === "/ws" || pathname === "/terminal") &&
      shouldRejectCredentialedBrowserUpgrade(allowedCorsOrigins, req.headers)
    ) {
      rejectUpgrade(403, "Forbidden");
      return;
    }

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
          const provisionedBridge = authenticateProvisionedRuntimeToken(cloudToken);
          const cloudBridge = provisionedBridge
            ? null
            : await cloudMachineService?.authenticateBridgeToken(cloudToken);
          const bridge = provisionedBridge
            ? provisionedBridge
            : cloudBridge
              ? {
                  instanceId: cloudBridge.runtimeInstanceId,
                  organizationId: cloudBridge.organizationId,
                  userId: cloudBridge.userId,
                }
              : null;
          if (!bridge) {
            rejectUpgrade(401, "Unauthorized");
            return;
          }
          bridgeReq.bridgeAuth = {
            kind: "cloud",
            instanceId: bridge.instanceId,
            organizationId: bridge.organizationId,
            userId: bridge.userId,
            ...(provisionedBridge
              ? {
                  sessionId: provisionedBridge.sessionId,
                  environmentId: provisionedBridge.environmentId,
                  allowedScope: provisionedBridge.allowedScope,
                  tool: provisionedBridge.tool,
                }
              : {}),
          };
        } else if (bridgeAuthToken) {
          const payload = verifyBridgeAuthToken(bridgeAuthToken);
          if (!payload) {
            rejectUpgrade(401, "Unauthorized");
            return;
          }
          bridgeReq.bridgeAuth = {
            kind: "local",
            userId: payload.userId,
            organizationId: payload.organizationId,
            instanceId: payload.instanceId,
          };
        } else {
          rejectUpgrade(401, "Unauthorized");
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
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await wsServerCleanup.dispose();
              clearInterval(staleRuntimeMonitor);
              clearInterval(deprovisionReconciler);
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
  app.use("/graphql", expressMiddleware(apollo, { context: buildContext }));

  await new Promise<void>((resolve) => {
    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`Server ready at http://localhost:${PORT}/graphql`);
      console.log(`Subscriptions ready at ws://localhost:${PORT}/ws`);
      console.log(`Bridge ready at ws://localhost:${PORT}/bridge`);
      resolve();
    });
  });

  // Connect Redis and initialize pub/sub message listener after binding the health check port.
  if (!localMode) {
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
  }

  // Restore cloud machine state from DB
  if (cloudMachineService) {
    await cloudMachineService.restoreFromDb();
  }

  startupReady = true;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
