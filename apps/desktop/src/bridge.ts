import WebSocket from "ws";
import { randomUUID } from "crypto";
import os from "os";
import { ClaudeCodeAdapter, CodexAdapter, type CodingToolAdapter } from "@trace/shared";
import { readConfig } from "./config.js";
import { createWorktree } from "./worktree.js";

const HEARTBEAT_INTERVAL_MS = 10_000;

export class BridgeClient {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private adapters = new Map<string, CodingToolAdapter>();
  private sessionTools = new Map<string, string>();
  private reportedToolSessionIds = new Map<string, string>();
  private instanceId: string;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
    // Stable instance ID persisted for the lifetime of this bridge process
    this.instanceId = randomUUID();
  }

  connect() {
    this.ws = new WebSocket(`${this.serverUrl}/bridge`);

    this.ws.on("open", () => {
      console.log("[bridge] connected to server");
      this.sendRuntimeHello();
      this.startHeartbeat();
    });

    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (err) {
        console.error("[bridge] failed to parse message:", err);
      }
    });

    this.ws.on("close", () => {
      console.log("[bridge] disconnected, reconnecting in 3s...");
      this.stopHeartbeat();
      setTimeout(() => this.connect(), 3000);
    });

    this.ws.on("error", (err) => {
      console.error("[bridge] error:", err.message);
    });
  }

  private sendRuntimeHello() {
    // Announce identity so the server can track this runtime instance
    const ownedSessionIds = [...this.adapters.keys()];
    this.send({
      type: "runtime_hello",
      instanceId: this.instanceId,
      label: os.hostname(),
      hostingMode: "local",
      supportedTools: ["claude_code", "codex", "custom"],
      sessionIds: ownedSessionIds,
    });
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: "runtime_heartbeat", instanceId: this.instanceId });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private createAdapter(tool?: string): CodingToolAdapter {
    switch (tool) {
      case "codex":
        return new CodexAdapter();
      case "claude_code":
      default:
        return new ClaudeCodeAdapter();
    }
  }

  private runPrompt({ sessionId, prompt, cwd, tool, model, interactionMode, toolSessionId }: { sessionId: string; prompt: string; cwd?: string; tool?: string; model?: string; interactionMode?: string; toolSessionId?: string }) {
    if (!cwd) {
      console.warn(`[bridge] No cwd provided for session ${sessionId}, falling back to process.cwd()`);
    }
    const workdir = cwd ?? process.cwd();

    // If tool changed, abort old adapter and create a fresh one
    const prevTool = this.sessionTools.get(sessionId);
    if (tool && prevTool && prevTool !== tool) {
      const oldAdapter = this.adapters.get(sessionId);
      if (oldAdapter) oldAdapter.abort();
      this.adapters.delete(sessionId);
    }

    // Reuse existing adapter (retains session state for --resume)
    let adapter = this.adapters.get(sessionId);
    if (!adapter) {
      adapter = this.createAdapter(tool);
      this.adapters.set(sessionId, adapter);
      this.send({ type: "register_session", sessionId });
    }
    if (tool) this.sessionTools.set(sessionId, tool);

    // Capture reference so stale callbacks from an aborted adapter
    // (e.g. after a tool switch) are silently dropped.
    const activeAdapter = adapter;
    adapter.run({
      prompt,
      cwd: workdir,
      onOutput: (output) => {
        if (this.adapters.get(sessionId) !== activeAdapter) return;
        this.send({ type: "session_output", sessionId, data: output });
        // When the adapter discovers its tool session ID, report it to the server
        // so it can be passed back on retry/resume
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

  private handleMessage(msg: { type: string; sessionId?: string; prompt?: string; [key: string]: unknown }) {
    switch (msg.type) {
      case "run": {
        if (!msg.sessionId) return;
        this.runPrompt({
          sessionId: msg.sessionId,
          prompt: msg.prompt as string ?? "",
          cwd: msg.cwd as string | undefined,
          tool: msg.tool as string | undefined,
          model: msg.model as string | undefined,
          interactionMode: msg.interactionMode as string | undefined,
          toolSessionId: msg.toolSessionId as string | undefined,
        });
        break;
      }
      case "send": {
        if (!msg.sessionId || !msg.prompt) return;
        this.runPrompt({
          sessionId: msg.sessionId,
          prompt: msg.prompt as string,
          cwd: msg.cwd as string | undefined,
          tool: msg.tool as string | undefined,
          model: msg.model as string | undefined,
          interactionMode: msg.interactionMode as string | undefined,
          toolSessionId: msg.toolSessionId as string | undefined,
        });
        break;
      }
      case "prepare": {
        if (!msg.sessionId) return;
        const sessionId = msg.sessionId;
        const repoId = msg.repoId as string;
        const repoName = msg.repoName as string;
        const defaultBranch = (msg.defaultBranch as string) ?? "main";

        const config = readConfig();
        const repoPath = config.repos[repoId];

        if (!repoPath) {
          this.send({
            type: "workspace_failed",
            sessionId,
            error: `No local path configured for repo "${repoName}" (${repoId}). Configure it in Settings.`,
          });
          break;
        }

        createWorktree({ repoPath, repoId, sessionId, defaultBranch })
          .then(({ workdir }) => {
            this.send({ type: "workspace_ready", sessionId, workdir });
          })
          .catch((err: Error) => {
            this.send({ type: "workspace_failed", sessionId, error: err.message });
          });
        break;
      }
      case "terminate": {
        if (!msg.sessionId) return;
        const adapter = this.adapters.get(msg.sessionId);
        if (adapter) {
          // Abort the running process but keep the adapter so it retains
          // the Claude Code session ID for --resume on subsequent messages.
          adapter.abort();
        }
        break;
      }
    }
  }

  send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect() {
    this.stopHeartbeat();
    for (const adapter of this.adapters.values()) {
      adapter.abort();
    }
    this.adapters.clear();
    this.ws?.close();
    this.ws = null;
  }
}
