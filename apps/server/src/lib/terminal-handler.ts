import type { WebSocket } from "ws";
import { parseCookieToken } from "./auth.js";
import { terminalRelay } from "./terminal-relay.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "trace-dev-secret";

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

  // Authenticate from cookie (same as GraphQL WS)
  const token = parseCookieToken(req.headers.cookie);
  if (!token) {
    ws.send(JSON.stringify({ type: "error", message: "Unauthorized" }));
    ws.close();
    return;
  }

  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    ws.send(JSON.stringify({ type: "error", message: "Invalid token" }));
    ws.close();
    return;
  }

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.type) {
        case "attach": {
          const terminalId = msg.terminalId as string;
          if (!terminalId) {
            ws.send(JSON.stringify({ type: "error", message: "Missing terminalId" }));
            return;
          }
          const attached = terminalRelay.attachFrontend(terminalId, ws);
          if (!attached) {
            ws.send(JSON.stringify({ type: "error", message: "Terminal not found" }));
            return;
          }
          attachedTerminalId = terminalId;
          break;
        }
        case "input": {
          if (!attachedTerminalId) return;
          terminalRelay.relayFromFrontend(attachedTerminalId, "input", { data: msg.data });
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
    } catch (err) {
      console.error("[terminal-handler] error handling message:", err);
    }
  });

  ws.on("close", () => {
    terminalRelay.detachAllForFrontend(ws);
  });
}
