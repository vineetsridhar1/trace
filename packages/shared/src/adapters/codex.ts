import { spawn, type ChildProcess } from "child_process";
import { createInterface } from "readline";
import type { CodingToolAdapter, OutputCallback } from "./coding-tool.js";

/**
 * Adapter for running OpenAI Codex CLI sessions.
 * Spawns `codex --quiet --json` for non-interactive, JSON-streamed output.
 */
export class CodexAdapter implements CodingToolAdapter {
  private process: ChildProcess | null = null;
  private cwd: string | null = null;

  run(prompt: string, cwd: string, onOutput: OutputCallback, onComplete: () => void) {
    this.cwd = cwd;

    const args = ["--quiet", "--json", prompt];

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
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (item && typeof item === "object") {
                onOutput(item as Record<string, unknown>);
              }
            }
          } else {
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

  abort() {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }
}
