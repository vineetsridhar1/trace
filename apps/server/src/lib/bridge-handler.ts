import type { WebSocket } from "ws";
import { randomUUID } from "crypto";
import { prisma } from "./db.js";
import { sessionRouter } from "./session-router.js";
import { eventService } from "../services/event.js";
import { sessionService } from "../services/session.js";

export function handleBridgeConnection(ws: WebSocket) {
  // Default runtime ID; replaced if the bridge sends runtime_hello
  let runtimeId: string = randomUUID();
  let registered = false;

  // Register with defaults until runtime_hello arrives
  sessionRouter.registerBridge(runtimeId, ws);
  registered = true;

  // Cache organizationId per session to avoid a DB lookup on every output event
  const orgIdCache = new Map<string, string>();

  async function getOrgId(sessionId: string): Promise<string | null> {
    const cached = orgIdCache.get(sessionId);
    if (cached) return cached;
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { organizationId: true },
    });
    if (!session) return null;
    orgIdCache.set(sessionId, session.organizationId);
    return session.organizationId;
  }

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

        // Re-register any sessions the bridge still owns (reconnect scenario)
        const sessionIds = msg.sessionIds as string[] | undefined;
        if (sessionIds) {
          for (const sid of sessionIds) {
            sessionRouter.bindSession(sid, runtimeId);
            enqueueEvent(sid, async () => {
              await sessionService.markConnectionRestored(sid, runtimeId);
            });
          }
        }
        return;
      }

      if (msg.type === "runtime_heartbeat") {
        sessionRouter.recordHeartbeat(runtimeId);
        return;
      }

      if (msg.type === "session_output" && msg.sessionId) {
        const sessionId = msg.sessionId as string;
        const data = msg.data ?? {};

        enqueueEvent(sessionId, async () => {
          const orgId = await getOrgId(sessionId);
          if (!orgId) return;

          await eventService.create({
            organizationId: orgId,
            scopeType: "session",
            scopeId: sessionId,
            eventType: "session_output",
            payload: data,
            actorType: "system",
            actorId: "system",
          });
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
