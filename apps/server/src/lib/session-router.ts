import type WebSocket from "ws";

export interface SessionCommand {
  type: "run" | "terminate" | "pause" | "resume" | "send" | "prepare";
  sessionId: string;
  prompt?: string;
  [key: string]: unknown;
}

export type DeliveryResult =
  | "delivered"
  | "no_runtime"
  | "runtime_disconnected"
  | "session_unbound"
  | "delivery_failed";

export interface RuntimeInstance {
  id: string;
  label: string;
  ws: WebSocket;
  hostingMode: "cloud" | "local";
  supportedTools: string[];
  lastHeartbeat: number;
  boundSessions: Set<string>;
}

/**
 * Runtime-aware registry that tracks runtime instances, their capabilities,
 * and which sessions they own. Replaces the old bridge-only socket map.
 */
export class SessionRouter {
  private runtimes = new Map<string, RuntimeInstance>();
  /** Maps sessionId → runtimeId */
  private sessionRuntime = new Map<string, string>();

  /** Heartbeat timeout in ms — if no heartbeat in this window, runtime is considered stale */
  static HEARTBEAT_TIMEOUT_MS = 30_000;

  registerRuntime(runtime: {
    id: string;
    label: string;
    ws: WebSocket;
    hostingMode: "cloud" | "local";
    supportedTools: string[];
  }) {
    this.runtimes.set(runtime.id, {
      ...runtime,
      lastHeartbeat: Date.now(),
      boundSessions: new Set(),
    });
  }

  recordHeartbeat(runtimeId: string): boolean {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) return false;
    runtime.lastHeartbeat = Date.now();
    return true;
  }

  /**
   * Unregister a runtime and return the session IDs that were bound to it.
   */
  unregisterRuntime(runtimeId: string): string[] {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) return [];
    const affectedSessions = [...runtime.boundSessions];
    for (const sessionId of affectedSessions) {
      this.sessionRuntime.delete(sessionId);
    }
    this.runtimes.delete(runtimeId);
    return affectedSessions;
  }

  bindSession(sessionId: string, runtimeId: string) {
    const previousRuntimeId = this.sessionRuntime.get(sessionId);
    if (previousRuntimeId && previousRuntimeId !== runtimeId) {
      const previousRuntime = this.runtimes.get(previousRuntimeId);
      previousRuntime?.boundSessions.delete(sessionId);
    }
    this.sessionRuntime.set(sessionId, runtimeId);
    const runtime = this.runtimes.get(runtimeId);
    if (runtime) {
      runtime.boundSessions.add(sessionId);
    }
  }

  unbindSession(sessionId: string) {
    const runtimeId = this.sessionRuntime.get(sessionId);
    if (runtimeId) {
      const runtime = this.runtimes.get(runtimeId);
      if (runtime) runtime.boundSessions.delete(sessionId);
    }
    this.sessionRuntime.delete(sessionId);
  }

  getRuntimeForSession(sessionId: string): RuntimeInstance | undefined {
    const runtimeId = this.sessionRuntime.get(sessionId);
    if (!runtimeId) return undefined;
    return this.runtimes.get(runtimeId);
  }

  getRuntime(runtimeId: string): RuntimeInstance | undefined {
    return this.runtimes.get(runtimeId);
  }

  /** Send a command to the runtime that owns this session, returning a typed delivery result. */
  send(sessionId: string, command: SessionCommand): DeliveryResult {
    let runtimeId = this.sessionRuntime.get(sessionId);

    // Auto-bind to a default runtime if not yet bound
    if (!runtimeId) {
      const runtime = this.getDefaultRuntime();
      if (!runtime) return "no_runtime";
      this.bindSession(sessionId, runtime.id);
      runtimeId = runtime.id;
    }

    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) return "session_unbound";
    if (runtime.ws.readyState !== runtime.ws.OPEN) return "runtime_disconnected";

    try {
      runtime.ws.send(JSON.stringify(command));
      return "delivered";
    } catch {
      return "delivery_failed";
    }
  }

  getDefaultRuntime(): RuntimeInstance | undefined {
    for (const runtime of this.runtimes.values()) {
      if (runtime.ws.readyState === runtime.ws.OPEN) return runtime;
    }
    return undefined;
  }

  /** List all connected runtimes, optionally filtered by hosting mode. */
  listRuntimes(filter?: { hostingMode?: string }): RuntimeInstance[] {
    const results: RuntimeInstance[] = [];
    for (const runtime of this.runtimes.values()) {
      if (runtime.ws.readyState !== runtime.ws.OPEN) continue;
      if (filter?.hostingMode && runtime.hostingMode !== filter.hostingMode) continue;
      results.push(runtime);
    }
    return results;
  }

  /** Check for stale runtimes that have missed heartbeats. Returns affected session IDs. */
  checkStaleRuntimes(): Array<{ runtimeId: string; sessionIds: string[] }> {
    const now = Date.now();
    const stale: Array<{ runtimeId: string; sessionIds: string[] }> = [];
    for (const [runtimeId, runtime] of this.runtimes) {
      if (now - runtime.lastHeartbeat > SessionRouter.HEARTBEAT_TIMEOUT_MS) {
        stale.push({ runtimeId, sessionIds: [...runtime.boundSessions] });
      }
    }
    return stale;
  }

  // Backwards-compatible aliases for bridge-handler migration
  registerBridge(bridgeId: string, ws: WebSocket) {
    this.registerRuntime({
      id: bridgeId,
      label: bridgeId,
      ws,
      hostingMode: "local",
      supportedTools: ["claude_code", "codex", "custom"],
    });
  }

  unregisterBridge(bridgeId: string): string[] {
    return this.unregisterRuntime(bridgeId);
  }

  getDefaultBridge(): { id: string; ws: WebSocket } | undefined {
    const runtime = this.getDefaultRuntime();
    if (!runtime) return undefined;
    return { id: runtime.id, ws: runtime.ws };
  }
}

export const sessionRouter = new SessionRouter();
