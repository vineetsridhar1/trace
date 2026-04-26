import type { WebSocket } from "ws";
import {
  authenticateAccessToken,
  isExternalLocalModeRequest,
  parseCookieToken,
} from "./auth.js";
import { terminalRelay } from "./terminal-relay.js";
import { prisma } from "./db.js";
import { runtimeAccessService } from "../services/runtime-access.js";
import { AuthorizationError } from "./errors.js";

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
const EXTERNAL_LOCAL_MODE_AUTH_ERROR = "External local-mode access requires a paired mobile token";

export function handleTerminalConnection(
  ws: WebSocket,
  req: {
    headers: Record<string, string | string[] | undefined> & { cookie?: string };
    url?: string;
    socket?: { remoteAddress?: string | null } | null;
  },
) {
  const sendFatalError = (message: string): void => {
    ws.send(JSON.stringify({ type: "error", message }));
    ws.close(1008, message);
  };

  let attachedTerminalId: string | null = null;
  let attachPending = false;
  let authReady = false;
  let userId: string | null = null;

  // Authenticate from query param (preferred) or cookie fallback
  const url = new URL(req.url ?? "", "http://localhost");
  const token = url.searchParams.get("token") ?? parseCookieToken(req.headers.cookie);
  if (!token) {
    sendFatalError("Unauthorized");
    return;
  }

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
    if (!authReady || attachPending) {
      return;
    }
    while (pendingMessages.length > 0 && authReady && !attachPending) {
      const msg = pendingMessages.shift();
      if (!msg) return;
      handleMessage(msg);
    }
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

  ws.on("message", (raw: Buffer | string) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "attach") {
        const terminalId = msg.terminalId as string;
        if (!terminalId) {
          ws.send(JSON.stringify({ type: "error", message: "Missing terminalId" }));
          return;
        }

        const authContext = terminalRelay.getTerminalAuthContext(terminalId);
        if (!authContext) {
          ws.send(JSON.stringify({ type: "error", message: "Terminal not found" }));
          return;
        }

        attachPending = true;

        (async () => {
          try {
            if (!userId) {
              ws.send(JSON.stringify({ type: "error", message: "Unauthorized" }));
              return;
            }
            if (authContext.ownerUserId !== userId) {
              ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
              return;
            }
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: { id: true },
            });
            if (!user) {
              ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
              return;
            }
            if (authContext.kind === "session") {
              const session = await prisma.session.findFirst({
                where: {
                  id: authContext.sessionId,
                  organization: { orgMembers: { some: { userId: user.id } } },
                },
                select: {
                  id: true,
                  organizationId: true,
                  sessionGroupId: true,
                },
              });
              if (!session) {
                ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
                return;
              }
              try {
                // Authorize against the runtime the terminal was pinned to at
                // creation time — NOT the session's current DB connection (which
                // can be null or stale and would silently bypass the check).
                await runtimeAccessService.assertAccess({
                  userId,
                  organizationId: session.organizationId,
                  runtimeInstanceId: authContext.runtimeInstanceId,
                  sessionGroupId: session.sessionGroupId,
                  capability: "terminal",
                });
              } catch (err) {
                if (!(err instanceof AuthorizationError)) throw err;
                console.warn(
                  `[terminal-handler] user ${userId} denied terminal access to session ${authContext.sessionId}`,
                );
                ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
                return;
              }
            } else {
              const channel = await prisma.channel.findFirst({
                where: {
                  id: authContext.channelId,
                  organizationId: authContext.organizationId,
                  members: { some: { userId: user.id } },
                },
                select: { id: true, organizationId: true },
              });
              if (!channel) {
                ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
                return;
              }
              try {
                await runtimeAccessService.assertAccess({
                  userId,
                  organizationId: channel.organizationId,
                  runtimeInstanceId: authContext.runtimeInstanceId,
                  capability: "terminal",
                });
              } catch (err) {
                if (!(err instanceof AuthorizationError)) throw err;
                console.warn(
                  `[terminal-handler] user ${userId} denied terminal access to channel ${authContext.channelId}`,
                );
                ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
                return;
              }
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

      // Buffer messages until the connection auth and attach auth complete.
      if (!authReady || attachPending) {
        pendingMessages.push(msg);
        return;
      }

      handleMessage(msg);
    } catch (err) {
      console.error("[terminal-handler] error handling message:", err);
    }
  });

  ws.on("error", (err: Error) => {
    console.warn("[terminal-handler] websocket error:", err.message);
  });

  ws.on("close", () => {
    clearInterval(pingInterval);
    pendingMessages = [];
    terminalRelay.detachAllForFrontend(ws);
  });

  void (async () => {
    try {
      const auth = await authenticateAccessToken(token);
      if (!auth) {
        sendFatalError("Invalid token");
        return;
      }
      if (isExternalLocalModeRequest(req) && auth.kind !== "local_mobile") {
        sendFatalError(EXTERNAL_LOCAL_MODE_AUTH_ERROR);
        return;
      }
      userId = auth.userId;
      authReady = true;
      processPending();
    } catch (err) {
      console.error("[terminal-handler] authentication failed:", err);
      sendFatalError("Authorization check failed");
    }
  })();
}
