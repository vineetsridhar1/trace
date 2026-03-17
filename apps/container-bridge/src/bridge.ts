import WebSocket from "ws";
import type { BridgeClient as IBridgeClient, BridgeCommand, BridgeMessage, CodingToolAdapter } from "@trace/shared";
import { ClaudeCodeAdapter, CodexAdapter } from "@trace/shared/adapters";
import { ensureRepo, createWorktree, removeWorktree } from "./workspace.js";

/**
 * Multi-session container bridge — runs inside a Fly Machine (one per user per org).
 * Mirrors the desktop BridgeClient pattern: Map-based adapters, dynamic session binding.
 * Handles prepare/delete commands for repo cloning and worktree management.
 */
export class ContainerBridge implements IBridgeClient {
  private ws: WebSocket | null = null;
  private adapters = new Map<string, CodingToolAdapter>();
  private sessionTools = new Map<string, string>();
  private reportedToolSessionIds = new Map<string, string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly serverUrl: string,
    private readonly token: string,
    private readonly machineId: string,
    private readonly defaultTool: string,
  ) {}

  connect(): void {
    const url = `${this.serverUrl}?token=${encodeURIComponent(this.token)}`;
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[container-bridge] connected to server");
      // Announce as a cloud runtime — machineId is the stable instanceId
      this.send({
        type: "runtime_hello",
        instanceId: `cloud-machine-${this.machineId}`,
        label: `cloud-machine-${this.machineId}`,
        hostingMode: "cloud",
        supportedTools: [this.defaultTool],
      });

      this.startHeartbeat();
    });

    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as BridgeCommand;
        this.handleCommand(msg);
      } catch (err) {
        console.error("[container-bridge] error parsing message:", err);
      }
    });

    this.ws.on("close", () => {
      console.log("[container-bridge] disconnected, reconnecting in 3s...");
      this.stopHeartbeat();
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error("[container-bridge] error:", err.message);
    });
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const adapter of this.adapters.values()) {
      adapter.abort();
    }
    this.adapters.clear();
    this.ws?.close();
    this.ws = null;
  }

  send(data: BridgeMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: "runtime_heartbeat", instanceId: `cloud-machine-${this.machineId}` });
    }, 10_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private createAdapter(tool?: string): CodingToolAdapter {
    const resolvedTool = tool ?? this.defaultTool;
    switch (resolvedTool) {
      case "codex":
        return new CodexAdapter();
      case "claude_code":
      default:
        return new ClaudeCodeAdapter();
    }
  }

  private handleCommand(cmd: BridgeCommand): void {
    switch (cmd.type) {
      case "run":
      case "send": {
        this.runPrompt({
          sessionId: cmd.sessionId,
          prompt: cmd.prompt ?? "",
          cwd: cmd.cwd ?? "/workspace",
          tool: cmd.tool,
          model: cmd.model,
          interactionMode: cmd.interactionMode,
          toolSessionId: cmd.toolSessionId,
        });
        break;
      }

      case "prepare": {
        const { sessionId, repoId, repoRemoteUrl, defaultBranch, branch } = cmd;

        // Ensure repo is cloned, then create worktree for this session
        (async () => {
          try {
            await ensureRepo(repoId, repoRemoteUrl);
            const { workdir } = await createWorktree(repoId, sessionId, defaultBranch, branch);
            // Register this session with the server
            this.send({ type: "register_session", sessionId });
            this.send({ type: "workspace_ready", sessionId, workdir });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[container-bridge] workspace failed for ${sessionId}:`, message);
            this.send({ type: "workspace_failed", sessionId, error: message });
          }
        })();
        break;
      }

      case "terminate": {
        const adapter = this.adapters.get(cmd.sessionId);
        if (adapter) adapter.abort();
        break;
      }

      case "pause": {
        const adapter = this.adapters.get(cmd.sessionId);
        if (adapter) adapter.abort();
        break;
      }

      case "resume": {
        // Nothing to do — adapter reused on next run/send
        break;
      }

      case "delete": {
        const adapter = this.adapters.get(cmd.sessionId);
        if (adapter) {
          adapter.abort();
          this.adapters.delete(cmd.sessionId);
        }
        this.sessionTools.delete(cmd.sessionId);
        this.reportedToolSessionIds.delete(cmd.sessionId);

        // Clean up worktree for this session only — keep the machine and bare repo
        if (cmd.workdir && cmd.repoId) {
          removeWorktree(cmd.repoId, cmd.workdir).catch((err: Error) => {
            console.warn(`[container-bridge] failed to remove worktree ${cmd.workdir}:`, err.message);
          });
        }
        break;
      }
    }
  }

  private runPrompt({ sessionId, prompt, cwd, tool, model, interactionMode, toolSessionId }: {
    sessionId: string;
    prompt: string;
    cwd: string;
    tool?: string;
    model?: string;
    interactionMode?: string;
    toolSessionId?: string;
  }): void {
    // If tool changed, abort old adapter and create a fresh one
    const prevTool = this.sessionTools.get(sessionId);
    if (tool && prevTool && prevTool !== tool) {
      const oldAdapter = this.adapters.get(sessionId);
      if (oldAdapter) oldAdapter.abort();
      this.adapters.delete(sessionId);
    }

    // Reuse existing adapter for session continuity (--resume)
    let adapter = this.adapters.get(sessionId);
    if (!adapter) {
      adapter = this.createAdapter(tool);
      this.adapters.set(sessionId, adapter);
      this.send({ type: "register_session", sessionId });
    }
    if (tool) this.sessionTools.set(sessionId, tool);

    const activeAdapter = adapter;
    adapter.run({
      prompt,
      cwd,
      onOutput: (output) => {
        if (this.adapters.get(sessionId) !== activeAdapter) return;
        this.send({ type: "session_output", sessionId, data: output });
        if (adapter.getSessionId) {
          const sid = adapter.getSessionId();
          if (sid && sid !== this.reportedToolSessionIds.get(sessionId)) {
            this.reportedToolSessionIds.set(sessionId, sid);
            this.send({ type: "tool_session_id", sessionId, toolSessionId: sid });
          }
        }
      },
      onComplete: () => {
        if (this.adapters.get(sessionId) !== activeAdapter) return;
        this.send({ type: "session_complete", sessionId });
      },
      interactionMode: interactionMode as "code" | "plan" | "ask" | undefined,
      model,
      toolSessionId,
    });
  }
}
