import type { WebSocket } from "ws";
import { randomUUID } from "crypto";
import { sessionRouter } from "./session-router.js";
import { sessionService } from "../services/session.js";

export function handleBridgeConnection(ws: WebSocket) {
  // Default runtime ID; replaced if the bridge sends runtime_hello
  let runtimeId: string = randomUUID();
  let registered = false;

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
      console.log(`[bridge] msg from runtime=${runtimeId}: type=${msg.type} sessionId=${msg.sessionId ?? "n/a"}`);

      if (msg.type === "runtime_hello") {
        // Bridge is announcing its identity. Re-register with the real info.
        const oldId = runtimeId;
        const newId = (msg.instanceId as string) ?? runtimeId;

        if (registered) {
          sessionRouter.unregisterRuntime(oldId);
        }

        runtimeId = newId;
        sessionRouter.registerRuntime({
          id: runtimeId,
          label: (msg.label as string) ?? runtimeId,
          ws,
          hostingMode: (msg.hostingMode as "cloud" | "local") ?? "local",
          supportedTools: (msg.supportedTools as string[]) ?? ["claude_code", "codex", "custom"],
        });
        registered = true;

        // Restore all sessions owned by this runtime from the DB.
        // The DB (connection.runtimeInstanceId) is the single source of truth —
        // the bridge doesn't need to report session lists.
        sessionService.restoreSessionsForRuntime(runtimeId).catch((err) => {
          console.error("[bridge] error restoring sessions for runtime:", err);
        });
        return;
      }

      if (msg.type === "runtime_heartbeat") {
        sessionRouter.recordHeartbeat(runtimeId);
        return;
      }

      if (msg.type === "session_output" && msg.sessionId) {
        const sessionId = msg.sessionId as string;
        const data = (msg.data ?? {}) as Record<string, unknown>;
        console.log(`[bridge] output for ${sessionId}:`, JSON.stringify(data).slice(0, 300));

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
    const affectedSessions = sessionRouter.unregisterRuntime(runtimeId);

    // Mark all bound sessions as disconnected through the service layer
    for (const sessionId of affectedSessions) {
      enqueueEvent(sessionId, async () => {
        await sessionService.markConnectionLost(sessionId, "runtime_disconnected", runtimeId);
      });
    }
  });
}
