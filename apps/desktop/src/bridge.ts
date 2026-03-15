import WebSocket from "ws";
import { ClaudeCodeAdapter, CodexAdapter, type CodingToolAdapter } from "@trace/shared";

export class BridgeClient {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private adapters = new Map<string, CodingToolAdapter>();

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  connect() {
    this.ws = new WebSocket(`${this.serverUrl}/bridge`);

    this.ws.on("open", () => {
      console.log("[bridge] connected to server");
    });

    this.ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      this.handleMessage(msg);
    });

    this.ws.on("close", () => {
      console.log("[bridge] disconnected, reconnecting in 3s...");
      setTimeout(() => this.connect(), 3000);
    });

    this.ws.on("error", (err) => {
      console.error("[bridge] error:", err.message);
    });
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

  private runPrompt({ sessionId, prompt, cwd, tool }: { sessionId: string; prompt: string; cwd?: string; tool?: string }) {
    const workdir = cwd ?? process.cwd();

    // Reuse existing adapter (retains session state for --resume)
    let adapter = this.adapters.get(sessionId);
    if (!adapter) {
      adapter = this.createAdapter(tool);
      this.adapters.set(sessionId, adapter);
      this.send({ type: "register_session", sessionId });
    }

    adapter.run({
      prompt,
      cwd: workdir,
      onOutput: (output) => {
        this.send({ type: "session_output", sessionId, data: output });
      },
      onComplete: () => {
        this.send({ type: "session_complete", sessionId });
      },
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
        });
        break;
      }
      case "send": {
        if (!msg.sessionId || !msg.prompt) return;
        this.runPrompt({
          sessionId: msg.sessionId,
          prompt: msg.prompt as string,
          tool: msg.tool as string | undefined,
        });
        break;
      }
      case "terminate": {
        if (!msg.sessionId) return;
        const adapter = this.adapters.get(msg.sessionId);
        if (adapter) {
          adapter.abort();
          this.adapters.delete(msg.sessionId);
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
    for (const adapter of this.adapters.values()) {
      adapter.abort();
    }
    this.adapters.clear();
    this.ws?.close();
    this.ws = null;
  }
}
