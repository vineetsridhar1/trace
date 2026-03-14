import type { WebSocket } from "ws";
import { randomUUID } from "crypto";
import { prisma } from "./db.js";
import { sessionRouter } from "./session-router.js";
import { eventService } from "../services/event.js";
import { sessionService } from "../services/session.js";

export function handleBridgeConnection(ws: WebSocket) {
  const bridgeId = randomUUID();
  sessionRouter.registerBridge(bridgeId, ws);

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
      } else if (msg.type === "register_session" && msg.sessionId) {
        sessionRouter.bindSession(msg.sessionId, bridgeId);
      }
    } catch (err) {
      console.error("[bridge] error handling message:", err);
    }
  });

  ws.on("close", () => {
    sessionRouter.unregisterBridge(bridgeId);
  });
}
