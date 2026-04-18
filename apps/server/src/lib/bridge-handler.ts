import type { WebSocket } from "ws";
import { randomUUID } from "crypto";
import type {
  BridgeLinkedCheckoutStatus,
  BridgeLinkedCheckoutActionResultPayload,
  GitCheckpointBridgePayload,
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

type BridgeAuth = { kind: "cloud" } | LocalBridgeAuth;

export type BridgeConnectionRequest = {
  bridgeAuth?: BridgeAuth;
};

function isGitCheckpointBridgePayload(
  value: unknown,
): value is GitCheckpointBridgePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const payload = value as Record<string, unknown>;
  const validTrigger =
    payload.trigger === "commit" ||
    payload.trigger === "push" ||
    payload.trigger === "commit_and_push" ||
    payload.trigger === "rewrite";

  return (
    validTrigger &&
    typeof payload.command === "string" &&
    typeof payload.observedAt === "string" &&
    typeof payload.commitSha === "string" &&
    Array.isArray(payload.parentShas) &&
    payload.parentShas.every((sha) => typeof sha === "string") &&
    typeof payload.treeSha === "string" &&
    typeof payload.subject === "string" &&
    typeof payload.author === "string" &&
    typeof payload.committedAt === "string" &&
    typeof payload.filesChanged === "number" &&
    Number.isFinite(payload.filesChanged)
  );
}

export function handleBridgeConnection(ws: WebSocket, req?: BridgeConnectionRequest) {
  // Default runtime ID; replaced if the bridge sends runtime_hello
  let runtimeId: string = randomUUID();
  let registered = false;
  const bridgeAuth = req?.bridgeAuth;

  runtimeDebug("bridge websocket connected", {
    provisionalRuntimeId: runtimeId,
    authKind: bridgeAuth?.kind ?? "unknown",
  });

  // Reject state-mutating messages for sessions that are not bound to this
  // runtime. Prevents a bridge from hijacking or spoofing output for a
  // session targeted at a different runtime.
  const rejectUnownedSession = (messageType: string, sessionId: string): boolean => {
    const runtime = sessionRouter.getRuntime(runtimeId);
    if (runtime && runtime.boundSessions.has(sessionId)) return false;
    runtimeDebug("bridge message rejected: session not bound to this runtime", {
      runtimeId,
      messageType,
      sessionId,
    });
    return true;
  };

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
  const pendingSessionRegistrations = new Map<string, Promise<boolean>>();
  const bufferedSessionMessages = new Map<string, Array<Record<string, unknown>>>();

  function enqueueEvent(sessionId: string, fn: () => Promise<void>) {
    const prev = queues.get(sessionId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    queues.set(sessionId, next);
  }

  function bufferSessionMessage(sessionId: string, msg: Record<string, unknown>): void {
    const buffered = bufferedSessionMessages.get(sessionId) ?? [];
    buffered.push(msg);
    bufferedSessionMessages.set(sessionId, buffered);
  }

  function flushBufferedSessionMessages(sessionId: string): void {
    const buffered = bufferedSessionMessages.get(sessionId);
    if (!buffered || buffered.length === 0) return;
    bufferedSessionMessages.delete(sessionId);
    for (const bufferedMessage of buffered) {
      handleParsedMessage(bufferedMessage);
    }
  }

  function maybeBufferPendingRegistration(
    sessionId: string,
    msg: Record<string, unknown>,
  ): boolean {
    if (!pendingSessionRegistrations.has(sessionId)) {
      return false;
    }
    runtimeDebug("buffering bridge message while session registration is pending", {
      runtimeId,
      sessionId,
      messageType: msg.type,
    });
    bufferSessionMessage(sessionId, { ...msg });
    return true;
  }

  function startSessionRegistration(sessionId: string): void {
    if (pendingSessionRegistrations.has(sessionId)) {
      return;
    }
    const pending = sessionService
      .getSessionRuntimeInstanceId(sessionId)
      .then((targetRuntimeId) => {
        if (!targetRuntimeId) {
          runtimeDebug(
            "register_session rejected: session has no assigned runtime",
            { runtimeId, sessionId },
          );
          return false;
        }
        if (targetRuntimeId !== runtimeId) {
          runtimeDebug(
            "register_session rejected: session assigned to a different runtime",
            { runtimeId, sessionId, targetRuntimeId },
          );
          return false;
        }
        sessionRouter.bindSession(sessionId, runtimeId);
        return true;
      })
      .catch((err) => {
        console.error("[bridge] register_session lookup failed", err);
        return false;
      })
      .finally(() => {
        pendingSessionRegistrations.delete(sessionId);
      });

    pendingSessionRegistrations.set(sessionId, pending);
    void pending.then((bound) => {
      if (bound) {
        flushBufferedSessionMessages(sessionId);
      } else {
        bufferedSessionMessages.delete(sessionId);
      }
    });
  }

  function handleParsedMessage(msg: Record<string, unknown>): void {
    try {
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

          if (bridgeAuth?.kind === "local") {
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
          } else {
            if (registered && oldId !== newId) {
              sessionRouter.unregisterRuntime(oldId, ws);
            }

            runtimeId = newId;
            const existingRuntime = sessionRouter.getRuntime(newId);
            sessionRouter.registerRuntime({
              id: runtimeId,
              label: (msg.label as string) ?? runtimeId,
              ws,
              hostingMode,
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

          runtimeDebug("restoring sessions for runtime after hello", { runtimeId });
          sessionService.restoreSessionsForRuntime(runtimeId).catch((err) => {
            console.error("[bridge] error restoring sessions for runtime:", err);
          });

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
              terminalRelay.restoreTerminals(activeTerminals).catch((err) => {
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
        sessionRouter.addRegisteredRepo(runtimeId, msg.repoId as string, ws);
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

      if (
        msg.type === "terminal_ready" ||
        msg.type === "terminal_output" ||
        msg.type === "terminal_exit" ||
        msg.type === "terminal_error"
      ) {
        const terminalId = typeof msg.terminalId === "string" ? msg.terminalId : null;
        if (!terminalId) return;
        const terminalSessionId = terminalRelay.getSessionIdForTerminal(terminalId);
        if (!terminalSessionId) return;
        if (maybeBufferPendingRegistration(terminalSessionId, msg)) return;
        if (rejectUnownedSession(msg.type, terminalSessionId)) {
          return;
        }
        terminalRelay.relayFromBridge(
          msg as { type: string; terminalId: string; [key: string]: unknown },
        );
        return;
      }

      if (msg.type === "session_output" && msg.sessionId) {
        const sessionId = msg.sessionId as string;
        if (maybeBufferPendingRegistration(sessionId, msg)) return;
        if (rejectUnownedSession("session_output", sessionId)) return;
        const data = (msg.data ?? {}) as Record<string, unknown>;

        enqueueEvent(sessionId, async () => {
          await sessionService.recordOutput(sessionId, data);
        });
      } else if (msg.type === "session_complete" && msg.sessionId) {
        const sessionId = msg.sessionId as string;
        if (maybeBufferPendingRegistration(sessionId, msg)) return;
        if (rejectUnownedSession("session_complete", sessionId)) return;
        enqueueEvent(sessionId, async () => {
          await sessionService.complete(sessionId);
        });
      } else if (msg.type === "workspace_ready" && msg.sessionId) {
        const sessionId = msg.sessionId as string;
        if (maybeBufferPendingRegistration(sessionId, msg)) return;
        if (rejectUnownedSession("workspace_ready", sessionId)) return;
        enqueueEvent(sessionId, async () => {
          await sessionService.workspaceReady(
            sessionId,
            msg.workdir as string,
            msg.branch as string | undefined,
            msg.slug as string | undefined,
          );
        });
      } else if (msg.type === "workspace_failed" && msg.sessionId) {
        const sessionId = msg.sessionId as string;
        if (maybeBufferPendingRegistration(sessionId, msg)) return;
        if (rejectUnownedSession("workspace_failed", sessionId)) return;
        enqueueEvent(sessionId, async () => {
          await sessionService.workspaceFailed(
            sessionId,
            (msg.error as string) ?? "Unknown error",
          );
        });
      } else if (msg.type === "register_session" && msg.sessionId) {
        const sessionId = msg.sessionId as string;
        runtimeDebug("received register_session", { runtimeId, sessionId });
        startSessionRegistration(sessionId);
      } else if (msg.type === "tool_session_id" && msg.sessionId && msg.toolSessionId) {
        const sessionId = msg.sessionId as string;
        if (maybeBufferPendingRegistration(sessionId, msg)) return;
        if (rejectUnownedSession("tool_session_id", sessionId)) return;
        enqueueEvent(sessionId, async () => {
          await sessionService.storeToolSessionId(
            sessionId,
            msg.toolSessionId as string,
          );
        });
      } else if (
        msg.type === "git_checkpoint" &&
        msg.sessionId &&
        isGitCheckpointBridgePayload(msg.checkpoint)
      ) {
        const sessionId = msg.sessionId as string;
        const checkpoint = msg.checkpoint;
        if (maybeBufferPendingRegistration(sessionId, msg)) return;
        if (rejectUnownedSession("git_checkpoint", sessionId)) return;
        enqueueEvent(sessionId, async () => {
          await sessionService.recordGitCheckpoint(sessionId, checkpoint);
        });
      } else if (msg.type === "git_checkpoint" && msg.sessionId) {
        runtimeDebug("bridge message rejected: malformed git checkpoint payload", {
          runtimeId,
          sessionId: msg.sessionId,
        });
      }
    } catch (err) {
      console.error("[bridge] error handling message:", err);
    }
  }

  ws.on("message", (raw: Buffer | string) => {
    try {
      handleParsedMessage(JSON.parse(raw.toString()) as Record<string, unknown>);
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
