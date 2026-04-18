import type { WebSocket } from "ws";
import { parseCookieToken, verifyTokenAsync } from "./auth.js";
import { terminalRelay } from "./terminal-relay.js";
import { prisma } from "./db.js";
import { runtimeAccessService } from "../services/runtime-access.js";

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

/** Interval between server→client pings to keep the WebSocket alive. */
const PING_INTERVAL_MS = 30_000;

function getConnectionRuntimeInstanceId(connection: unknown): string | null {
  if (!connection || typeof connection !== "object" || Array.isArray(connection)) {
    return null;
  }
  const runtimeInstanceId = (connection as { runtimeInstanceId?: unknown }).runtimeInstanceId;
  return typeof runtimeInstanceId === "string" && runtimeInstanceId.trim()
    ? runtimeInstanceId
    : null;
}

export function handleTerminalConnection(ws: WebSocket, req: { headers: { cookie?: string }; url?: string }) {
  const sendFatalError = (message: string): void => {
    ws.send(JSON.stringify({ type: "error", message }));
    ws.close(1008, message);
  };

  let attachedTerminalId: string | null = null;
  let attachPending = false;
  let authPending = true;
  let authFailed = false;
  let authenticatedUserId: string | null = null;

  // Authenticate from query param (preferred) or cookie fallback
  const url = new URL(req.url ?? "", "http://localhost");
  const token = url.searchParams.get("token") ?? parseCookieToken(req.headers.cookie);
  if (!token) {
    sendFatalError("Unauthorized");
    return;
  }

  const pendingAuthMessages: Array<Buffer | string> = [];

  function finishAuthFailure(message: string): void {
    authFailed = true;
    authPending = false;
    pendingAuthMessages.length = 0;
    sendFatalError(message);
  }

  function replayPendingAuthMessages(): void {
    const buffered = pendingAuthMessages.splice(0, pendingAuthMessages.length);
    for (const raw of buffered) {
      handleRawMessage(raw);
    }
  }

  void verifyTokenAsync(token)
    .then((userId) => {
      if (!userId) {
        finishAuthFailure("Invalid token");
        return;
      }
      authenticatedUserId = userId;
      authPending = false;
      replayPendingAuthMessages();
    })
    .catch(() => {
      finishAuthFailure("Invalid token");
    });

  // Keep-alive: periodically ping the client to prevent idle timeout
  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      // Client didn't respond to last ping — connection is dead
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

  function handleRawMessage(raw: Buffer | string): void {
    if (authFailed) return;
    if (authPending || !authenticatedUserId) {
      pendingAuthMessages.push(raw);
      return;
    }

    try {
      const msg = JSON.parse(raw.toString());
      const userId = authenticatedUserId;

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
              select: { id: true },
            });
            if (!user) {
              ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
              return;
            }
            // Require session ownership for all hosting modes. Sharing across
            // org members must go through an explicit ACL, not implicit org
            // membership (prior behavior leaked terminal I/O across users).
            const session = await prisma.session.findFirst({
              where: {
                id: sessionId,
                organization: { orgMembers: { some: { userId: user.id } } },
              },
              select: {
                id: true,
                organizationId: true,
                sessionGroupId: true,
                connection: true,
              },
            });
            if (!session) {
              ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
              return;
            }
            try {
              await runtimeAccessService.assertAccess({
                userId,
                organizationId: session.organizationId,
                runtimeInstanceId: getConnectionRuntimeInstanceId(session.connection),
                sessionGroupId: session.sessionGroupId,
              });
            } catch {
              console.warn(
                `[terminal-handler] user ${userId} denied terminal access to session ${sessionId}`,
              );
              ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
              return;
            }
            const attached = terminalRelay.attachFrontend(terminalId, ws, userId);
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
  }

  ws.on("message", handleRawMessage);

  ws.on("error", (err: Error) => {
    console.warn("[terminal-handler] websocket error:", err.message);
  });

  ws.on("close", () => {
    clearInterval(pingInterval);
    pendingAuthMessages.length = 0;
    pendingMessages = [];
    terminalRelay.detachAllForFrontend(ws);
  });
}
