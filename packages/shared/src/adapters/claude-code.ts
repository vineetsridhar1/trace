import { spawn, type ChildProcess } from "child_process";
import { createInterface } from "readline";
import type { CodingToolAdapter, OutputCallback } from "./coding-tool.js";

/**
 * Adapter for running Claude Code CLI sessions.
 * First call spawns `claude -p <prompt> --output-format json --verbose`.
 * Subsequent calls use `--resume <sessionId>` to continue the conversation.
 */
export class ClaudeCodeAdapter implements CodingToolAdapter {
  private process: ChildProcess | null = null;
  private claudeSessionId: string | null = null;
  private cwd: string | null = null;

  run(prompt: string, cwd: string, onOutput: OutputCallback, onComplete: () => void) {
    this.cwd = cwd;

    const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions"];
    if (this.claudeSessionId) {
      args.push("--resume", this.claudeSessionId);
    }

    this.process = spawn("claude", args, {
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
          // Claude Code can emit arrays (e.g. init messages) — flatten them
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (item && typeof item === "object") {
                this.extractSessionId(item as Record<string, unknown>);
                onOutput(item as Record<string, unknown>);
              }
            }
          } else {
            this.extractSessionId(parsed);
            onOutput(parsed);
          }
        } catch {
          onOutput({ type: "text", text: line });
        }
      });
    }

    if (this.process.stderr) {
      const rl = createInterface({ input: this.process.stderr });
      rl.on("line", (line) => {
        if (!line.trim()) return;
        onOutput({ type: "stderr", text: line });
      });
    }

    this.process.on("close", (code) => {
      onOutput({ type: "result", exitCode: code });
      onComplete();
      this.process = null;
    });

    this.process.on("error", (err) => {
      onOutput({ type: "error", message: err.message });
      onComplete();
      this.process = null;
    });
  }

  /** Extract Claude Code's session_id from init or result messages for --resume */
  private extractSessionId(data: Record<string, unknown>) {
    const id = data.session_id as string | undefined;
    if (id) {
      this.claudeSessionId = id;
    }
  }

  abort() {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }
}
