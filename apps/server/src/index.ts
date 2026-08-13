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
import { slackRouter } from "./routes/slack.js";
import { gitRouter } from "./routes/git.js";
import { designPreviewRouter } from "./routes/design-preview.js";
import { animationPreviewRouter } from "./routes/animation-preview.js";
import { agentArtifactRouter } from "./routes/agent-artifact.js";
import { artifactContentRouter } from "./routes/artifact-content.js";
import { nangoRouter } from "./routes/nango.js";
import { appIntegrationsRouter } from "./routes/app-integrations.js";
import { appDeploymentCallbackRouter } from "./routes/app-deployment-callback.js";
import { slackEventBridge } from "./lib/slack/event-bridge.js";
import { isSlackConfigured } from "./lib/slack/config.js";
import { buildContext, buildWsContext, verifyBridgeAuthToken } from "./lib/auth.js";
import { handleBridgeConnection, type BridgeConnectionRequest } from "./lib/bridge-handler.js";
import { sessionRouter } from "./lib/session-router.js";
import { authenticateProvisionedRuntimeToken } from "./lib/runtime-adapters.js";
import { sessionService } from "./services/session.js";
import { codexCredentialService } from "./services/codex-credential.js";
import { runtimeDebug } from "./lib/runtime-debug.js";
import { handleTerminalConnection } from "./lib/terminal-handler.js";
import { connectRedis, disconnectRedis } from "./lib/redis.js";
import { pubsub } from "./lib/pubsub.js";
import { runtimeAccessService } from "./services/runtime-access.js";
import { isLocalMode } from "./lib/mode.js";
import { withDistributedLock } from "./lib/distributed-lock.js";
import {
  getAllowedCorsOrigins,
  hasSessionCookie,
  isAllowedBrowserOrigin,
  isCorsOriginAllowed,
  readHeaderValue,
  shouldRejectCredentialedBrowserUpgrade,
} from "./lib/cors.js";
import { buildAppleAppSiteAssociation } from "./lib/apple-app-site-association.js";
import { logAgentEnvironmentTelemetry } from "./lib/agent-environment-telemetry.js";
import { endpointProxyService } from "./services/endpoint-proxy.js";
import { sessionApplicationService } from "./services/session-applications.js";
import { seedCloudForAllOrgs } from "./services/cloud-bootstrap.js";
import { managedGitService } from "./services/managed-git.js";
import { designSystemService } from "./services/design-system.js";
import {
  assertPreviewHostIsolated,
  endpointTrafficRetentionHours,
} from "./services/endpoint-utils.js";
import { ServerLifecycle } from "./lib/server-lifecycle.js";
import { realtimeBackplane } from "./lib/realtime-backplane.js";
import { runtimeDirectory } from "./lib/runtime-directory.js";
import { publishedAppGateway } from "./services/published-app-gateway.js";
import { appDeploymentService } from "./services/app-deployment.js";
import { reconcilePendingStorageObjectDeletions } from "./services/storage-object-deletion.js";

// A single proxied response is base64-framed over the bridge WS; bound a single
// message so an untrusted runtime can't force an unbounded allocation.
const BRIDGE_WS_MAX_PAYLOAD_BYTES = 64 * 1024 * 1024;

const require = createRequire(import.meta.url);
const typeDefs = readFileSync(require.resolve("@trace/gql/schema.graphql"), "utf-8");
const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_CLOUD_SESSION_GROUP_IDLE_CLEANUP_AFTER_MS = 2 * 60 * 60 * 1000;
const DEFAULT_CLOUD_SESSION_GROUP_ACTIVE_IDLE_CLEANUP_AFTER_MS = 60 * 60 * 1000;
const DEFAULT_CLOUD_SESSION_GROUP_IDLE_CLEANUP_INTERVAL_MS = 60 * 1000;
const CLOUD_SESSION_GROUP_IDLE_CLEANUP_LOCK_KEY = "trace:jobs:cloud-session-group-idle-cleanup";
const DEPROVISION_RECONCILE_LOCK_KEY = "trace:jobs:deprovision-reconcile";
const RUNTIME_HARD_DEADLINE_RECONCILE_INTERVAL_MS = 60 * 1000;
const RUNTIME_HARD_DEADLINE_RECONCILE_LOCK_KEY = "trace:jobs:runtime-hard-deadline-reconcile";
const ENDPOINT_TRAFFIC_CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
const ENDPOINT_TRAFFIC_CLEANUP_LOCK_KEY = "trace:jobs:endpoint-traffic-cleanup";
const DESIGN_PREVIEW_RECONCILE_INTERVAL_MS = 30 * 1000;
const DESIGN_SYSTEM_ARTIFACT_RECONCILE_INTERVAL_MS = 30 * 1000;
const DESIGN_PREVIEW_RECONCILE_LOCK_KEY = "trace:jobs:design-preview-reconcile";
const PDF_EXPORT_RECONCILE_LOCK_KEY = "trace:jobs:pdf-export-reconcile";
const RUNTIME_PREVIEW_RECONCILE_LOCK_KEY = "trace:jobs:runtime-preview-reconcile";
const DESIGN_SYSTEM_ARTIFACT_RECONCILE_LOCK_KEY = "trace:jobs:design-system-artifact-reconcile";
const APP_DEPLOYMENT_DISPATCH_INTERVAL_MS = 30 * 1000;
const APP_DEPLOYMENT_DISPATCH_LOCK_KEY = "trace:jobs:app-deployment-dispatch";
const STORAGE_OBJECT_DELETION_INTERVAL_MS = 30 * 1000;
const STORAGE_OBJECT_DELETION_LOCK_KEY = "trace:jobs:storage-object-deletion";

function readDurationEnv(name: string, fallbackMs: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallbackMs;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.warn(`[config] ignoring invalid ${name}=${raw}; using ${fallbackMs}`);
    return fallbackMs;
  }
  return Math.floor(parsed);
}

async function withRedisJobLock<T>(options: {
  enabled: boolean;
  key: string;
  ttlMs: number;
  run: () => Promise<T>;
}): Promise<T | null> {
  if (!options.enabled) return options.run();
  const locked = await withDistributedLock({ key: options.key, ttlMs: options.ttlMs }, options.run);
  return locked.acquired ? locked.value : null;
}

function requestHasSessionCookie(req: Pick<express.Request, "headers">): boolean {
  return hasSessionCookie(req.headers);
}

function requestHasBearerToken(req: Pick<express.Request, "headers">): boolean {
  return readHeaderValue(req.headers, "authorization")?.startsWith("Bearer ") ?? false;
}

function readBearerToken(req: Pick<IncomingMessage, "headers">): string | null {
  const authorization = readHeaderValue(req.headers, "authorization");
  if (!authorization) return null;
  const [scheme, ...rest] = authorization.split(" ");
  if (scheme.toLowerCase() !== "bearer" || rest.length !== 1) return null;
  return rest[0]?.trim() || null;
}

async function main() {
  const app = express();
  const httpServer = createServer(app);
  const schema = makeExecutableSchema({ typeDefs, resolvers });
  const PORT = Number(process.env.PORT) || 4000 + Number(process.env.TRACE_PORT || 0);
  const localMode = isLocalMode();
  // Fail fast if untrusted previews would share a registrable domain with the
  // Trace app origin (throws in production, warns otherwise).
  assertPreviewHostIsolated(process.env.TRACE_WEB_URL);
  const allowedCorsOrigins = getAllowedCorsOrigins({
    localMode,
    nodeEnv: process.env.NODE_ENV,
    traceWebUrl: process.env.TRACE_WEB_URL,
    corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS,
  });
  const lifecycle = new ServerLifecycle();

  // Once draining begins, fail new application work immediately. The health
  // endpoints remain available so the load balancer can observe readiness
  // before the process closes its long-lived connections.
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!lifecycle.isDraining() || req.path === "/health" || req.path === "/health/live") {
      next();
      return;
    }
    res.status(503).json({ error: "Server is draining" });
  });

  // Preview-proxied requests (Host = <key>.<previewHost>) belong to the app
  // session's own server. Hand them to the endpoint proxy BEFORE any CORS /
  // cookie / body middleware: the app is same-origin with itself, so Trace's
  // cross-origin API allowlist must not apply — otherwise the app's own /api
  // calls (whose Origin is the preview host, not an allowlisted Trace origin)
  // are rejected by CORS before the proxy ever sees them.
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const appSlug = publishedAppGateway.extractSlug(req.headers.host);
    if (!appSlug) {
      next();
      return;
    }
    void publishedAppGateway.handle(req, res, appSlug).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) res.status(500);
      res.end(message);
    });
  });

  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const endpointKey = endpointProxyService.extractKey(req.headers.host);
    if (!endpointKey) {
      next();
      return;
    }
    void endpointProxyService.handleHttpRequest(req, res, endpointKey).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) res.status(500);
      res.end(message);
    });
  });

  app.get("/health", (_req: express.Request, res: express.Response) => {
    res.status(lifecycle.isReady() ? 200 : 503).json(lifecycle.snapshot());
  });
  app.get("/health/live", (_req: express.Request, res: express.Response) => {
    res.json({ status: "ok" });
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
  app.use(cookieParser());

  // Webhook route needs raw body for signature verification — register before express.json()
  app.use("/webhooks/github", express.raw({ type: "application/json" }), webhookRouter);
  app.use("/webhooks/nango", express.raw({ type: "application/json" }), nangoRouter);

  // Slack router applies per-endpoint body parsers (raw for /events, urlencoded for /link/complete),
  // so register before express.json() so the events webhook keeps a raw buffer.
  app.use("/slack", slackRouter);

  // Local storage PUT accepts raw body — register BEFORE express.json()
  if (localStorageRouter) app.use(localStorageRouter);

  // Managed git smart-HTTP streams binary pack bodies and reads the request
  // stream directly — register BEFORE express.json() so the body is untouched.
  app.use("/git", gitRouter);
  app.use(designPreviewRouter);
  app.use(animationPreviewRouter);
  app.use(agentArtifactRouter);

  app.use(express.json());
  app.use(artifactContentRouter);
  app.use(appIntegrationsRouter);
  app.post("/runtime/codex-auth", async (req: express.Request, res: express.Response) => {
    const token = readBearerToken(req);
    const runtime = token ? authenticateProvisionedRuntimeToken(token) : null;
    const authJson = (req.body as { authJson?: unknown }).authJson;
    if (!runtime || runtime.tool !== "codex")
      return res.status(401).json({ error: "Unauthorized" });
    if (typeof authJson !== "string" || authJson.length > 64 * 1024) {
      return res.status(400).json({ error: "Invalid Codex session credential" });
    }
    try {
      JSON.parse(authJson) as unknown;
      await codexCredentialService.set(runtime.userId, "chatgpt_session", authJson);
      return res.status(204).end();
    } catch {
      return res.status(400).json({ error: "Invalid Codex session credential" });
    }
  });
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
  app.use(appDeploymentCallbackRouter);

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
  const bridgeWss = new WebSocketServer({
    noServer: true,
    maxPayload: BRIDGE_WS_MAX_PAYLOAD_BYTES,
  });
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
      logAgentEnvironmentTelemetry("runtime.heartbeat_stale", {
        runtimeId: stale.runtimeId,
        sessionIds: stale.sessionIds,
        lastHeartbeat: stale.lastHeartbeat,
        freshnessMs: Date.now() - stale.lastHeartbeat,
      });
      if (stale.runtimeId) {
        void runtimeAccessService.markRuntimeDisconnected(
          stale.runtimeInstanceId,
          stale.organizationId,
          stale.connectedAt,
        );
      }
      for (const sessionId of eviction.affectedSessions) {
        runtimeDebug("marking session disconnected after stale runtime eviction", {
          runtimeId: stale.runtimeId,
          sessionId,
        });
        void sessionService.markConnectionLost(
          sessionId,
          "runtime_heartbeat_timeout",
          stale.runtimeInstanceId,
        );
      }
    }
  }, 5_000);

  const deprovisionReconciler = setInterval(() => {
    const startedAt = Date.now();
    void withDistributedLock(
      {
        key: DEPROVISION_RECONCILE_LOCK_KEY,
        ttlMs: 10 * 60_000,
      },
      () => sessionService.reconcileStuckDeprovisions(),
    )
      .then((locked) => {
        if (!locked.acquired) return;
        const result = locked.value;
        logAgentEnvironmentTelemetry("deprovision.reconciler_iteration", {
          reconciledCount: result.reconciled.length,
          abandonedCount: result.abandoned.length,
          durationMs: Date.now() - startedAt,
        });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[deprovision-reconciler] iteration failed: ${message}`);
        logAgentEnvironmentTelemetry("deprovision.reconciler_iteration_failed", {
          durationMs: Date.now() - startedAt,
          error: message,
        });
      });
  }, 30_000);

  const reconcileDesignPreviews = () => {
    void withRedisJobLock({
      enabled: !localMode,
      key: DESIGN_PREVIEW_RECONCILE_LOCK_KEY,
      ttlMs: DESIGN_PREVIEW_RECONCILE_INTERVAL_MS * 2,
      run: () => managedGitService.retryPendingDesignCommitPreviews(),
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[design-preview-reconciler] iteration failed: ${message}`);
    });
  };
  const designPreviewReconciler = setInterval(
    reconcileDesignPreviews,
    DESIGN_PREVIEW_RECONCILE_INTERVAL_MS,
  );
  const reconcileStorageObjectDeletions = () => {
    void withRedisJobLock({
      enabled: !localMode,
      key: STORAGE_OBJECT_DELETION_LOCK_KEY,
      ttlMs: STORAGE_OBJECT_DELETION_INTERVAL_MS * 2,
      run: () => reconcilePendingStorageObjectDeletions(),
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[storage-object-deletion] iteration failed: ${message}`);
    });
  };
  const storageObjectDeletionReconciler = setInterval(
    reconcileStorageObjectDeletions,
    STORAGE_OBJECT_DELETION_INTERVAL_MS,
  );
  const reconcilePdfExports = () => {
    void withRedisJobLock({
      enabled: !localMode,
      key: PDF_EXPORT_RECONCILE_LOCK_KEY,
      ttlMs: DESIGN_PREVIEW_RECONCILE_INTERVAL_MS * 2,
      run: () => managedGitService.retryPendingPdfExports(),
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[pdf-export-reconciler] iteration failed: ${message}`);
    });
  };
  const pdfExportReconciler = setInterval(
    reconcilePdfExports,
    DESIGN_PREVIEW_RECONCILE_INTERVAL_MS,
  );
  const reconcileRuntimePreviews = () => {
    void withRedisJobLock({
      enabled: !localMode,
      key: RUNTIME_PREVIEW_RECONCILE_LOCK_KEY,
      ttlMs: DESIGN_PREVIEW_RECONCILE_INTERVAL_MS * 2,
      run: async () => {
        await managedGitService.retryPendingAnimationExports();
        await managedGitService.retryPendingDesignSystemExports();
      },
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[runtime-preview-reconciler] iteration failed: ${message}`);
    });
  };
  const runtimePreviewReconciler = setInterval(
    reconcileRuntimePreviews,
    DESIGN_PREVIEW_RECONCILE_INTERVAL_MS,
  );
  const reconcileDesignSystemArtifacts = () => {
    void withRedisJobLock({
      enabled: !localMode,
      key: DESIGN_SYSTEM_ARTIFACT_RECONCILE_LOCK_KEY,
      ttlMs: DESIGN_SYSTEM_ARTIFACT_RECONCILE_INTERVAL_MS * 2,
      run: () => designSystemService.reconcileCommitArtifacts(),
    }).catch((error: unknown) => {
      console.warn(
        "[design-system-reconciler] iteration failed",
        error instanceof Error ? error.message : String(error),
      );
    });
  };
  const designSystemArtifactReconciler = setInterval(
    reconcileDesignSystemArtifacts,
    DESIGN_SYSTEM_ARTIFACT_RECONCILE_INTERVAL_MS,
  );
  designSystemArtifactReconciler.unref();

  const cloudIdleCleanupAfterMs = readDurationEnv(
    "TRACE_CLOUD_SESSION_GROUP_IDLE_CLEANUP_AFTER_MS",
    DEFAULT_CLOUD_SESSION_GROUP_IDLE_CLEANUP_AFTER_MS,
  );
  const cloudIdleCleanupIntervalMs = readDurationEnv(
    "TRACE_CLOUD_SESSION_GROUP_IDLE_CLEANUP_INTERVAL_MS",
    DEFAULT_CLOUD_SESSION_GROUP_IDLE_CLEANUP_INTERVAL_MS,
  );
  const cloudActiveIdleCleanupAfterMs = readDurationEnv(
    "TRACE_CLOUD_SESSION_GROUP_ACTIVE_IDLE_CLEANUP_AFTER_MS",
    DEFAULT_CLOUD_SESSION_GROUP_ACTIVE_IDLE_CLEANUP_AFTER_MS,
  );
  const cloudIdleCleanupLockTtlMs = Math.max(cloudIdleCleanupIntervalMs * 2, 5 * 60 * 1000);
  let cloudIdleCleanupRunning = false;
  const cloudIdleCleanup =
    cloudIdleCleanupAfterMs > 0 && cloudIdleCleanupIntervalMs > 0
      ? setInterval(() => {
          if (cloudIdleCleanupRunning) {
            logAgentEnvironmentTelemetry("cloud_idle_cleanup.iteration_skipped", {
              reason: "in_process_overlap",
              idleAfterMs: cloudIdleCleanupAfterMs,
            });
            return;
          }

          cloudIdleCleanupRunning = true;
          const startedAt = Date.now();
          void withRedisJobLock({
            enabled: !localMode,
            key: CLOUD_SESSION_GROUP_IDLE_CLEANUP_LOCK_KEY,
            ttlMs: cloudIdleCleanupLockTtlMs,
            run: () =>
              sessionService.cleanupIdleCloudSessionGroups({
                idleAfterMs: cloudIdleCleanupAfterMs,
                activeIdleAfterMs: cloudActiveIdleCleanupAfterMs,
              }),
          })
            .then((result) => {
              if (!result) {
                logAgentEnvironmentTelemetry("cloud_idle_cleanup.iteration_skipped", {
                  reason: "distributed_lock_held",
                  idleAfterMs: cloudIdleCleanupAfterMs,
                  durationMs: Date.now() - startedAt,
                });
                return;
              }
              if (result.cleaned.length > 0) {
                console.log(
                  `[cloud-idle-cleanup] cleaned ${result.cleaned.length} idle session groups`,
                );
              }
              logAgentEnvironmentTelemetry("cloud_idle_cleanup.iteration", {
                scannedCount: result.scanned,
                cleanedCount: result.cleaned.length,
                idleAfterMs: cloudIdleCleanupAfterMs,
                activeIdleAfterMs: cloudActiveIdleCleanupAfterMs,
                durationMs: Date.now() - startedAt,
              });
            })
            .catch((err: unknown) => {
              const message = err instanceof Error ? err.message : String(err);
              console.warn(`[cloud-idle-cleanup] iteration failed: ${message}`);
              logAgentEnvironmentTelemetry("cloud_idle_cleanup.iteration_failed", {
                idleAfterMs: cloudIdleCleanupAfterMs,
                durationMs: Date.now() - startedAt,
                error: message,
              });
            })
            .finally(() => {
              cloudIdleCleanupRunning = false;
            });
        }, cloudIdleCleanupIntervalMs)
      : null;

  const runtimeHardDeadlineReconciler = setInterval(() => {
    const startedAt = Date.now();
    void withRedisJobLock({
      enabled: !localMode,
      key: RUNTIME_HARD_DEADLINE_RECONCILE_LOCK_KEY,
      ttlMs: RUNTIME_HARD_DEADLINE_RECONCILE_INTERVAL_MS * 2,
      run: () => sessionService.reconcileRuntimeHardDeadlines(),
    })
      .then((result) => {
        if (!result) return;
        logAgentEnvironmentTelemetry("runtime.hard_deadline_reconciler_iteration", {
          scannedCount: result.scanned,
          warnedCount: result.warned.length,
          stoppedCount: result.stopped.length,
          durationMs: Date.now() - startedAt,
        });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[runtime-hard-deadline-reconciler] iteration failed: ${message}`);
        logAgentEnvironmentTelemetry("runtime.hard_deadline_reconciler_failed", {
          durationMs: Date.now() - startedAt,
          error: message,
        });
      });
  }, RUNTIME_HARD_DEADLINE_RECONCILE_INTERVAL_MS);

  const endpointTrafficCleanup = setInterval(() => {
    const startedAt = Date.now();
    void withRedisJobLock({
      enabled: !localMode,
      key: ENDPOINT_TRAFFIC_CLEANUP_LOCK_KEY,
      ttlMs: ENDPOINT_TRAFFIC_CLEANUP_INTERVAL_MS * 2,
      run: () => sessionApplicationService.deleteExpiredTraffic(endpointTrafficRetentionHours()),
    })
      .then((deleted) => {
        if (deleted && deleted > 0) {
          console.log(`[endpoint-traffic-cleanup] deleted ${deleted} expired traffic entries`);
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[endpoint-traffic-cleanup] iteration failed: ${message}`);
        logAgentEnvironmentTelemetry("endpoint_traffic_cleanup.iteration_failed", {
          durationMs: Date.now() - startedAt,
          error: message,
        });
      });
  }, ENDPOINT_TRAFFIC_CLEANUP_INTERVAL_MS);

  const appDeploymentDispatchReconciler = setInterval(() => {
    void withRedisJobLock({
      enabled: !localMode,
      key: APP_DEPLOYMENT_DISPATCH_LOCK_KEY,
      ttlMs: APP_DEPLOYMENT_DISPATCH_INTERVAL_MS * 2,
      run: async () => {
        await appDeploymentService.expireStaleDeployments();
        return appDeploymentService.reconcilePendingDispatches();
      },
    }).catch((error: unknown) => {
      console.warn(
        "[app-deployment-dispatch] iteration failed",
        error instanceof Error ? error.message : String(error),
      );
    });
  }, APP_DEPLOYMENT_DISPATCH_INTERVAL_MS);
  appDeploymentDispatchReconciler.unref();

  // Route WebSocket upgrades by path
  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!lifecycle.isReady()) {
      socket.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const publishedAppSlug = publishedAppGateway.extractSlug(req.headers.host);
    if (publishedAppSlug) {
      void publishedAppGateway
        .handleWebSocketUpgrade(req, socket as import("net").Socket, head, publishedAppSlug)
        .catch(() => socket.destroy());
      return;
    }
    if (endpointProxyService.isEndpointHost(req.headers.host)) {
      endpointProxyService.handleWebSocketUpgrade(req, socket as import("net").Socket, head);
      return;
    }

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
      const cloudToken = readBearerToken(req) ?? url.searchParams.get("token");
      const bridgeAuthToken = url.searchParams.get("bridgeAuthToken");

      const validateAndUpgrade = async () => {
        const bridgeReq = req as IncomingMessage & BridgeConnectionRequest;

        if (cloudToken) {
          const bridge = authenticateProvisionedRuntimeToken(cloudToken);
          if (!bridge) {
            rejectUpgrade(401, "Unauthorized");
            return;
          }
          bridgeReq.bridgeAuth = {
            kind: "cloud",
            instanceId: bridge.instanceId,
            organizationId: bridge.organizationId,
            userId: bridge.userId,
            sessionId: bridge.sessionId,
            environmentId: bridge.environmentId,
            allowedScope: bridge.allowedScope,
            tool: bridge.tool,
            leaseRequired: bridge.leaseRequired,
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
              // Stop every mutating background loop as soon as ECS begins
              // draining. Waiting for long-lived WebSockets first leaves the
              // retiring replica running cleanup/reconciliation against the
              // same rows as its replacement for the full deregistration
              // window.
              clearInterval(staleRuntimeMonitor);
              clearInterval(deprovisionReconciler);
              clearInterval(designPreviewReconciler);
              clearInterval(pdfExportReconciler);
              clearInterval(runtimePreviewReconciler);
              clearInterval(designSystemArtifactReconciler);
              if (cloudIdleCleanup) clearInterval(cloudIdleCleanup);
              clearInterval(runtimeHardDeadlineReconciler);
              clearInterval(endpointTrafficCleanup);
              clearInterval(appDeploymentDispatchReconciler);
              clearInterval(storageObjectDeletionReconciler);

              // Code 1012 tells bridges to reconnect to the replacement task
              // immediately. The persisted generation/lastSeen fences make the
              // draining task's delayed close callback harmless once that
              // reconnect lands on another replica.
              for (const client of bridgeWss.clients) {
                client.close(1012, "Service restart");
              }
              for (const client of terminalWss.clients) {
                client.close(1012, "Service restart");
              }

              await wsServerCleanup.dispose();
              bridgeWss.close();
              terminalWss.close();
              await slackEventBridge.stop();
              runtimeDirectory.stop();
              await realtimeBackplane.stop();
              await disconnectRedis();
            },
          };
        },
      },
    ],
  });

  await apollo.start();
  app.use("/graphql", expressMiddleware(apollo, { context: buildContext }));

  let shutdownPromise: Promise<void> | null = null;
  const shutdown = (signal: NodeJS.Signals): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    lifecycle.beginDrain();
    console.log(`[shutdown] ${signal} received; draining server`);
    const forceExitAfterMs = readDurationEnv("TRACE_SHUTDOWN_TIMEOUT_MS", 30_000);
    const forceExit = setTimeout(() => {
      console.error(`[shutdown] forced exit after ${forceExitAfterMs}ms`);
      process.exit(1);
    }, forceExitAfterMs);
    forceExit.unref();

    shutdownPromise = apollo
      .stop()
      .then(() => {
        lifecycle.markStopped();
        clearTimeout(forceExit);
        console.log("[shutdown] server drained");
      })
      .catch((error: unknown) => {
        clearTimeout(forceExit);
        console.error("[shutdown] drain failed:", error);
        throw error;
      });
    return shutdownPromise;
  };

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM").catch(() => process.exit(1));
  });
  process.once("SIGINT", () => {
    void shutdown("SIGINT").catch(() => process.exit(1));
  });

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

  // A replica must be listening on its command inbox and have hydrated the
  // shared runtime directory before it is eligible for load-balancer traffic.
  await realtimeBackplane.start();
  await runtimeDirectory.start();
  reconcileDesignPreviews();
  reconcilePdfExports();
  reconcileRuntimePreviews();
  reconcileDesignSystemArtifacts();
  reconcileStorageObjectDeletions();

  // Reattach Slack event bridges only when Slack is configured.
  if (isSlackConfigured()) {
    await slackEventBridge.rehydrate().catch((err: unknown) => {
      console.warn("[slack-bridge] rehydration failed:", (err as Error).message);
    });
  }

  // Load the shared cloud from cloud.config.json (if present) into every org so
  // they inherit it by default. Never fatal — a bad/missing config just skips.
  await seedCloudForAllOrgs().catch((err: unknown) => {
    console.error("[cloud-config] cloud seed failed:", (err as Error).message);
  });

  lifecycle.markReady();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
