import { spawn, type ChildProcess } from "child_process";
import { readdirSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createInterface } from "readline";
import type { CodingToolAdapter, RunOptions, ToolOutput, TokenUsage } from "./coding-tool.js";

const EXIT_CLOSE_GRACE_MS = 1_000;
/** Generous cap so long agent runs aren't cut short by agy's default 5m print timeout. */
const PRINT_TIMEOUT = "30m0s";
/** agy stores one protobuf transcript per conversation here, keyed by conversation UUID. */
const CONVERSATIONS_DIR = join(homedir(), ".gemini", "antigravity-cli", "conversations");
/** agy prints this to stdout when --conversation points at a missing conversation. */
const NOT_FOUND_WARNING = /^Warning: conversation ".*" not found\.$/;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function num(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

/**
 * Read usage only from an explicitly named usage container. We never fall back
 * to the bare line object: agy is print-only and a model can legitimately print
 * JSON containing keys like `input`/`output`, which must not be mistaken for
 * usage metadata and swallowed from the visible output.
 */
function parseAntigravityUsage(data: Record<string, unknown>): TokenUsage | undefined {
  const usage =
    asRecord(data.usage) ??
    asRecord(data.tokenUsage) ??
    asRecord(data.token_usage) ??
    asRecord(data.tokens);
  if (!usage) return undefined;
  const inputDetails = asRecord(usage.inputTokenDetails) ?? asRecord(usage.input_token_details);

  const normalized: TokenUsage = {
    inputTokens: num(usage.inputTokens, usage.input_tokens, usage.input, usage.prompt_tokens),
    outputTokens: num(usage.outputTokens, usage.output_tokens, usage.output, usage.completion_tokens),
    cacheReadTokens: num(
      usage.cacheReadTokens,
      usage.cacheRead,
      usage.cache_read_input_tokens,
      usage.cached_input_tokens,
      inputDetails?.cached_tokens,
    ),
    cacheCreationTokens: num(
      usage.cacheCreationTokens,
      usage.cacheWrite,
      usage.cache_creation_input_tokens,
      inputDetails?.cache_creation_tokens,
    ),
  };

  if (
    normalized.inputTokens === 0 &&
    normalized.outputTokens === 0 &&
    normalized.cacheReadTokens === 0 &&
    normalized.cacheCreationTokens === 0
  ) {
    return undefined;
  }

  return normalized;
}

/**
 * Adapter for running Google's Antigravity CLI (`agy`) sessions.
 *
 * agy v1.0.3 has no structured/streaming output mode: print mode (`agy -p`)
 * runs a single prompt non-interactively and prints only the final assistant
 * text to stdout — no per-step tool_use/tool_result events. We therefore emit
 * one assistant text block per turn followed by a result. The session's
 * "is working" indicator (driven by active status) covers liveness while the
 * run is in flight.
 *
 * agy has no per-invocation model flag (the model lives in agy's own global
 * settings), so `model`/`reasoningEffort` from RunOptions are ignored.
 *
 * Resume: agy only resumes conversations it created itself (caller-supplied
 * IDs are rejected), and print mode never prints the ID. We recover it by
 * finding the conversation transcript our run created or updated, and pass it
 * back via `--conversation` on the next turn.
 */
export class AntigravityAdapter implements CodingToolAdapter {
  private process: ChildProcess | null = null;
  private conversationId: string | null = null;
  private processGeneration = 0;
  private lastUsage: TokenUsage | undefined;

  run({ prompt, cwd, onOutput, onComplete, interactionMode, toolSessionId }: RunOptions) {
    this.lastUsage = undefined;

    // Restore resume capability after a bridge restart.
    if (toolSessionId && !this.conversationId) {
      this.conversationId = toolSessionId;
    }

    // Snapshot transcripts before the run so we can attribute the new/updated
    // one to this process afterwards.
    const before = this.snapshotConversations();

    const args = ["-p", prompt, "--dangerously-skip-permissions", "--print-timeout", PRINT_TIMEOUT];
    if (this.conversationId) {
      args.push("--conversation", this.conversationId);
    }

    const processGeneration = ++this.processGeneration;
    const child = spawn("agy", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
      detached: true,
    });
    this.process = child;

    const isCurrentProcess = () =>
      this.processGeneration === processGeneration && this.process === child;

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let finished = false;
    let exitFallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const clearExitFallbackTimer = () => {
      if (exitFallbackTimer) {
        clearTimeout(exitFallbackTimer);
        exitFallbackTimer = null;
      }
    };

    if (child.stdout) {
      // Prevent unhandled 'error' events on the pipe from crashing the process
      // when abort() kills the child (the pipe can emit ECONNRESET/EPIPE).
      child.stdout.on("error", () => {});
      const rl = createInterface({ input: child.stdout });
      rl.on("line", (line) => {
        if (!isCurrentProcess()) return;
        if (NOT_FOUND_WARNING.test(line.trim())) return;
        if (this.captureUsageLine(line)) return;
        stdoutChunks.push(line);
      });
    }

    if (child.stderr) {
      child.stderr.on("error", () => {});
      const rl = createInterface({ input: child.stderr });
      rl.on("line", (line) => {
        if (!isCurrentProcess()) return;
        if (this.captureUsageLine(line)) return;
        stderrChunks.push(line);
      });
    }

    const finish = (code: number | null) => {
      if (finished) return;
      if (!isCurrentProcess()) return;
      finished = true;
      clearExitFallbackTimer();

      // Capture the conversation id agy created/updated so the next turn resumes.
      const captured = this.captureConversationId(before);
      if (captured) this.conversationId = captured;

      const isError = code !== 0 && code !== null;
      const text = stdoutChunks.join("\n").trim();
      if (text) {
        onOutput(
          interactionMode === "plan"
            ? { type: "assistant", message: { content: [{ type: "plan", content: text }] } }
            : { type: "assistant", message: { content: [{ type: "text", text }] } },
        );
      }
      if (isError && stderrChunks.length > 0) {
        onOutput({ type: "error", message: stderrChunks.join("\n") });
      }
      onOutput({
        type: "result",
        subtype: isError ? "error" : "success",
        ...(this.lastUsage ? { usage: this.lastUsage } : {}),
      });
      onComplete();
      this.process = null;
    };

    // Some environments deliver 'exit' but never 'close' on the pipes; fall back
    // after a short grace period so the turn always completes.
    child.on("exit", (code: number | null) => {
      if (!isCurrentProcess()) return;
      clearExitFallbackTimer();
      exitFallbackTimer = setTimeout(() => finish(code), EXIT_CLOSE_GRACE_MS);
    });
    child.on("close", finish);
    child.on("error", (err: Error) => {
      if (finished) return;
      clearExitFallbackTimer();
      finished = true;
      if (!isCurrentProcess()) return;
      onOutput({ type: "error", message: err.message });
      onComplete();
      this.process = null;
    });
  }

  /** Map of conversation id → last-modified ms for every transcript on disk. */
  private snapshotConversations(): Map<string, number> {
    const snapshot = new Map<string, number>();
    try {
      for (const file of readdirSync(CONVERSATIONS_DIR)) {
        if (!file.endsWith(".pb")) continue;
        try {
          snapshot.set(file.slice(0, -3), statSync(join(CONVERSATIONS_DIR, file)).mtimeMs);
        } catch {
          // File vanished between readdir and stat — ignore.
        }
      }
    } catch {
      // Conversations dir may not exist before agy's first run.
    }
    return snapshot;
  }

  /**
   * Identify the conversation this run created or resumed: the newest transcript
   * that is new since `before`, or whose mtime advanced. Returns null when none
   * changed (so an existing id is preserved).
   */
  private captureConversationId(before: Map<string, number>): string | null {
    let bestId: string | null = null;
    let bestMtime = -1;
    for (const [id, mtime] of this.snapshotConversations()) {
      const prior = before.get(id);
      const changed = prior === undefined || mtime > prior;
      if (changed && mtime > bestMtime) {
        bestMtime = mtime;
        bestId = id;
      }
    }
    return bestId;
  }

  private captureUsageLine(line: string): boolean {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return false;
    }

    const data = asRecord(parsed);
    if (!data) return false;

    // Only treat the line as usage metadata (and swallow it) when it carries a
    // named usage container. A bare JSON line the agent prints as real output is
    // left untouched so we never drop visible content.
    const usage = parseAntigravityUsage(data);
    if (!usage) return false;

    this.lastUsage = usage;
    return true;
  }

  getSessionId(): string | null {
    return this.conversationId;
  }

  abort() {
    if (this.process) {
      // Kill the entire process group (negative PID) since we spawn detached.
      try {
        process.kill(-this.process.pid!, "SIGTERM");
      } catch {
        /* already dead */
      }
      this.process = null;
    }
  }
}
