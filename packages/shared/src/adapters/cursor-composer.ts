import { spawn, type ChildProcess } from "child_process";
import { createInterface } from "readline";
import type { CodingToolAdapter, RunOptions, ToolOutput, MessageBlock } from "./coding-tool.js";
import { resolveCursorComposerModel } from "../models.js";
import { buildChildProcessEnv } from "./spawn-env.js";

const EXIT_CLOSE_GRACE_MS = 1_000;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Cursor names tool-call payloads by a single wrapper key, e.g.
 * `{ readToolCall: { args, result } }`. Strip the `ToolCall` suffix to get a
 * human-readable tool name and return the nested detail object.
 */
/** Coerce a Cursor tool result into the shared block's `string | Record` shape. */
function toToolResultContent(value: unknown): string | Record<string, unknown> {
  if (typeof value === "string") return value;
  return asRecord(value) ?? {};
}

function unwrapToolCall(
  toolCall: Record<string, unknown>,
): { name: string; detail: Record<string, unknown> } | undefined {
  const key = Object.keys(toolCall)[0];
  if (!key) return undefined;
  const detail = asRecord(toolCall[key]) ?? {};
  return { name: key.replace(/ToolCall$/, ""), detail };
}

/**
 * Adapter for running Cursor Composer (`cursor-agent`) sessions.
 * First call spawns `cursor-agent -p --output-format stream-json --force`.
 * Subsequent calls use `--resume <chatId>` to continue the conversation.
 *
 * Cursor emits Claude-Code-style `assistant`/`result` envelopes but delivers
 * tool calls as separate top-level `tool_call` events, which this adapter
 * normalizes into the shared ToolOutput schema.
 */
export class CursorComposerAdapter implements CodingToolAdapter {
  private process: ChildProcess | null = null;
  private chatId: string | null = null;
  private resultEmitted = false;
  private processGeneration = 0;

  run({
    prompt,
    cwd,
    onOutput,
    onComplete,
    interactionMode,
    model,
    reasoningEffort,
    toolSessionId,
  }: RunOptions) {
    this.resultEmitted = false;

    if (toolSessionId && !this.chatId) {
      this.chatId = toolSessionId;
    }

    const args = ["-p", "--output-format", "stream-json", "--force"];
    // Cursor encodes the thinking level into the model id (e.g.
    // claude-opus-4-8-thinking-high), so fold the effort in here.
    const resolvedModel = resolveCursorComposerModel(model, reasoningEffort);
    if (resolvedModel) {
      args.push("--model", resolvedModel);
    }
    if (interactionMode === "plan" || interactionMode === "ask") {
      args.push("--mode", interactionMode);
    }
    if (this.chatId) {
      args.push("--resume", this.chatId);
    }

    const processGeneration = ++this.processGeneration;
    const child = spawn("cursor-agent", args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: buildChildProcessEnv(),
      detached: true,
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(prompt);
    this.process = child;

    let exitCode: number | null = null;
    let rlClosed = false;
    let processClosed = false;
    let finished = false;
    let stderrEmitted = false;
    let exitFallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const stderrChunks: string[] = [];

    const isCurrentProcess = () =>
      this.processGeneration === processGeneration && this.process === child;

    const clearExitFallbackTimer = () => {
      if (exitFallbackTimer) {
        clearTimeout(exitFallbackTimer);
        exitFallbackTimer = null;
      }
    };

    const emitStderrIfNeeded = () => {
      if (stderrEmitted) return;
      stderrEmitted = true;
      if (exitCode !== 0 && exitCode !== null && stderrChunks.length > 0) {
        onOutput({ type: "error", message: stderrChunks.join("\n") });
      }
    };

    const finish = () => {
      if (finished) return;
      if (!isCurrentProcess()) return;
      finished = true;
      clearExitFallbackTimer();
      emitStderrIfNeeded();
      if (!this.resultEmitted) {
        onOutput({
          type: "result",
          subtype: exitCode === 0 || exitCode === null ? "success" : "error",
        });
      }
      onComplete();
      this.process = null;
    };

    const maybeFinish = () => {
      if (!rlClosed || !processClosed) return;
      finish();
    };

    if (child.stdout) {
      child.stdout.on("error", () => {});
      const rl = createInterface({ input: child.stdout });
      rl.on("line", (line) => {
        if (!isCurrentProcess()) return;
        if (!line.trim()) return;
        try {
          this.processEvent(JSON.parse(line), onOutput);
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

    if (child.stderr) {
      child.stderr.on("error", () => {});
      const rl = createInterface({ input: child.stderr });
      rl.on("line", (line) => {
        if (!isCurrentProcess()) return;
        stderrChunks.push(line);
      });
    }

    child.on("close", (code: number | null) => {
      exitCode = code;
      if (!isCurrentProcess()) return;
      processClosed = true;
      maybeFinish();
    });

    child.on("exit", (code: number | null) => {
      exitCode = code;
      if (!isCurrentProcess()) return;
      processClosed = true;
      clearExitFallbackTimer();
      exitFallbackTimer = setTimeout(finish, EXIT_CLOSE_GRACE_MS);
    });

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

  private processEvent(raw: unknown, onOutput: (event: ToolOutput) => void) {
    const data = asRecord(raw);
    if (!data) return;

    const sessionId = data.session_id;
    if (typeof sessionId === "string") {
      this.chatId = sessionId;
    }

    const type = data.type as string | undefined;
    if (!type) return;

    // Cursor's `tool_call` events carry the invocation and its result on a
    // single nested wrapper key. `started` → tool_use, `completed` → tool_result.
    if (type === "tool_call") {
      const toolCall = asRecord(data.tool_call);
      if (!toolCall) return;
      const unwrapped = unwrapToolCall(toolCall);
      if (!unwrapped) return;
      const callId = typeof data.call_id === "string" ? data.call_id : undefined;

      if (data.subtype === "completed") {
        onOutput({
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_result",
                name: unwrapped.name,
                content: toToolResultContent(unwrapped.detail.result ?? unwrapped.detail),
                ...(callId ? { tool_use_id: callId } : {}),
              },
            ],
          },
        });
        return;
      }

      onOutput({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: unwrapped.name,
              input: asRecord(unwrapped.detail.args) ?? {},
              ...(callId ? { id: callId } : {}),
            },
          ],
        },
      });
      return;
    }

    // Assistant text — cursor mirrors Claude's message.content[] envelope.
    if (type === "assistant") {
      const message = asRecord(data.message);
      const content = message?.content;
      if (!Array.isArray(content)) return;
      const normalized: MessageBlock[] = [];
      for (const block of content as Record<string, unknown>[]) {
        if (block.type === "text" && typeof block.text === "string") {
          normalized.push({ type: "text", text: block.text });
        }
      }
      if (normalized.length > 0) {
        onOutput({ type: "assistant", message: { content: normalized } });
      }
      return;
    }

    if (type === "result") {
      this.resultEmitted = true;
      const isError = data.is_error === true || data.subtype === "error";
      onOutput({ type: "result", subtype: isError ? "error" : "success" });
      return;
    }
  }

  getSessionId(): string | null {
    return this.chatId;
  }

  abort() {
    if (this.process) {
      // Kill the entire process group (negative PID) since we spawn detached
      try {
        process.kill(-this.process.pid!, "SIGTERM");
      } catch {
        /* already dead */
      }
      this.process = null;
    }
  }
}
