import type { WebSocket } from "ws";
import { randomUUID } from "crypto";
import type {
  BridgeLinkedCheckoutStatus,
  BridgeLinkedCheckoutActionResultPayload,
  GitCheckpointContext,
} from "@trace/shared";
import { sessionRouter } from "./session-router.js";
import { sessionService } from "../services/session.js";
import { runtimeDebug } from "./runtime-debug.js";
import { terminalRelay } from "./terminal-relay.js";
import { runtimeAccessService } from "../services/runtime-access.js";

/** Grace period before marking sessions disconnected — allows fast reconnects */
const DISCONNECT_GRACE_MS = 10_000;

/** Interval between server→client pings to keep the WebSocket alive through proxies (e.g. Render). */
const PING_INTERVAL_MS = 20_000;

type LocalBridgeAuth = {
  kind: "local";
  userId: string;
  organizationId: string;
  instanceId: string;
};

type CloudBridgeAuth = {
  kind: "cloud";
  userId: string;
  organizationId: string;
  instanceId: string;
};

type BridgeAuth = CloudBridgeAuth | LocalBridgeAuth;

export type BridgeConnectionRequest = {
  bridgeAuth?: BridgeAuth;
};

export function handleBridgeConnection(ws: WebSocket, req?: BridgeConnectionRequest) {
  // Default runtime ID; replaced if the bridge sends runtime_hello
  let runtimeId: string = randomUUID();
  let registered = false;
  const bridgeAuth = req?.bridgeAuth;

  runtimeDebug("bridge websocket connected", {
    provisionalRuntimeId: runtimeId,
    authKind: bridgeAuth?.kind ?? "unknown",
  });

  // Keep-alive: periodically ping the client to prevent idle timeout
  // from reverse proxies (Render closes idle WebSockets after ~55-60s).
  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      clearInterval(pingInterval);
      ws.terminate();
      return;
    }
    pongReceived = false;
    ws.ping();
  }, PING_INTERVAL_MS);

  ws.on("pong", () => {
    pongReceived = true;
  });

  // Serialize event creation per session to preserve ordering
  const queues = new Map<string, Promise<void>>();

  function enqueueEvent(sessionId: string, fn: () => Promise<void>) {
    const prev = queues.get(sessionId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    queues.set(sessionId, next);
  }

  ws.on("message", (raw: Buffer | string) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "runtime_hello") {
        void (async () => {
          const oldId = runtimeId;
          const newId = (msg.instanceId as string) ?? runtimeId;
          const hostingMode = (msg.hostingMode as "cloud" | "local") ?? "local";
          const supportedTools = (msg.supportedTools as string[]) ?? [
            "claude_code",
            "codex",
            "custom",
          ];
          const registeredRepoIds = (msg.registeredRepoIds as string[]) ?? [];

          runtimeDebug("received runtime_hello", {
            oldId,
            newId,
            label: msg.label,
            hostingMode,
            supportedTools,
            registeredRepoIds,
            authKind: bridgeAuth?.kind ?? "unknown",
          });

          if (!bridgeAuth) {
            runtimeDebug("bridge auth rejected runtime_hello without auth", {
              receivedInstanceId: newId,
            });
            ws.close(1008, "Bridge auth required");
            return;
          }

          if (bridgeAuth.kind === "local") {
            if (newId !== bridgeAuth.instanceId) {
              runtimeDebug("bridge auth rejected runtime_hello instance mismatch", {
                expectedInstanceId: bridgeAuth.instanceId,
                receivedInstanceId: newId,
              });
              ws.close(1008, "Bridge auth mismatch");
              return;
            }

            const bridgeRuntime = await runtimeAccessService.registerLocalRuntimeConnection({
              instanceId: newId,
              organizationId: bridgeAuth.organizationId,
              ownerUserId: bridgeAuth.userId,
              label: (msg.label as string) ?? newId,
              hostingMode: "local",
              metadata: {
                supportedTools,
                registeredRepoIds,
              },
            });

            if (registered && oldId !== newId) {
              sessionRouter.unregisterRuntime(oldId, ws);
            }

            runtimeId = newId;
            const existingRuntime = sessionRouter.getRuntime(newId);
            sessionRouter.registerRuntime({
              id: runtimeId,
              label: bridgeRuntime.label,
              ws,
              hostingMode: "local",
              organizationId: bridgeRuntime.organizationId,
              ownerUserId: bridgeRuntime.ownerUserId,
              bridgeRuntimeId: bridgeRuntime.id,
              supportedTools,
              registeredRepoIds,
            });

            if (existingRuntime && existingRuntime.ws !== ws) {
              runtimeDebug("closing superseded websocket for runtime", {
                runtimeId: newId,
                previousLabel: existingRuntime.label,
                previousReadyState: existingRuntime.ws.readyState,
              });
              existingRuntime.ws.close();
            }
          } else if (bridgeAuth.kind === "cloud") {
            if (newId !== bridgeAuth.instanceId || hostingMode !== "cloud") {
              runtimeDebug("cloud bridge auth rejected runtime_hello mismatch", {
                expectedInstanceId: bridgeAuth.instanceId,
                receivedInstanceId: newId,
                receivedHostingMode: hostingMode,
              });
              ws.close(1008, "Bridge auth mismatch");
              return;
            }

            if (registered && oldId !== newId) {
              sessionRouter.unregisterRuntime(oldId, ws);
            }

            runtimeId = newId;
            const existingRuntime = sessionRouter.getRuntime(newId);
            sessionRouter.registerRuntime({
              id: runtimeId,
              label: (msg.label as string) ?? runtimeId,
              ws,
              hostingMode: "cloud",
              organizationId: bridgeAuth.organizationId,
              ownerUserId: bridgeAuth.userId,
              supportedTools,
              registeredRepoIds,
            });

            if (existingRuntime && existingRuntime.ws !== ws) {
              runtimeDebug("closing superseded websocket for runtime", {
                runtimeId: newId,
                previousLabel: existingRuntime.label,
                previousReadyState: existingRuntime.ws.readyState,
              });
              existingRuntime.ws.close();
            }
          }

          registered = true;

          // Restore all sessions owned by this runtime from the DB.
          // The DB (connection.runtimeInstanceId) is the single source of truth —
          // the bridge doesn't need to report session lists.
          runtimeDebug("restoring sessions for runtime after hello", { runtimeId });
          sessionService.restoreSessionsForRuntime(runtimeId).catch((err) => {
            console.error("[bridge] error restoring sessions for runtime:", err);
          });

          // Warm the linked-checkout cache for each registered repo so
          // `BridgeRuntime.linkedCheckouts` can answer without a per-call
          // round-trip on every home-screen poll. Per-repo failures are
          // ignored — the bridge may not have a checkout configured.
          // Fire-and-forget: a home-screen poll arriving in the brief window
          // before responses land will see an empty list; the next poll
          // (10s later) picks up the warmed cache.
          for (const repoId of registeredRepoIds) {
            sessionRouter.getLinkedCheckoutStatus(runtimeId, repoId).catch(() => {});
          }

          // Restore terminal relay entries from bridge-reported active terminals
          if (Array.isArray(msg.activeTerminals) && msg.activeTerminals.length > 0) {
            const activeTerminals = (msg.activeTerminals as unknown[]).filter(
              (t): t is { terminalId: string; sessionId: string } =>
                typeof t === "object" &&
                t !== null &&
                typeof (t as Record<string, unknown>).terminalId === "string" &&
                typeof (t as Record<string, unknown>).sessionId === "string",
            );
            if (activeTerminals.length > 0) {
              runtimeDebug("restoring terminals from bridge", {
                runtimeId,
                count: activeTerminals.length,
              });
              terminalRelay.restoreTerminals(runtimeId, activeTerminals).catch((err) => {
                console.error("[bridge] error restoring terminals:", err);
              });
            }
          }
        })().catch((err) => {
          console.error("[bridge] error handling runtime_hello:", err);
          ws.close(1011, "runtime_hello failed");
        });
        return;
      }

      if (msg.type === "runtime_heartbeat") {
        sessionRouter.recordHeartbeat(runtimeId, ws);
        return;
      }

      if (msg.type === "repo_linked" && msg.repoId) {
        const repoId = msg.repoId as string;
        sessionRouter.addRegisteredRepo(runtimeId, repoId, ws);
        // Warm the linked-checkout cache for the freshly-linked repo (no-op
        // if no checkout is configured for it).
        sessionRouter.getLinkedCheckoutStatus(runtimeId, repoId).catch(() => {});
        return;
      }

      if (msg.type === "linked_checkout_status_result" && typeof msg.requestId === "string") {
        sessionRouter.resolveLinkedCheckoutStatusRequest(
          msg.requestId,
          msg.status as BridgeLinkedCheckoutStatus,
        );
        return;
      }

      if (msg.type === "linked_checkout_action_result" && typeof msg.requestId === "string") {
        sessionRouter.resolveLinkedCheckoutActionRequest(
          msg.requestId,
          msg.result as BridgeLinkedCheckoutActionResultPayload,
        );
        return;
      }

      if (msg.type === "session_git_sync_status_result" && typeof msg.requestId === "string") {
        sessionRouter.resolveSessionGitSyncStatusRequest(
          msg.requestId,
          msg.status && typeof msg.status === "object" && !Array.isArray(msg.status)
            ? (msg.status as {
                branch: string | null;
                headCommitSha: string | null;
                upstreamBranch: string | null;
                upstreamCommitSha: string | null;
                aheadCount: number;
                behindCount: number;
                hasUncommittedChanges: boolean;
              })
            : undefined,
          typeof msg.error === "string" ? msg.error : undefined,
        );
        return;
      }

      if (
        msg.type === "branches_result" &&
        typeof msg.requestId === "string" &&
        Array.isArray(msg.branches)
      ) {
        const branches = (msg.branches as unknown[]).filter(
          (b): b is string => typeof b === "string",
        );
        sessionRouter.resolveBranchRequest(
          msg.requestId,
          branches,
          typeof msg.error === "string" ? msg.error : undefined,
        );
        return;
      }

      if (
        msg.type === "files_result" &&
        typeof msg.requestId === "string" &&
        Array.isArray(msg.files)
      ) {
        const files = (msg.files as unknown[]).filter((f): f is string => typeof f === "string");
        sessionRouter.resolveFileRequest(
          msg.requestId,
          files,
          typeof msg.error === "string" ? msg.error : undefined,
        );
        return;
      }

      if (msg.type === "file_content_result" && typeof msg.requestId === "string") {
        sessionRouter.resolveFileContentRequest(
          msg.requestId,
          typeof msg.content === "string" ? msg.content : "",
          typeof msg.error === "string" ? msg.error : undefined,
        );
        return;
      }

      if (msg.type === "branch_diff_result" && typeof msg.requestId === "string") {
        const files = Array.isArray(msg.files)
          ? (msg.files as Array<{
              path: string;
              status: string;
              additions: number;
              deletions: number;
            }>)
          : [];
        sessionRouter.resolveBranchDiffRequest(
          msg.requestId,
          files,
          typeof msg.error === "string" ? msg.error : undefined,
        );
        return;
      }

      if (msg.type === "file_at_ref_result" && typeof msg.requestId === "string") {
        sessionRouter.resolveFileAtRefRequest(
          msg.requestId,
          typeof msg.content === "string" ? msg.content : "",
          typeof msg.error === "string" ? msg.error : undefined,
        );
        return;
      }

      if (msg.type === "skills_result" && typeof msg.requestId === "string") {
        sessionRouter.resolveSkillsRequest(
          msg.requestId,
          Array.isArray(msg.skills)
            ? (msg.skills as Array<{
                name: string;
                description: string;
                source: "user" | "project";
              }>)
            : [],
          typeof msg.error === "string" ? msg.error : undefined,
        );
        return;
      }

      // Terminal messages — relay directly to frontend, no event store
      if (
        msg.type === "terminal_ready" ||
        msg.type === "terminal_output" ||
        msg.type === "terminal_exit" ||
        msg.type === "terminal_error"
      ) {
        terminalRelay.relayFromBridge(
          msg as { type: string; terminalId: string; [key: string]: unknown },
        );
        return;
      }

      if (msg.type === "session_output" && msg.sessionId) {
        const sessionId = msg.sessionId as string;
        const data = (msg.data ?? {}) as Record<string, unknown>;

        enqueueEvent(sessionId, async () => {
          await sessionService.recordOutput(sessionId, data);
        });
      } else if (msg.type === "session_complete" && msg.sessionId) {
        enqueueEvent(msg.sessionId, async () => {
          await sessionService.complete(msg.sessionId);
        });
      } else if (msg.type === "workspace_ready" && msg.sessionId) {
        enqueueEvent(msg.sessionId, async () => {
          await sessionService.workspaceReady(
            msg.sessionId,
            msg.workdir as string,
            msg.branch as string | undefined,
            msg.slug as string | undefined,
          );
        });
      } else if (msg.type === "workspace_failed" && msg.sessionId) {
        enqueueEvent(msg.sessionId, async () => {
          await sessionService.workspaceFailed(
            msg.sessionId,
            (msg.error as string) ?? "Unknown error",
          );
        });
      } else if (msg.type === "register_session" && msg.sessionId) {
        runtimeDebug("received register_session", { runtimeId, sessionId: msg.sessionId });
        sessionRouter.bindSession(msg.sessionId, runtimeId);
      } else if (msg.type === "tool_session_id" && msg.sessionId && msg.toolSessionId) {
        enqueueEvent(msg.sessionId, async () => {
          await sessionService.storeToolSessionId(
            msg.sessionId as string,
            msg.toolSessionId as string,
          );
        });
      } else if (msg.type === "tool_session_missing" && msg.sessionId && msg.toolSessionId) {
        const imageUrls = Array.isArray(msg.imageUrls)
          ? (msg.imageUrls as unknown[]).filter((url): url is string => typeof url === "string")
          : undefined;
        enqueueEvent(msg.sessionId, async () => {
          await sessionService.recoverMissingToolSession(msg.sessionId as string, {
            toolSessionId: msg.toolSessionId as string,
            message: typeof msg.message === "string" ? msg.message : undefined,
            interactionMode:
              typeof msg.interactionMode === "string" ? msg.interactionMode : undefined,
            checkpointContext:
              msg.checkpointContext &&
              typeof msg.checkpointContext === "object" &&
              !Array.isArray(msg.checkpointContext)
                ? (msg.checkpointContext as GitCheckpointContext)
                : null,
            imageUrls,
          });
        });
      } else if (msg.type === "git_checkpoint" && msg.sessionId && msg.checkpoint) {
        enqueueEvent(msg.sessionId, async () => {
          await sessionService.recordGitCheckpoint(msg.sessionId as string, msg.checkpoint);
        });
      }
    } catch (err) {
      console.error("[bridge] error handling message:", err);
    }
  });

  ws.on("error", (err: Error) => {
    runtimeDebug("bridge websocket error", { runtimeId, error: err.message });
  });

  ws.on("close", () => {
    clearInterval(pingInterval);
    runtimeDebug("bridge websocket closed, grace period starting", {
      runtimeId,
      graceMs: DISCONNECT_GRACE_MS,
    });
    const closedRuntimeId = bridgeAuth?.kind === "local" ? bridgeAuth.instanceId : runtimeId;
    const affectedSessions = registered ? sessionRouter.unregisterRuntime(runtimeId, ws) : [];
    runtimeDebug("bridge close affected sessions", {
      runtimeId: closedRuntimeId,
      affectedSessions,
    });

    if (bridgeAuth?.kind === "local") {
      runtimeAccessService.markRuntimeDisconnected(closedRuntimeId).catch((err) => {
        console.error("[bridge] failed to mark local runtime disconnected:", err);
      });
    }

    // Wait a grace period before marking sessions disconnected — if the bridge
    // reconnects quickly (e.g. brief network blip), restoreSessionsForRuntime
    // will rebind sessions and we can skip the disconnect notification entirely.
    setTimeout(() => {
      for (const sessionId of affectedSessions) {
        // Check if the runtime reconnected and reclaimed this session
        const reboundRuntime = sessionRouter.getRuntimeForSession(sessionId);
        if (reboundRuntime) {
          runtimeDebug("session rebound during grace period, skipping disconnect", {
            sessionId,
            oldRuntimeId: closedRuntimeId,
            newRuntimeId: reboundRuntime.id,
          });
          continue;
        }

        enqueueEvent(sessionId, async () => {
          await sessionService.markConnectionLost(
            sessionId,
            "runtime_disconnected",
            closedRuntimeId,
          );
        });
      }
    }, DISCONNECT_GRACE_MS);
  });
}
