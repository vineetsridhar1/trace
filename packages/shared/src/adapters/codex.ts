import { spawn, type ChildProcess } from "child_process";
import { createInterface } from "readline";
import type { CodingToolAdapter, RunOptions, ToolOutput } from "./coding-tool.js";

/**
 * Adapter for running OpenAI Codex CLI sessions.
 * Spawns `codex exec --json` for non-interactive, JSONL-streamed output.
 * Subsequent calls use `codex exec resume <threadId>` to continue the conversation.
 *
 * Normalizes Codex's native output into the shared ToolOutput schema.
 */
export class CodexAdapter implements CodingToolAdapter {
  private process: ChildProcess | null = null;
  private cwd: string | null = null;
  private threadId: string | null = null;
  private resultEmitted = false;

  run({ prompt, cwd, onOutput, onComplete }: RunOptions) {
    this.cwd = cwd;
    this.resultEmitted = false;

    const args = this.threadId
      ? ["exec", "resume", this.threadId, "--json", "--dangerously-bypass-approvals-and-sandbox", prompt]
      : ["exec", "--json", "--dangerously-bypass-approvals-and-sandbox", prompt];

    this.process = spawn("codex", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    if (this.process.stdout) {
      const rl = createInterface({ input: this.process.stdout });
      rl.on("line", (line) => {
        if (!line.trim()) return;
        try {
          const parsed = JSON.parse(line);
          this.processEvent(parsed, onOutput);
        } catch {
          // Non-JSON text from stdout
        }
      });
    }

    if (this.process.stderr) {
      const rl = createInterface({ input: this.process.stderr });
      rl.on("line", () => {
        // stderr dropped
      });
    }

    this.process.on("close", (code) => {
      if (!this.resultEmitted) {
        onOutput({ type: "result", subtype: code === 0 || code === null ? "success" : "error" });
      }
      onComplete();
      this.process = null;
    });

    this.process.on("error", (err) => {
      onOutput({ type: "error", message: err.message });
      onComplete();
      this.process = null;
    });
  }

  private processEvent(data: Record<string, unknown>, onOutput: (event: ToolOutput) => void) {
    const eventType = data.type as string | undefined;
    if (!eventType) return;

    if (eventType === "thread.started" && typeof data.thread_id === "string") {
      this.threadId = data.thread_id;
      return;
    }

    const item = data.item as Record<string, unknown> | undefined;
    if (!item) return;
    const itemType = item.type as string | undefined;

    // item.started + command_execution → tool_use (command is being invoked)
    if (eventType === "item.started" && itemType === "command_execution") {
      const command = item.command as string | undefined;
      if (command) {
        onOutput({
          type: "assistant",
          message: { content: [{ type: "tool_use", name: "command", input: { command } }] },
        });
      }
      return;
    }

    if (eventType !== "item.completed") return;

    // command_execution completed → tool_result
    if (itemType === "command_execution") {
      const output = item.aggregated_output as string | undefined;
      onOutput({
        type: "assistant",
        message: { content: [{ type: "tool_result", name: "command", content: output ?? "" }] },
      });
      return;
    }

    // agent_message → text response
    if (itemType === "agent_message") {
      const text = item.text as string | undefined;
      if (text) {
        onOutput({
          type: "assistant",
          message: { content: [{ type: "text", text }] },
        });
      }
      return;
    }

    // reasoning — skip (internal model thinking)
  }

  abort() {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }
}
