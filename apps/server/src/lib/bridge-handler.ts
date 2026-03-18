import type { WebSocket } from "ws";
import { randomUUID } from "crypto";
import { sessionRouter } from "./session-router.js";
import { sessionService } from "../services/session.js";
import { runtimeDebug } from "./runtime-debug.js";

export function handleBridgeConnection(ws: WebSocket) {
  // Default runtime ID; replaced if the bridge sends runtime_hello
  let runtimeId: string = randomUUID();
  let registered = false;

  runtimeDebug("bridge websocket connected", { provisionalRuntimeId: runtimeId });

  // Register with defaults until runtime_hello arrives
  sessionRouter.registerBridge(runtimeId, ws);
  registered = true;

  // Serialize event creation per session to preserve ordering
  const queues = new Map<string, Promise<void>>();

  function enqueueEvent(sessionId: string, fn: () => Promise<void>) {
    const prev = queues.get(sessionId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    queues.set(sessionId, next);
  }

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "runtime_hello") {
        // Bridge is announcing its identity. Re-register with the real info.
        const oldId = runtimeId;
        const newId = (msg.instanceId as string) ?? runtimeId;
        const existingRuntime = sessionRouter.getRuntime(newId);
        runtimeDebug("received runtime_hello", {
          oldId,
          newId,
          label: msg.label,
          hostingMode: msg.hostingMode,
          supportedTools: msg.supportedTools,
          registeredRepoIds: msg.registeredRepoIds,
        });

        if (registered && oldId !== newId) {
          sessionRouter.unregisterRuntime(oldId, ws);
        }

        runtimeId = newId;
        sessionRouter.registerRuntime({
          id: runtimeId,
          label: (msg.label as string) ?? runtimeId,
          ws,
          hostingMode: (msg.hostingMode as "cloud" | "local") ?? "local",
          supportedTools: (msg.supportedTools as string[]) ?? ["claude_code", "codex", "custom"],
          registeredRepoIds: (msg.registeredRepoIds as string[]) ?? [],
        });
        registered = true;

        if (existingRuntime && existingRuntime.ws !== ws) {
          runtimeDebug("closing superseded websocket for runtime", {
            runtimeId: newId,
            previousLabel: existingRuntime.label,
            previousReadyState: existingRuntime.ws.readyState,
          });
          existingRuntime.ws.close();
        }

        // Restore all sessions owned by this runtime from the DB.
        // The DB (connection.runtimeInstanceId) is the single source of truth —
        // the bridge doesn't need to report session lists.
        runtimeDebug("restoring sessions for runtime after hello", { runtimeId });
        sessionService.restoreSessionsForRuntime(runtimeId).catch((err) => {
          console.error("[bridge] error restoring sessions for runtime:", err);
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

      if (msg.type === "branches_result" && typeof msg.requestId === "string" && Array.isArray(msg.branches)) {
        sessionRouter.resolveBranchRequest(
          msg.requestId,
          msg.branches as string[],
          typeof msg.error === "string" ? msg.error : undefined,
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
          await sessionService.workspaceReady(msg.sessionId, msg.workdir as string);
        });
      } else if (msg.type === "workspace_failed" && msg.sessionId) {
        enqueueEvent(msg.sessionId, async () => {
          await sessionService.workspaceFailed(msg.sessionId, (msg.error as string) ?? "Unknown error");
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
      }
    } catch (err) {
      console.error("[bridge] error handling message:", err);
    }
  });

  ws.on("close", () => {
    runtimeDebug("bridge websocket closed", { runtimeId });
    const affectedSessions = sessionRouter.unregisterRuntime(runtimeId, ws);
    runtimeDebug("bridge close affected sessions", { runtimeId, affectedSessions });

    // Mark all bound sessions as disconnected through the service layer
    for (const sessionId of affectedSessions) {
      enqueueEvent(sessionId, async () => {
        await sessionService.markConnectionLost(sessionId, "runtime_disconnected", runtimeId);
      });
    }
  });
}
