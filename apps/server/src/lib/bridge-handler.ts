import type { WebSocket } from "ws";
import { randomUUID } from "crypto";
import type { CodingTool } from "@trace/gql";
import {
  CODING_TOOL_IDS,
  type BridgeLinkedCheckoutStatus,
  type BridgeLinkedCheckoutChangedFilePreview,
  type BridgeLinkedCheckoutActionResultPayload,
  type BridgeWorkspaceWarning,
  type BridgeRepoWorktree,
  type GitCheckpointContext,
} from "@trace/shared";
import { runtimeRouterKey, sessionRouter } from "./session-router.js";
import { sessionService } from "../services/session.js";
import { runtimeDebug } from "./runtime-debug.js";
import { terminalRelay } from "./terminal-relay.js";
import { runtimeAccessService } from "../services/runtime-access.js";
import { agentEnvironmentService } from "../services/agent-environment.js";
import { sessionApplicationService } from "../services/session-applications.js";
import { managedGitService } from "../services/managed-git.js";
import { endpointProxyService } from "../services/endpoint-proxy.js";
import { prisma } from "./db.js";
import { AuthorizationError } from "./errors.js";

/** Grace period before marking sessions disconnected — allows fast reconnects */
const DISCONNECT_GRACE_MS = 10_000;

/** Interval between server→client pings to keep the WebSocket alive through proxies (e.g. Render). */
const PING_INTERVAL_MS = 20_000;
const BRIDGE_PROTOCOL_VERSION = 1;
const CODING_TOOLS = new Set<CodingTool>(CODING_TOOL_IDS as CodingTool[]);

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
  sessionId?: string;
  environmentId?: string;
  allowedScope?: "session";
  tool?: string;
};

type BridgeAuth = CloudBridgeAuth | LocalBridgeAuth;

export type BridgeConnectionRequest = {
  bridgeAuth?: BridgeAuth;
};

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) return null;
    result.push(item);
  }
  return result;
}

function parseSupportedTools(value: unknown): CodingTool[] | null {
  const tools = stringArray(value);
  if (!tools) return null;
  // Filter out tools this server doesn't recognize rather than discarding the
  // whole announce — a newer bridge advertising an unknown tool must not wipe
  // the tools the server *does* support (that silently dropped cursor_composer
  // and pi before). Returns null only when the field isn't a string array.
  return tools.filter((tool): tool is CodingTool => CODING_TOOLS.has(tool as CodingTool));
}

function isCompatibleProtocolVersion(value: unknown): boolean {
  return value === BRIDGE_PROTOCOL_VERSION;
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isTerminalConnectionState(connection: unknown): boolean {
  const state = jsonRecord(connection)?.state;
  return state === "failed" || state === "timed_out" || state === "stopped";
}

function connectionRuntimeInstanceId(connection: unknown): string | null {
  const runtimeInstanceId = jsonRecord(connection)?.runtimeInstanceId;
  return typeof runtimeInstanceId === "string" && runtimeInstanceId.trim()
    ? runtimeInstanceId
    : null;
}

export function handleBridgeConnection(ws: WebSocket, req?: BridgeConnectionRequest) {
  // Default runtime ID; replaced if the bridge sends runtime_hello
  let runtimeId: string = randomUUID();
  let runtimeKey = runtimeId;
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
      runtimeDebug("bridge websocket ping watchdog terminating stale connection", {
        runtimeId,
      });
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
    const next = prev.then(fn, fn).catch((err: unknown) => {
      console.error("[bridge] error processing queued session event:", err);
    });
    queues.set(sessionId, next);
  }

  async function resolveSessionBoundToThisRuntime(sessionId: unknown): Promise<string | null> {
    if (typeof sessionId !== "string" || !sessionId) return null;
    const runtime = sessionRouter.getRuntimeForSession(sessionId);
    if (runtime) {
      const allowed =
        runtime.key === runtimeKey &&
        runtime.ws === ws &&
        (!bridgeAuth?.organizationId || runtime.organizationId === bridgeAuth.organizationId);
      if (!allowed) {
        runtimeDebug("bridge ignored message for session bound to another runtime", {
          runtimeId,
          sessionId,
          boundRuntimeId: runtime.id,
        });
      }
      return allowed ? sessionId : null;
    }

    const persisted = await prisma.session.findFirst({
      where: {
        id: sessionId,
        agentStatus: { notIn: ["failed", "stopped"] },
        sessionStatus: { not: "merged" },
        ...(bridgeAuth?.organizationId ? { organizationId: bridgeAuth.organizationId } : {}),
        connection: { path: ["runtimeInstanceId"], equals: runtimeId },
      },
      select: { id: true, connection: true },
    });
    if (!persisted || isTerminalConnectionState(persisted.connection)) {
      runtimeDebug("bridge ignored message for unbound session", {
        runtimeId,
        sessionId,
      });
      return null;
    }

    sessionRouter.bindSession(sessionId, runtimeKey);
    return sessionId;
  }

  function enqueueForBoundSession(
    sessionId: unknown,
    fn: (boundSessionId: string) => Promise<void>,
  ): void {
    void (async () => {
      const boundSessionId = await resolveSessionBoundToThisRuntime(sessionId);
      if (!boundSessionId) return;
      enqueueEvent(boundSessionId, () => fn(boundSessionId));
    })().catch((err: unknown) => {
      console.error("[bridge] error authorizing session-scoped message:", err);
    });
  }

  let messageChain: Promise<void> | null = null;

  async function handleMessage(raw: Buffer | string) {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "runtime_hello") {
        try {
          const oldId = runtimeId;
          const newId = (msg.instanceId as string) ?? runtimeId;
          const hostingMode = (msg.hostingMode as "cloud" | "local") ?? "local";
          const supportedTools = parseSupportedTools(msg.supportedTools) ?? [
            "claude_code",
            "codex",
            "custom",
          ];
          const registeredRepoIds = stringArray(msg.registeredRepoIds) ?? [];

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
            await agentEnvironmentService
              .ensureLocalBridgeEnvironment(
                {
                  organizationId: bridgeAuth.organizationId,
                  runtimeInstanceId: newId,
                  runtimeLabel: bridgeRuntime.label,
                  supportedTools,
                },
                "user",
                bridgeAuth.userId,
              )
              .catch((err: unknown) => {
                console.error("[bridge] error ensuring local agent environment:", err);
              });

            if (registered && oldId !== newId) {
              sessionRouter.unregisterRuntime(runtimeKey, ws);
            }

            runtimeId = newId;
            runtimeKey = runtimeRouterKey(newId, bridgeAuth.organizationId);
            const existingRuntime = sessionRouter.getRuntime(newId, bridgeAuth.organizationId);
            sessionRouter.registerRuntime({
              key: runtimeKey,
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
            if (bridgeAuth.allowedScope === "session") {
              if (
                !isCompatibleProtocolVersion(msg.protocolVersion) ||
                typeof msg.agentVersion !== "string" ||
                !msg.agentVersion.trim()
              ) {
                runtimeDebug("cloud bridge auth rejected incompatible runtime metadata", {
                  runtimeId: newId,
                  protocolVersion: msg.protocolVersion,
                  agentVersion: msg.agentVersion,
                });
                ws.close(1008, "Incompatible bridge protocol");
                return;
              }
              if (!parseSupportedTools(msg.supportedTools)) {
                runtimeDebug("cloud bridge auth rejected invalid supported tools", {
                  runtimeId: newId,
                  supportedTools: msg.supportedTools,
                });
                ws.close(1008, "Invalid bridge capabilities");
                return;
              }
              if (bridgeAuth.tool && !supportedTools.includes(bridgeAuth.tool as CodingTool)) {
                runtimeDebug("cloud bridge auth rejected missing requested tool", {
                  runtimeId: newId,
                  requestedTool: bridgeAuth.tool,
                  supportedTools,
                });
                ws.close(1008, "Runtime does not support requested tool");
                return;
              }
            }

            if (registered && oldId !== newId) {
              sessionRouter.unregisterRuntime(runtimeKey, ws);
            }

            runtimeId = newId;
            runtimeKey = runtimeId;
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
            if (bridgeAuth.sessionId) {
              const scopedSession = await prisma.session.findFirst({
                where: {
                  id: bridgeAuth.sessionId,
                  organizationId: bridgeAuth.organizationId,
                  agentStatus: { notIn: ["failed", "stopped"] },
                  sessionStatus: { not: "merged" },
                },
                select: { id: true, connection: true },
              });
              const connectionRuntimeId = scopedSession
                ? connectionRuntimeInstanceId(scopedSession.connection)
                : null;
              // A provision-wait timeout leaves the connection in a terminal
              // `timed_out` state. If the session's *own* runtime finally shows
              // up (a slow boot that missed the 300s window), it must be allowed
              // to reclaim and heal the session — rejecting it wedges the
              // session forever, since every re-provision re-times-out the same
              // way. Only the runtime the connection already points at may
              // reclaim; a different runtime, or a `failed`/`stopped` state, is
              // still rejected. `restoreSessionsForRuntime` (called after this
              // hello) heals the `timed_out` connection back to `connected`.
              const scopedState = jsonRecord(scopedSession?.connection)?.state;
              const reclaimableTimeout =
                connectionRuntimeId === runtimeId && scopedState === "timed_out";
              if (
                !scopedSession ||
                (isTerminalConnectionState(scopedSession.connection) && !reclaimableTimeout) ||
                (connectionRuntimeId && connectionRuntimeId !== runtimeId)
              ) {
                runtimeDebug("cloud bridge auth rejected inactive scoped session", {
                  runtimeId,
                  sessionId: bridgeAuth.sessionId,
                  connectionRuntimeId,
                });
                ws.close(1008, "Session is not waiting for this runtime");
                return;
              }
              if (reclaimableTimeout) {
                runtimeDebug("cloud bridge reclaiming timed-out scoped session", {
                  runtimeId,
                  sessionId: bridgeAuth.sessionId,
                });
              }
              sessionRouter.bindSession(bridgeAuth.sessionId, runtimeKey);
            }

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
          sessionService
            .restoreSessionsForRuntime(runtimeId, bridgeAuth?.organizationId)
            .catch((err) => {
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
            sessionRouter.getLinkedCheckoutStatus(runtimeKey, repoId).catch(() => {});
          }

          // Restore terminal relay entries from bridge-reported active terminals
          if (Array.isArray(msg.activeTerminals) && msg.activeTerminals.length > 0) {
            const activeTerminals = (msg.activeTerminals as unknown[]).filter(
              (t): t is { terminalId: string; sessionId: string; ownerUserId: string } =>
                typeof t === "object" &&
                t !== null &&
                typeof (t as Record<string, unknown>).terminalId === "string" &&
                typeof (t as Record<string, unknown>).sessionId === "string" &&
                typeof (t as Record<string, unknown>).ownerUserId === "string",
            );
            if (activeTerminals.length > 0) {
              runtimeDebug("restoring terminals from bridge", {
                runtimeId,
                count: activeTerminals.length,
              });
              terminalRelay.restoreTerminals(runtimeKey, activeTerminals).catch((err) => {
                console.error("[bridge] error restoring terminals:", err);
              });
            }
          }
        } catch (err) {
          console.error("[bridge] error handling runtime_hello:", err);
          if (err instanceof AuthorizationError) {
            ws.close(1008, err.message);
            return;
          }
          ws.close(1011, "runtime_hello failed");
        }
        return;
      }

      if (msg.type === "runtime_heartbeat") {
        if (!registered) return;
        const recorded = sessionRouter.recordHeartbeat(runtimeKey, ws);
        if (!recorded) return;
        if (Array.isArray(msg.activeSessionIds)) {
          const activeSessionIds = (msg.activeSessionIds as unknown[]).filter(
            (sessionId): sessionId is string => typeof sessionId === "string" && !!sessionId,
          );
          const reconcileSessionIds = sessionRouter.getHeartbeatReconcileSessionIds(runtimeKey);
          if (reconcileSessionIds.length === 0) return;
          void sessionService
            .listIdleActiveRunSessionIds({
              sessionIds: reconcileSessionIds,
              activeSessionIds,
            })
            .then((sessionIds) => {
              for (const sessionId of sessionIds) {
                enqueueForBoundSession(sessionId, async (boundSessionId) => {
                  await sessionService.complete(boundSessionId);
                });
              }
            })
            .catch((err: unknown) => {
              console.error("[bridge] error reconciling runtime active runs:", err);
            });
        }
        return;
      }

      if (!registered) {
        runtimeDebug("bridge ignored message before runtime registration", {
          provisionalRuntimeId: runtimeId,
          messageType: typeof msg.type === "string" ? msg.type : "unknown",
        });
        return;
      }

      // Registration cannot succeed without bridge auth, so the runtime's
      // organization is known from here on. Scope every runtime-driven mutation
      // to it so a compromised runtime can't touch another tenant's rows.
      if (!bridgeAuth) return;

      if (msg.type === "repo_linked") {
        const repoId = typeof msg.repoId === "string" ? msg.repoId.trim() : "";
        if (!repoId) {
          runtimeDebug("bridge ignored invalid repo_linked message", { runtimeId });
          return;
        }
        sessionRouter.addRegisteredRepo(runtimeKey, repoId, ws);
        if (bridgeAuth?.kind === "local") {
          runtimeAccessService
            .addRegisteredRepoToLocalRuntime({
              instanceId: runtimeId,
              organizationId: bridgeAuth.organizationId,
              repoId,
            })
            .catch((err: unknown) => {
              console.error("[bridge] error persisting repo_linked:", err);
            });
        }
        // Warm the linked-checkout cache for the freshly-linked repo (no-op
        // if no checkout is configured for it).
        sessionRouter.getLinkedCheckoutStatus(runtimeKey, repoId).catch(() => {});
        return;
      }

      if (msg.type === "setup_script_result" && typeof msg.requestId === "string") {
        void sessionApplicationService
          .completeSetupScriptRun(msg.requestId, bridgeAuth.organizationId, {
            exitCode: typeof msg.exitCode === "number" ? msg.exitCode : 1,
            output: typeof msg.output === "string" ? msg.output : undefined,
            error: typeof msg.error === "string" ? msg.error : undefined,
          })
          .catch((err: unknown) => {
            console.error("[bridge] error completing setup script run:", err);
          });
        return;
      }

      if (msg.type === "setup_script_log" && typeof msg.requestId === "string") {
        if (typeof msg.data === "string" && (msg.stream === "stdout" || msg.stream === "stderr")) {
          void sessionApplicationService
            .appendSetupScriptOutput(msg.requestId, bridgeAuth.organizationId, msg.data)
            .catch((err: unknown) => {
              console.error("[bridge] error appending setup script output:", err);
            });
        }
        return;
      }

      if (msg.type === "app_process_started" && typeof msg.processInstanceId === "string") {
        void sessionApplicationService
          .markProcessRunning(
            msg.processInstanceId,
            bridgeAuth.organizationId,
            typeof msg.bridgeProcessId === "string" ? msg.bridgeProcessId : msg.processInstanceId,
          )
          .catch((err: unknown) => {
            console.error("[bridge] error marking app process running:", err);
          });
        return;
      }

      if (msg.type === "app_process_log" && typeof msg.processInstanceId === "string") {
        if (typeof msg.data === "string" && (msg.stream === "stdout" || msg.stream === "stderr")) {
          void sessionApplicationService
            .appendProcessLog(
              msg.processInstanceId,
              bridgeAuth.organizationId,
              msg.stream,
              msg.data,
            )
            .catch((err: unknown) => {
              console.error("[bridge] error appending app process log:", err);
            });
        }
        return;
      }

      if (
        msg.type === "pdf_export_result" &&
        typeof msg.requestId === "string" &&
        typeof msg.sessionGroupId === "string" &&
        typeof msg.commitSha === "string"
      ) {
        void managedGitService
          .completePdfExport({
            organizationId: bridgeAuth.organizationId,
            sessionGroupId: msg.sessionGroupId,
            commitSha: msg.commitSha,
            requestId: msg.requestId,
            error: typeof msg.error === "string" ? msg.error : undefined,
          })
          .catch((error: unknown) => {
            console.error("[bridge] error completing PDF export:", error);
          });
        return;
      }

      if (msg.type === "app_process_exited" && typeof msg.processInstanceId === "string") {
        void sessionApplicationService
          .markProcessExited(
            msg.processInstanceId,
            bridgeAuth.organizationId,
            typeof msg.exitCode === "number" ? msg.exitCode : null,
          )
          .catch((err: unknown) => {
            console.error("[bridge] error marking app process exited:", err);
          });
        return;
      }

      if (msg.type === "app_process_error") {
        const processInstanceId =
          typeof msg.processInstanceId === "string" ? msg.processInstanceId : null;
        if (processInstanceId) {
          void sessionApplicationService
            .markProcessExited(
              processInstanceId,
              bridgeAuth.organizationId,
              null,
              typeof msg.error === "string" ? msg.error : "Process failed",
            )
            .catch((err: unknown) => {
              console.error("[bridge] error marking app process failed:", err);
            });
        }
        return;
      }

      if (msg.type === "endpoint_http_response" && typeof msg.requestId === "string") {
        endpointProxyService.resolveHttpResponse(msg.requestId, {
          status: typeof msg.status === "number" ? msg.status : 502,
          headers:
            msg.headers && typeof msg.headers === "object" && !Array.isArray(msg.headers)
              ? (msg.headers as Record<string, string | string[]>)
              : {},
          bodyBase64: typeof msg.bodyBase64 === "string" ? msg.bodyBase64 : undefined,
        });
        return;
      }

      if (msg.type === "endpoint_http_error" && typeof msg.requestId === "string") {
        endpointProxyService.resolveHttpError(
          msg.requestId,
          typeof msg.error === "string" ? msg.error : "Endpoint proxy failed",
        );
        return;
      }

      if (msg.type === "endpoint_ws_opened" && typeof msg.requestId === "string") {
        endpointProxyService.resolveWebSocketOpened(msg.requestId);
        return;
      }

      if (msg.type === "endpoint_ws_data" && typeof msg.requestId === "string") {
        if (typeof msg.dataBase64 === "string") {
          endpointProxyService.resolveWebSocketData(
            msg.requestId,
            msg.dataBase64,
            typeof msg.isBinary === "boolean" ? msg.isBinary : true,
          );
        }
        return;
      }

      if (msg.type === "endpoint_ws_closed" && typeof msg.requestId === "string") {
        endpointProxyService.resolveWebSocketClosed(msg.requestId);
        return;
      }

      if (msg.type === "linked_checkout_status_result" && typeof msg.requestId === "string") {
        sessionRouter.resolveLinkedCheckoutStatusRequest(
          msg.requestId,
          msg.status as BridgeLinkedCheckoutStatus,
          runtimeKey,
        );
        return;
      }

      if (msg.type === "linked_checkout_changed_file_result" && typeof msg.requestId === "string") {
        sessionRouter.resolveLinkedCheckoutChangedFileRequest(
          msg.requestId,
          msg.file as BridgeLinkedCheckoutChangedFilePreview | undefined,
          typeof msg.error === "string" ? msg.error : undefined,
          runtimeKey,
        );
        return;
      }

      if (msg.type === "linked_checkout_action_result" && typeof msg.requestId === "string") {
        sessionRouter.resolveLinkedCheckoutActionRequest(
          msg.requestId,
          msg.result as BridgeLinkedCheckoutActionResultPayload,
          runtimeKey,
        );
        return;
      }

      if (msg.type === "session_current_branch_result" && typeof msg.requestId === "string") {
        sessionRouter.resolveSessionCurrentBranchRequest(
          msg.requestId,
          typeof msg.branch === "string" ? msg.branch : null,
          typeof msg.error === "string" ? msg.error : undefined,
          runtimeKey,
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
                remoteBranch: string | null;
                remoteCommitSha: string | null;
                remoteAheadCount: number;
                remoteBehindCount: number;
                hasUncommittedChanges: boolean;
              })
            : undefined,
          typeof msg.error === "string" ? msg.error : undefined,
          runtimeKey,
        );
        return;
      }

      if (msg.type === "session_pr_status" && msg.sessionId) {
        if (bridgeAuth?.kind !== "local") {
          runtimeDebug("ignoring session_pr_status from non-local bridge", {
            runtimeId,
            sessionId: msg.sessionId,
            authKind: bridgeAuth?.kind ?? "unknown",
          });
          return;
        }

        const pr =
          msg.pr &&
          typeof msg.pr === "object" &&
          typeof (msg.pr as Record<string, unknown>).url === "string" &&
          typeof (msg.pr as Record<string, unknown>).merged === "boolean" &&
          (((msg.pr as Record<string, unknown>).state as string) === "OPEN" ||
            ((msg.pr as Record<string, unknown>).state as string) === "CLOSED" ||
            ((msg.pr as Record<string, unknown>).state as string) === "MERGED")
            ? {
                url: (msg.pr as Record<string, unknown>).url as string,
                state: (msg.pr as Record<string, unknown>).state as "OPEN" | "CLOSED" | "MERGED",
                merged: (msg.pr as Record<string, unknown>).merged as boolean,
              }
            : null;
        const branch = typeof msg.branch === "string" ? msg.branch : null;
        const observedAt =
          typeof msg.observedAt === "string" && !Number.isNaN(Date.parse(msg.observedAt))
            ? msg.observedAt
            : new Date().toISOString();
        const error = typeof msg.error === "string" && msg.error.trim() ? msg.error : null;

        enqueueEvent(msg.sessionId, async () => {
          await sessionService.syncPrObservation({
            sessionId: msg.sessionId as string,
            runtimeInstanceId: runtimeId,
            organizationId: bridgeAuth.organizationId,
            ownerUserId: bridgeAuth.userId,
            branch,
            observedAt,
            pr,
            error,
            actorId: "github-bridge-poll",
          });
        });
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
          runtimeKey,
        );
        return;
      }

      if (
        msg.type === "workspace_slugs_result" &&
        typeof msg.requestId === "string" &&
        Array.isArray(msg.slugs)
      ) {
        const slugs = (msg.slugs as unknown[]).filter(
          (slug): slug is string => typeof slug === "string",
        );
        sessionRouter.resolveWorkspaceSlugRequest(
          msg.requestId,
          slugs,
          typeof msg.error === "string" ? msg.error : undefined,
          runtimeKey,
        );
        return;
      }

      if (
        msg.type === "worktrees_result" &&
        typeof msg.requestId === "string" &&
        Array.isArray(msg.worktrees)
      ) {
        sessionRouter.resolveWorktreeListRequest(
          msg.requestId,
          msg.worktrees as BridgeRepoWorktree[],
          typeof msg.error === "string" ? msg.error : undefined,
          runtimeKey,
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
          runtimeKey,
        );
        return;
      }

      if (msg.type === "file_content_result" && typeof msg.requestId === "string") {
        sessionRouter.resolveFileContentRequest(
          msg.requestId,
          typeof msg.content === "string" ? msg.content : "",
          typeof msg.error === "string" ? msg.error : undefined,
          runtimeKey,
        );
        return;
      }

      if (msg.type === "file_write_result" && typeof msg.requestId === "string") {
        sessionRouter.resolveFileWriteRequest(
          msg.requestId,
          typeof msg.error === "string" ? msg.error : undefined,
          runtimeKey,
        );
        return;
      }

      if (msg.type === "file_commit_result" && typeof msg.requestId === "string") {
        sessionRouter.resolveFileCommitRequest(
          msg.requestId,
          typeof msg.commitSha === "string" ? msg.commitSha : undefined,
          typeof msg.error === "string" ? msg.error : undefined,
          runtimeKey,
        );
        return;
      }

      if (msg.type === "worktree_changes_result" && typeof msg.requestId === "string") {
        const files = Array.isArray(msg.files)
          ? (msg.files as Array<{
              path: string;
              status: string;
              additions: number;
              deletions: number;
              diff: string;
              truncated: boolean;
              originalContent: string;
              modifiedContent: string;
              contentTruncated: boolean;
            }>)
          : [];
        sessionRouter.resolveWorktreeChangesRequest(
          msg.requestId,
          files,
          typeof msg.totalCount === "number" ? msg.totalCount : files.length,
          msg.truncated === true,
          typeof msg.error === "string" ? msg.error : undefined,
          runtimeKey,
        );
        return;
      }

      if (msg.type === "revert_worktree_file_result" && typeof msg.requestId === "string") {
        sessionRouter.resolveRevertWorktreeFileRequest(
          msg.requestId,
          typeof msg.error === "string" ? msg.error : undefined,
          runtimeKey,
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
          runtimeKey,
        );
        return;
      }

      if (msg.type === "file_at_ref_result" && typeof msg.requestId === "string") {
        sessionRouter.resolveFileAtRefRequest(
          msg.requestId,
          typeof msg.content === "string" ? msg.content : "",
          typeof msg.error === "string" ? msg.error : undefined,
          runtimeKey,
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
          runtimeKey,
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
          runtimeKey,
        );
        return;
      }

      if (msg.type === "session_output" && msg.sessionId) {
        const data = (msg.data ?? {}) as Record<string, unknown>;

        enqueueForBoundSession(msg.sessionId, async (sessionId) => {
          await sessionService.recordOutput(sessionId, data);
        });
      } else if (msg.type === "session_complete" && msg.sessionId) {
        enqueueForBoundSession(msg.sessionId, async (sessionId) => {
          await sessionService.complete(sessionId);
        });
      } else if (msg.type === "workspace_ready" && msg.sessionId) {
        enqueueForBoundSession(msg.sessionId, async (sessionId) => {
          await sessionService.workspaceReady(
            sessionId,
            msg.workdir as string,
            msg.branch as string | undefined,
            msg.slug as string | undefined,
            msg.warning as BridgeWorkspaceWarning | undefined,
          );
        });
      } else if (msg.type === "workspace_failed" && msg.sessionId) {
        enqueueForBoundSession(msg.sessionId, async (sessionId) => {
          await sessionService.workspaceFailed(sessionId, (msg.error as string) ?? "Unknown error");
        });
      } else if (msg.type === "register_session" && msg.sessionId) {
        void (async () => {
          const sessionId = await resolveSessionBoundToThisRuntime(msg.sessionId);
          if (!sessionId) return;
          runtimeDebug("received register_session", { runtimeId, sessionId });
          sessionRouter.bindSession(sessionId, runtimeKey);
        })().catch((err: unknown) => {
          console.error("[bridge] error authorizing register_session:", err);
        });
      } else if (msg.type === "tool_session_id" && msg.sessionId && msg.toolSessionId) {
        const toolSessionId = msg.toolSessionId as string;
        enqueueForBoundSession(msg.sessionId, async (sessionId) => {
          await sessionService.storeToolSessionId(sessionId, toolSessionId);
        });
      } else if (msg.type === "tool_session_missing" && msg.sessionId && msg.toolSessionId) {
        const imageUrls = Array.isArray(msg.imageUrls)
          ? (msg.imageUrls as unknown[]).filter((url): url is string => typeof url === "string")
          : undefined;
        const toolSessionId = msg.toolSessionId as string;
        enqueueForBoundSession(msg.sessionId, async (sessionId) => {
          await sessionService.recoverMissingToolSession(sessionId, {
            toolSessionId,
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
        const checkpoint = msg.checkpoint;
        enqueueForBoundSession(msg.sessionId, async (sessionId) => {
          await sessionService.recordGitCheckpoint(sessionId, checkpoint);
        });
      }
    } catch (err) {
      console.error("[bridge] error handling message:", err);
    }
  }

  ws.on("message", (raw: Buffer | string) => {
    const next = messageChain
      ? messageChain.catch(() => {}).then(() => handleMessage(raw))
      : handleMessage(raw);
    messageChain = next;
    void next.finally(() => {
      if (messageChain === next) {
        messageChain = null;
      }
    });
  });

  ws.on("error", (err: Error) => {
    runtimeDebug("bridge websocket error", { runtimeId, error: err.message });
  });

  ws.on("close", (code: number, reason: Buffer) => {
    clearInterval(pingInterval);
    const reasonText = reason.toString();
    runtimeDebug("bridge websocket closed, grace period starting", {
      runtimeId,
      code,
      reason: reasonText || null,
      graceMs: DISCONNECT_GRACE_MS,
    });
    const closedRuntimeId = bridgeAuth?.kind === "local" ? bridgeAuth.instanceId : runtimeId;
    const affectedSessions = registered ? sessionRouter.unregisterRuntime(runtimeKey, ws) : [];
    runtimeDebug("bridge close affected sessions", {
      runtimeId: closedRuntimeId,
      affectedSessions,
    });

    if (bridgeAuth?.kind === "local") {
      runtimeAccessService
        .markRuntimeDisconnected(closedRuntimeId, bridgeAuth.organizationId)
        .catch((err) => {
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
