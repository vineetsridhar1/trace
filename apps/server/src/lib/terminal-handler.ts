import type { WebSocket } from "ws";
import { authenticateAccessToken, isExternalLocalModeRequest, parseCookieToken } from "./auth.js";
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
const AUTH_TIMEOUT_MS = 5_000;
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
  let authPending = false;
  let authReady = false;
  let userId: string | null = null;
  let commandQueue = Promise.resolve();

  const url = new URL(req.url ?? "", "http://localhost");
  const initialToken = url.searchParams.get("token") ?? parseCookieToken(req.headers.cookie);
  let authTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    authTimeout = null;
    if (!authReady) sendFatalError("Unauthorized");
  }, AUTH_TIMEOUT_MS);

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
      if (msg.type === "attach") {
        handleAttachMessage(msg);
      } else {
        enqueueMessage(msg);
      }
    }
  }

  function enqueueMessage(msg: { type: string; [key: string]: unknown }): void {
    commandQueue = commandQueue
      .then(() => handleMessage(msg))
      .catch((err: unknown) => {
        console.error("[terminal-handler] error handling queued terminal message:", err);
      });
  }

  function clearAuthTimeout(): void {
    if (!authTimeout) return;
    clearTimeout(authTimeout);
    authTimeout = null;
  }

  async function authenticateConnectionToken(token: string): Promise<void> {
    if (authReady || authPending) return;
    authPending = true;
    try {
      const auth = await authenticateAccessToken(token);
      if (!auth) {
        clearAuthTimeout();
        sendFatalError("Invalid token");
        return;
      }
      if (isExternalLocalModeRequest(req) && auth.kind !== "mobile") {
        clearAuthTimeout();
        sendFatalError(EXTERNAL_LOCAL_MODE_AUTH_ERROR);
        return;
      }
      userId = auth.userId;
      authReady = true;
      clearAuthTimeout();
      processPending();
    } catch (err) {
      console.error("[terminal-handler] authentication failed:", err);
      clearAuthTimeout();
      sendFatalError("Authorization check failed");
    } finally {
      authPending = false;
    }
  }

  if (initialToken) {
    void authenticateConnectionToken(initialToken);
  }

  async function assertCurrentTerminalAccess(terminalId: string): Promise<boolean> {
    const denyCurrentCommand = (): false => {
      ws.send(JSON.stringify({ type: "error", message: "Access denied" }));
      ws.close(1008, "Access denied");
      return false;
    };

    const authContext = terminalRelay.getTerminalAuthContext(terminalId);
    if (!authContext || !userId || authContext.ownerUserId !== userId) {
      return denyCurrentCommand();
    }

    if (authContext.kind === "session") {
      const session = await prisma.session.findFirst({
        where: {
          id: authContext.sessionId,
          organization: { orgMembers: { some: { userId } } },
        },
        select: {
          organizationId: true,
          sessionGroupId: true,
        },
      });
      if (!session) {
        return denyCurrentCommand();
      }
      try {
        await runtimeAccessService.assertAccess({
          userId,
          organizationId: session.organizationId,
          runtimeInstanceId: authContext.runtimeInstanceId,
          sessionGroupId: session.sessionGroupId,
          capability: "terminal",
        });
      } catch (err) {
        if (!(err instanceof AuthorizationError)) throw err;
        return denyCurrentCommand();
      }
      return true;
    }

    const channel = await prisma.channel.findFirst({
      where: {
        id: authContext.channelId,
        organizationId: authContext.organizationId,
        members: { some: { userId } },
      },
      select: { organizationId: true },
    });
    if (!channel) {
      return denyCurrentCommand();
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
      return denyCurrentCommand();
    }
    return true;
  }

  async function handleMessage(msg: { type: string; [key: string]: unknown }): Promise<void> {
    switch (msg.type) {
      case "input": {
        const terminalId = attachedTerminalId;
        if (!terminalId) return;
        if (!(await assertCurrentTerminalAccess(terminalId))) return;
        terminalRelay.relayFromFrontend(terminalId, "input", { data: msg.data as string });
        break;
      }
      case "resize": {
        const terminalId = attachedTerminalId;
        if (!terminalId) return;
        if (!(await assertCurrentTerminalAccess(terminalId))) return;
        terminalRelay.relayFromFrontend(terminalId, "resize", {
          cols: msg.cols as number,
          rows: msg.rows as number,
        });
        break;
      }
    }
  }

  function handleAttachMessage(msg: { type: string; [key: string]: unknown }): void {
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
            // creation time, not the session's current DB connection.
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
  }

  ws.on("message", (raw: Buffer | string) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "auth") {
        const token = typeof msg.token === "string" ? msg.token : "";
        if (!token) {
          ws.send(JSON.stringify({ type: "error", message: "Unauthorized" }));
          return;
        }
        void authenticateConnectionToken(token);
        return;
      }

      // Buffer messages until the connection auth and attach auth complete.
      if (!authReady || authPending || attachPending) {
        pendingMessages.push(msg);
        return;
      }

      if (msg.type === "attach") {
        handleAttachMessage(msg);
        return;
      }

      enqueueMessage(msg);
    } catch (err) {
      console.error("[terminal-handler] error handling message:", err);
    }
  });

  ws.on("error", (err: Error) => {
    console.warn("[terminal-handler] websocket error:", err.message);
  });

  ws.on("close", () => {
    clearInterval(pingInterval);
    clearAuthTimeout();
    pendingMessages = [];
    terminalRelay.detachAllForFrontend(ws);
  });
}
