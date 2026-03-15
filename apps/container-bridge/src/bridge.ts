import WebSocket from "ws";
import { ClaudeCodeAdapter, CodexAdapter, type CodingToolAdapter } from "@trace/shared";

/**
 * Container bridge — runs inside a Fly Machine.
 * Same protocol as the desktop BridgeClient but without Electron dependencies.
 * Connects to the server's /bridge WebSocket and handles session commands.
 */
export class ContainerBridge {
  private ws: WebSocket | null = null;
  private adapter: CodingToolAdapter | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly serverUrl: string,
    private readonly sessionId: string,
    private readonly token: string,
    private readonly tool: string,
    private readonly model?: string,
  ) {}

  connect(): void {
    const url = `${this.serverUrl}?token=${encodeURIComponent(this.token)}`;
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[container-bridge] connected to server");
      // Register this bridge for the session immediately
      this.send({ type: "register_session", sessionId: this.sessionId });
    });

    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (err) {
        console.error("[container-bridge] error parsing message:", err);
      }
    });

    this.ws.on("close", () => {
      console.log("[container-bridge] disconnected, reconnecting in 3s...");
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error("[container-bridge] error:", err.message);
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  private createAdapter(): CodingToolAdapter {
    switch (this.tool) {
      case "codex":
        return new CodexAdapter();
      case "claude_code":
      default:
        return new ClaudeCodeAdapter();
    }
  }

  private handleMessage(msg: { type: string; sessionId?: string; prompt?: string; [key: string]: unknown }): void {
    switch (msg.type) {
      case "run":
      case "send": {
        if (!msg.sessionId) return;
        this.runPrompt({
          prompt: (msg.prompt as string) ?? "",
          cwd: (msg.cwd as string) ?? process.cwd(),
          model: (msg.model as string) ?? this.model,
          interactionMode: msg.interactionMode as string | undefined,
        });
        break;
      }
      case "prepare": {
        // Cloud sessions handle repo clone at startup, not via prepare command.
        // If we get a prepare command anyway, just acknowledge the workspace.
        console.log("[container-bridge] ignoring prepare command (repo cloned at startup)");
        break;
      }
      case "terminate": {
        if (this.adapter) {
          this.adapter.abort();
        }
        break;
      }
      case "pause": {
        if (this.adapter) {
          this.adapter.abort();
        }
        break;
      }
      case "resume": {
        // Nothing to do — the adapter will be re-created on next run/send
        break;
      }
    }
  }

  private runPrompt({ prompt, cwd, model, interactionMode }: {
    prompt: string;
    cwd: string;
    model?: string;
    interactionMode?: string;
  }): void {
    // Reuse adapter for session continuity (--resume)
    if (!this.adapter) {
      this.adapter = this.createAdapter();
    }

    this.adapter.run({
      prompt,
      cwd,
      onOutput: (output) => {
        this.send({ type: "session_output", sessionId: this.sessionId, data: output });
      },
      onComplete: () => {
        this.send({ type: "session_complete", sessionId: this.sessionId });
      },
      interactionMode: interactionMode as "code" | "plan" | "ask" | undefined,
      model,
    });
  }

  /** Notify the server that workspace is ready */
  sendWorkspaceReady(workdir: string): void {
    this.send({ type: "workspace_ready", sessionId: this.sessionId, workdir });
  }

  /** Notify the server that workspace preparation failed */
  sendWorkspaceFailed(error: string): void {
    this.send({ type: "workspace_failed", sessionId: this.sessionId, error });
  }

  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.adapter) {
      this.adapter.abort();
      this.adapter = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}
