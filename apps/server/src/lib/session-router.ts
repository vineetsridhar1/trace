import type WebSocket from "ws";

export interface SessionCommand {
  type: "run" | "terminate" | "pause" | "resume" | "send" | "prepare";
  sessionId: string;
  prompt?: string;
  [key: string]: unknown;
}

/**
 * Routes commands to the correct bridge WebSocket for a given session.
 * Each Electron client registers its sessions on connect; the router
 * dispatches commands to the right bridge connection.
 */
export class SessionRouter {
  /** Maps bridgeId → WebSocket */
  private bridges = new Map<string, WebSocket>();
  /** Maps sessionId → bridgeId */
  private sessionBridge = new Map<string, string>();

  registerBridge(bridgeId: string, ws: WebSocket) {
    this.bridges.set(bridgeId, ws);
  }

  unregisterBridge(bridgeId: string) {
    this.bridges.delete(bridgeId);
    for (const [sessionId, bid] of this.sessionBridge) {
      if (bid === bridgeId) this.sessionBridge.delete(sessionId);
    }
  }

  bindSession(sessionId: string, bridgeId: string) {
    this.sessionBridge.set(sessionId, bridgeId);
  }

  /** Send a command to the bridge that owns this session */
  send(sessionId: string, command: SessionCommand): boolean {
    let bridgeId = this.sessionBridge.get(sessionId);

    // Auto-bind to a default bridge if not yet bound
    if (!bridgeId) {
      const bridge = this.getDefaultBridge();
      if (!bridge) return false;
      this.bindSession(sessionId, bridge.id);
      bridgeId = bridge.id;
    }

    const ws = this.bridges.get(bridgeId);
    if (!ws || ws.readyState !== ws.OPEN) return false;

    ws.send(JSON.stringify(command));
    return true;
  }

  getDefaultBridge(): { id: string; ws: WebSocket } | undefined {
    for (const [id, ws] of this.bridges) {
      if (ws.readyState === ws.OPEN) return { id, ws };
    }
    return undefined;
  }
}

export const sessionRouter = new SessionRouter();
