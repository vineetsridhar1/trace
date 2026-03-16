import { spawn, type ChildProcess } from "child_process";
import { createInterface } from "readline";
import type { CodingToolAdapter, RunOptions, ToolOutput, MessageBlock } from "./coding-tool.js";

/** Types we drop entirely — not relevant to the frontend */
const SKIP_TYPES = new Set(["system", "rate_limit_event", "stderr"]);

/**
 * Adapter for running Claude Code CLI sessions.
 * First call spawns `claude -p <prompt> --output-format stream-json --verbose`.
 * Subsequent calls use `--resume <sessionId>` to continue the conversation.
 *
 * Normalizes Claude Code's native output into the shared ToolOutput schema.
 */
export class ClaudeCodeAdapter implements CodingToolAdapter {
  private process: ChildProcess | null = null;
  private claudeSessionId: string | null = null;
  private cwd: string | null = null;
  private resultEmitted = false;

  run({ prompt, cwd, onOutput, onComplete, interactionMode, model, toolSessionId }: RunOptions) {
    this.cwd = cwd;
    this.resultEmitted = false;

    // Use provided toolSessionId to restore resume capability after bridge restart
    if (toolSessionId && !this.claudeSessionId) {
      this.claudeSessionId = toolSessionId;
    }

    const permissionFlag = interactionMode === "plan"
      ? "--permission-mode"
      : "--dangerously-skip-permissions";
    const args = ["-p", prompt, "--output-format", "stream-json", "--verbose"];
    if (model) {
      args.push("--model", model);
    }
    if (interactionMode === "plan") {
      args.push(permissionFlag, "plan");
    } else {
      args.push(permissionFlag);
    }
    if (this.claudeSessionId) {
      args.push("--resume", this.claudeSessionId);
    }

    this.process = spawn("claude", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    // Track process exit code so readline close handler can emit a fallback result
    let exitCode: number | null = null;
    let rlClosed = false;
    let processClosed = false;

    const maybeFinish = () => {
      if (!rlClosed || !processClosed) return;
      if (!this.resultEmitted) {
        onOutput({ type: "result", subtype: exitCode === 0 || exitCode === null ? "success" : "error" });
      }
      onComplete();
      this.process = null;
    };

    if (this.process.stdout) {
      const rl = createInterface({ input: this.process.stdout });
      rl.on("line", (line) => {
        if (!line.trim()) return;
        try {
          const parsed = JSON.parse(line);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (item && typeof item === "object") {
                this.processEvent(item as Record<string, unknown>, onOutput);
              }
            }
          } else {
            this.processEvent(parsed, onOutput);
          }
        } catch {
          // Non-JSON text from stdout
        }
      });
      rl.on("close", () => {
        rlClosed = true;
        maybeFinish();
      });
    } else {
      rlClosed = true;
    }

    if (this.process.stderr) {
      const rl = createInterface({ input: this.process.stderr });
      rl.on("line", () => {
        // stderr is dropped — not part of the normalized schema
      });
    }

    this.process.on("close", (code) => {
      exitCode = code;
      processClosed = true;
      maybeFinish();
    });

    this.process.on("error", (err) => {
      onOutput({ type: "error", message: err.message });
      onComplete();
      this.process = null;
    });
  }

  private processEvent(data: Record<string, unknown>, onOutput: (event: ToolOutput) => void) {
    this.extractSessionId(data);

    const type = data.type as string | undefined;
    if (!type || SKIP_TYPES.has(type)) return;

    // Claude Code's "assistant" events carry message.content[] with
    // text/tool_use/tool_result blocks — extract and forward.
    if (type === "assistant") {
      const message = data.message as Record<string, unknown> | undefined;
      const content = message?.content;
      if (Array.isArray(content)) {
        const normalized = content.map((block: Record<string, unknown>) => {
          if (block.type === "tool_use" && block.name === "AskUserQuestion") {
            const input = (block.input ?? {}) as Record<string, unknown>;
            const questions = Array.isArray(input.questions) ? input.questions : [];
            return {
              type: "question" as const,
              questions: questions.map((q: Record<string, unknown>) => ({
                question: String(q.question ?? ""),
                header: String(q.header ?? ""),
                options: Array.isArray(q.options)
                  ? q.options.map((o: Record<string, unknown>) => ({
                      label: String(o.label ?? ""),
                      description: String(o.description ?? ""),
                    }))
                  : [],
                multiSelect: q.multiSelect === true,
              })),
            };
          }
          return block;
        });
        onOutput({ type: "assistant", message: { content: normalized as unknown as MessageBlock[] } });
      }
      return;
    }

    if (type === "result") {
      const isError = data.is_error === true || data.subtype === "error";
      this.resultEmitted = true;
      onOutput({ type: "result", subtype: isError ? "error" : "success" });
      return;
    }
  }

  private extractSessionId(data: Record<string, unknown>) {
    const id = data.session_id as string | undefined;
    if (id) {
      this.claudeSessionId = id;
    }
  }

  getSessionId(): string | null {
    return this.claudeSessionId;
  }

  abort() {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }
}
