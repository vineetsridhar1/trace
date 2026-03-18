import { spawn, type ChildProcess } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import { createInterface } from "readline";
import type { CodingToolAdapter, RunOptions, ToolOutput, MessageBlock } from "./coding-tool.js";
import { parseQuestion } from "./coding-tool.js";

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
  private lastPlanFilePath: string | null = null;

  run({ prompt, cwd, onOutput, onComplete, interactionMode, model, toolSessionId }: RunOptions) {
    this.cwd = cwd;
    this.resultEmitted = false;
    this.lastPlanFilePath = null;

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
      detached: true,
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

    const stderrChunks: string[] = [];
    if (this.process.stderr) {
      const rl = createInterface({ input: this.process.stderr });
      rl.on("line", (line) => {
        stderrChunks.push(line);
      });
    }

    this.process.on("close", (code) => {
      exitCode = code;
      if (code !== 0 && code !== null && stderrChunks.length > 0) {
        onOutput({ type: "error", message: stderrChunks.join("\n") });
      }
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
        // Track plan file writes and detect ExitPlanMode before normalizing
        let hasExitPlanMode = false;
        for (const block of content as Record<string, unknown>[]) {
          if (block.type === "tool_use") {
            const name = String(block.name ?? "");
            if ((name === "Write" || name === "Edit") && block.input) {
              const input = block.input as Record<string, unknown>;
              const fp = String(input.file_path ?? "");
              if (fp.includes(".claude/plans/") && fp.endsWith(".md")) {
                this.lastPlanFilePath = fp;
              }
            }
            if (name === "ExitPlanMode") {
              hasExitPlanMode = true;
            }
          }
        }

        const normalized: MessageBlock[] = [];

        // If ExitPlanMode found, emit a PlanBlock instead of the raw tool_use.
        // Read the plan file from disk to get the full current content —
        // Edit tool_use only carries the diff, not the complete file.
        if (hasExitPlanMode && this.lastPlanFilePath) {
          let planContent = "";
          try {
            const abs = this.lastPlanFilePath.startsWith("/")
              ? this.lastPlanFilePath
              : resolve(this.cwd ?? "", this.lastPlanFilePath);
            planContent = readFileSync(abs, "utf-8");
          } catch {
            // File may not exist if the write failed — emit with empty content
          }
          normalized.push({
            type: "plan" as const,
            content: planContent,
            filePath: this.lastPlanFilePath,
          });
          this.lastPlanFilePath = null;
        }

        for (const block of content as Record<string, unknown>[]) {
          if (block.type === "tool_use" && block.name === "AskUserQuestion") {
            const input = (block.input ?? {}) as Record<string, unknown>;
            const questions = Array.isArray(input.questions) ? input.questions : [];
            normalized.push({
              type: "question" as const,
              questions: questions.map(parseQuestion),
            });
            continue;
          }
          // Skip ExitPlanMode tool_use — already emitted as PlanBlock above
          if (block.type === "tool_use" && block.name === "ExitPlanMode") {
            continue;
          }
          // Narrow known block types from the Claude Code JSON stream
          if (block.type === "text") {
            normalized.push({ type: "text", text: String(block.text ?? "") });
            continue;
          }
          if (block.type === "tool_use") {
            normalized.push({
              type: "tool_use",
              name: String(block.name ?? ""),
              input: block.input as Record<string, unknown> | undefined,
            });
            continue;
          }
          if (block.type === "tool_result") {
            normalized.push({
              type: "tool_result",
              name: String(block.name ?? ""),
              content: block.content as string | Record<string, unknown> | undefined,
            });
            continue;
          }
          // Fallback for unknown block types — treat as text
          normalized.push({ type: "text", text: "" });
        }
        onOutput({ type: "assistant", message: { content: normalized } });
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
      // Kill the entire process group (negative PID) since we spawn detached
      try { process.kill(-this.process.pid!, "SIGTERM"); } catch { /* already dead */ }
      this.process = null;
    }
  }
}
