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
  private interactionMode: "code" | "plan" | "ask" | undefined;
  private lastTextContent: string | null = null;

  run({ prompt, cwd, onOutput, onComplete, model, toolSessionId, interactionMode }: RunOptions) {
    this.cwd = cwd;
    this.resultEmitted = false;
    this.interactionMode = interactionMode;
    this.lastTextContent = null;

    if (toolSessionId && !this.threadId) {
      this.threadId = toolSessionId;
    }

    const args = this.threadId
      ? ["exec", "resume", this.threadId, "--json", "--dangerously-bypass-approvals-and-sandbox", prompt]
      : ["exec", "--json", "--dangerously-bypass-approvals-and-sandbox", prompt];
    if (model) {
      args.push("--model", model);
    }

    this.process = spawn("codex", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
      detached: true,
    });

    if (this.process.stdout) {
      // Prevent unhandled 'error' events on the pipe from crashing the process
      // when abort() kills the child (the pipe can emit ECONNRESET/EPIPE).
      this.process.stdout.on("error", () => {});
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

    const stderrChunks: string[] = [];
    if (this.process.stderr) {
      this.process.stderr.on("error", () => {});
      const rl = createInterface({ input: this.process.stderr });
      rl.on("line", (line) => {
        stderrChunks.push(line);
      });
    }

    this.process.on("close", (code) => {
      // If in plan mode and exited cleanly with text, wrap as PlanBlock.
      // Codex doesn't write plan files to disk, so filePath is omitted.
      if (this.interactionMode === "plan" && (code === 0 || code === null) && this.lastTextContent) {
        onOutput({
          type: "assistant",
          message: { content: [{ type: "plan", content: this.lastTextContent }] },
        });
      }
      if (!this.resultEmitted) {
        const isError = code !== 0 && code !== null;
        if (isError && stderrChunks.length > 0) {
          onOutput({ type: "error", message: stderrChunks.join("\n") });
        }
        onOutput({ type: "result", subtype: isError ? "error" : "success" });
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
      const command = item.command as string | undefined;
      const output = item.aggregated_output as string | undefined;
      const exitCode = typeof item.exit_code === "number" ? item.exit_code : undefined;
      const content: Record<string, unknown> = { output: output ?? "" };
      if (command) content.command = command;
      if (exitCode != null) content.exitCode = exitCode;
      onOutput({
        type: "assistant",
        message: { content: [{ type: "tool_result", name: "command", content }] },
      });
      return;
    }

    // agent_message → text response
    if (itemType === "agent_message") {
      const text = item.text as string | undefined;
      if (text) {
        this.lastTextContent = text;
        onOutput({
          type: "assistant",
          message: { content: [{ type: "text", text }] },
        });
      }
      return;
    }

    // reasoning — skip (internal model thinking)
  }

  getSessionId(): string | null {
    return this.threadId;
  }

  abort() {
    if (this.process) {
      // Kill the entire process group (negative PID) since we spawn detached
      try { process.kill(-this.process.pid!, "SIGTERM"); } catch { /* already dead */ }
      this.process = null;
    }
  }
}
