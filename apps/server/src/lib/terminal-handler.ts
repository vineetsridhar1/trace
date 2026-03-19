import type { WebSocket } from "ws";
import { parseCookieToken, verifyToken } from "./auth.js";
import { terminalRelay } from "./terminal-relay.js";
import { prisma } from "./db.js";

/**
 * Handles frontend WebSocket connections to /terminal.
 *
 * Protocol:
 *   Client → Server:
 *     { type: "attach", terminalId: string }
 *     { type: "input", data: string }
 *     { type: "resize", cols: number, rows: number }
 *
 *   Server → Client:
 *     { type: "ready" }
 *     { type: "output", data: string }
 *     { type: "exit", exitCode: number }
 *     { type: "error", message: string }
 */
export function handleTerminalConnection(ws: WebSocket, req: { headers: { cookie?: string }; url?: string }) {
  let attachedTerminalId: string | null = null;
  let attachPending = false;

  // Authenticate from query param (preferred) or cookie fallback
  const url = new URL(req.url ?? "", "http://localhost");
  const token = url.searchParams.get("token") ?? parseCookieToken(req.headers.cookie);
  if (!token) {
    ws.send(JSON.stringify({ type: "error", message: "Unauthorized" }));
    ws.close();
    return;
  }

  const userId = verifyToken(token);
  if (!userId) {
    ws.send(JSON.stringify({ type: "error", message: "Invalid token" }));
    ws.close();
    return;
  }

  // Buffer messages received while attach auth is in-flight
  let pendingMessages: Array<{ type: string; [key: string]: unknown }> = [];

  function processPending(): void {
    for (const msg of pendingMessages) {
      handleMessage(msg);
    }
    pendingMessages = [];
  }

  function handleMessage(msg: { type: string; [key: string]: unknown }): void {
    switch (msg.type) {
      case "input": {
        if (!attachedTerminalId) return;
        terminalRelay.relayFromFrontend(attachedTerminalId, "input", { data: msg.data as string });
        break;
      }
      case "resize": {
        if (!attachedTerminalId) return;
        terminalRelay.relayFromFrontend(attachedTerminalId, "resize", {
          cols: msg.cols as number,
          rows: msg.rows as number,
        });
        break;
      }
    }
  }

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "attach") {
        const terminalId = msg.terminalId as string;
        if (!terminalId) {
          ws.send(JSON.stringify({ type: "error", message: "Missing terminalId" }));
          return;
        }

        const sessionId = terminalRelay.getSessionId(terminalId);
        if (!sessionId) {
          ws.send(JSON.stringify({ type: "error", message: "Terminal not found" }));
          return;
        }

        attachPending = true;

        (async () => {
          try {
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: { organizationId: true },
            });
            if (!user) {
              ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
              return;
            }
            const session = await prisma.session.findFirst({
              where: { id: sessionId, organizationId: user.organizationId },
              select: { id: true, hosting: true, createdById: true },
            });
            if (!session) {
              ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
              return;
            }
            if (session.hosting === "local" && session.createdById !== userId) {
              ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
              return;
            }
            const attached = terminalRelay.attachFrontend(terminalId, ws);
            if (!attached) {
              ws.send(JSON.stringify({ type: "error", message: "Terminal not found" }));
              return;
            }
            attachedTerminalId = terminalId;
          } catch (err: unknown) {
            console.error("[terminal-handler] authorization check failed:", err);
            ws.send(JSON.stringify({ type: "error", message: "Authorization check failed" }));
          } finally {
            attachPending = false;
            processPending();
          }
        })();
        return;
      }

      // If attach is still in-flight, buffer the message
      if (attachPending) {
        pendingMessages.push(msg);
        return;
      }

      handleMessage(msg);
    } catch (err) {
      console.error("[terminal-handler] error handling message:", err);
    }
  });

  ws.on("close", () => {
    pendingMessages = [];
    terminalRelay.detachAllForFrontend(ws);
  });
}
