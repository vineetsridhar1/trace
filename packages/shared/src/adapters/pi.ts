import { spawn, type ChildProcess } from "child_process";
import { createInterface } from "readline";
import type {
  CodingToolAdapter,
  MessageBlock,
  RunOptions,
  TokenUsage,
  ToolOutput,
  ToolResultBlock,
} from "./coding-tool.js";
import { buildChildProcessEnv } from "./spawn-env.js";

const EXIT_CLOSE_GRACE_MS = 1_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parsePiUsage(raw: unknown): TokenUsage | undefined {
  const usage = asRecord(raw);
  if (!usage) return undefined;

  const normalized: TokenUsage = {
    inputTokens: num(usage.input),
    outputTokens: num(usage.output),
    cacheReadTokens: num(usage.cacheRead),
    cacheCreationTokens: num(usage.cacheWrite),
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

function parsePiCost(raw: unknown): number | undefined {
  const usage = asRecord(raw);
  const cost = asRecord(usage?.cost);
  const total = num(cost?.total);
  return total > 0 ? total : undefined;
}

function textFromContent(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;

  const text = content
    .map((block) => {
      const record = asRecord(block);
      return record?.type === "text" && typeof record.text === "string" ? record.text : "";
    })
    .join("");
  return text || null;
}

function resultContent(result: Record<string, unknown> | null): string | Record<string, unknown> {
  const content = result?.content;
  const text = textFromContent(content);
  if (text != null) return text;
  return result ?? {};
}

/**
 * Adapter for running Pi Coding Agent sessions.
 * Spawns `pi --mode json` and normalizes Pi's JSONL event stream into ToolOutput.
 */
export class PiAdapter implements CodingToolAdapter {
  private process: ChildProcess | null = null;
  private sessionId: string | null = null;
  private resultEmitted = false;
  private processGeneration = 0;
  private sawErrorEvent = false;
  private lastErrorMessage: string | null = null;
  private lastUsage: TokenUsage | undefined;
  private lastCostUsd: number | undefined;
  private emittedIncrementalUsage = false;
  private emittedIncrementalCost = false;

  run({
    prompt,
    cwd,
    onOutput,
    onComplete,
    model,
    reasoningEffort,
    toolSessionId,
  }: RunOptions) {
    this.resultEmitted = false;
    this.sawErrorEvent = false;
    this.lastErrorMessage = null;
    this.lastUsage = undefined;
    this.lastCostUsd = undefined;
    this.emittedIncrementalUsage = false;
    this.emittedIncrementalCost = false;

    if (toolSessionId && !this.sessionId) {
      this.sessionId = toolSessionId;
    }

    const args = ["--mode", "json"];
    if (this.sessionId) {
      args.push("--session", this.sessionId);
    }
    if (model) {
      args.push("--model", model);
    }
    if (reasoningEffort) {
      args.push("--thinking", reasoningEffort);
    }

    const processGeneration = ++this.processGeneration;
    const child = spawn("pi", args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: buildChildProcessEnv(),
      detached: true,
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(prompt);
    this.process = child;

    const isCurrentProcess = () =>
      this.processGeneration === processGeneration && this.process === child;

    let finished = false;
    let exitFallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const stderrChunks: string[] = [];

    const clearExitFallbackTimer = () => {
      if (exitFallbackTimer) {
        clearTimeout(exitFallbackTimer);
        exitFallbackTimer = null;
      }
    };

    const finish = (code: number | null) => {
      if (finished) return;
      if (!isCurrentProcess()) return;
      finished = true;
      clearExitFallbackTimer();

      if (!this.resultEmitted) {
        const exitError = code !== 0 && code !== null;
        const isError = exitError || this.sawErrorEvent;
        if (exitError && stderrChunks.length > 0) {
          onOutput({ type: "error", message: stderrChunks.join("\n") });
        }
        onOutput({ type: "result", subtype: isError ? "error" : "success" });
      }

      onComplete();
      this.process = null;
    };

    if (child.stdout) {
      child.stdout.on("error", () => {});
      const rl = createInterface({ input: child.stdout });
      rl.on("line", (line) => {
        if (!isCurrentProcess()) return;
        if (!line.trim()) return;
        try {
          const parsed = JSON.parse(line);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            this.processEvent(parsed as Record<string, unknown>, onOutput);
          }
        } catch {
          // Pi may print human-readable startup text before JSON mode is active.
        }
      });
    }

    if (child.stderr) {
      child.stderr.on("error", () => {});
      const rl = createInterface({ input: child.stderr });
      rl.on("line", (line) => {
        if (!isCurrentProcess()) return;
        stderrChunks.push(line);
      });
    }

    child.on("exit", (code: number | null) => {
      if (!isCurrentProcess()) return;
      clearExitFallbackTimer();
      exitFallbackTimer = setTimeout(() => finish(code), EXIT_CLOSE_GRACE_MS);
    });

    child.on("close", finish);

    child.on("error", (err: Error & { code?: string }) => {
      if (finished) return;
      clearExitFallbackTimer();
      finished = true;
      if (!isCurrentProcess()) return;
      const message =
        err.code === "ENOENT"
          ? "Pi is not installed or not on PATH. Install it with: npm install -g @earendil-works/pi-coding-agent"
          : err.message;
      onOutput({ type: "error", message });
      onComplete();
      this.process = null;
    });
  }

  private processEvent(data: Record<string, unknown>, onOutput: (event: ToolOutput) => void) {
    const type = data.type as string | undefined;
    if (!type) return;

    if (type === "session" && typeof data.id === "string") {
      this.sessionId = data.id;
      return;
    }

    if (type === "message_end") {
      const message = asRecord(data.message);
      if (message?.role === "assistant") {
        const captured = this.captureUsage(message);
        if (captured.usage) this.emittedIncrementalUsage = true;
        if (captured.costUsd != null) this.emittedIncrementalCost = true;
        const errorMessage = this.extractPiErrorMessage(message) ?? this.extractPiErrorMessage(data);
        if (errorMessage) {
          this.emitError(errorMessage, onOutput);
        }
        const blocks = this.normalizeAssistantBlocks(message.content);
        if (blocks.length > 0) {
          onOutput({
            type: "assistant",
            message: { content: blocks },
            ...(captured.usage ? { usage: captured.usage } : {}),
            ...(captured.costUsd != null ? { costUsd: captured.costUsd } : {}),
          });
        }
      }
      return;
    }

    if (type === "tool_execution_start") {
      const name = typeof data.toolName === "string" ? data.toolName : "tool";
      const args = asRecord(data.args) ?? {};
      const id = typeof data.toolCallId === "string" ? data.toolCallId : undefined;
      onOutput({
        type: "assistant",
        message: { content: [{ type: "tool_use", id, name, input: args }] },
      });
      return;
    }

    if (type === "tool_execution_end") {
      const name = typeof data.toolName === "string" ? data.toolName : "tool";
      const id = typeof data.toolCallId === "string" ? data.toolCallId : undefined;
      const result = asRecord(data.result);
      const block: ToolResultBlock = {
        type: "tool_result",
        tool_use_id: id,
        name,
        content: resultContent(result),
      };
      if (data.isError === true) block.is_error = true;
      onOutput({ type: "assistant", message: { content: [block] } });
      return;
    }

    if (type === "agent_end") {
      const errorMessage = this.extractPiErrorMessage(data);
      if (errorMessage) {
        this.emitError(errorMessage, onOutput);
      }
      this.captureUsage(data);
      this.captureLatestUsageFromMessages(data.messages);
      this.resultEmitted = true;
      onOutput({
        type: "result",
        subtype: this.sawErrorEvent ? "error" : "success",
        ...(!this.emittedIncrementalUsage && this.lastUsage ? { usage: this.lastUsage } : {}),
        ...(!this.emittedIncrementalCost && this.lastCostUsd != null
          ? { costUsd: this.lastCostUsd }
          : {}),
      });
      return;
    }

    if (type === "extension_error") {
      const message =
        typeof data.message === "string"
          ? data.message
          : typeof data.errorMessage === "string"
            ? data.errorMessage
            : "Pi extension error";
      this.emitError(message, onOutput);
    }
  }

  private extractPiErrorMessage(data: Record<string, unknown>): string | null {
    const stopReason = data.stopReason ?? data.stop_reason;
    const errorMessage = data.errorMessage ?? data.error_message;
    if (typeof errorMessage === "string" && errorMessage.trim()) return errorMessage;
    return stopReason === "error" ? "Pi run failed" : null;
  }

  private emitError(message: string, onOutput: (event: ToolOutput) => void) {
    this.sawErrorEvent = true;
    if (this.lastErrorMessage === message) return;
    this.lastErrorMessage = message;
    onOutput({ type: "error", message });
  }

  private captureUsage(data: Record<string, unknown>): {
    usage?: TokenUsage;
    costUsd?: number;
  } {
    const usage = parsePiUsage(data.usage);
    if (usage) this.lastUsage = usage;

    const costUsd = parsePiCost(data.usage);
    if (costUsd != null) this.lastCostUsd = costUsd;

    return {
      ...(usage ? { usage } : {}),
      ...(costUsd != null ? { costUsd } : {}),
    };
  }

  private captureLatestUsageFromMessages(messages: unknown) {
    if (!Array.isArray(messages)) return;
    for (const item of messages) {
      const message = asRecord(item);
      if (message?.role === "assistant") {
        this.captureUsage(message);
      }
    }
  }

  private normalizeAssistantBlocks(content: unknown): MessageBlock[] {
    if (!Array.isArray(content)) return [];

    const blocks: MessageBlock[] = [];
    for (const item of content) {
      const block = asRecord(item);
      if (!block) continue;
      if (block.type === "text" && typeof block.text === "string" && block.text) {
        blocks.push({ type: "text", text: block.text });
      }
    }
    return blocks;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  abort() {
    if (this.process) {
      try {
        process.kill(-this.process.pid!, "SIGTERM");
      } catch {
        /* already dead */
      }
      this.process = null;
    }
  }
}
