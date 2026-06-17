import { spawn, type ChildProcess } from "child_process";
import { createInterface } from "readline";
import type { CodingToolAdapter, RunOptions, ToolOutput, TokenUsage } from "./coding-tool.js";
import { buildChildProcessEnv } from "./spawn-env.js";

const EXIT_CLOSE_GRACE_MS = 1_000;

interface ModelPricing {
  input: number;
  output: number;
}

// Cached input tokens bill at 1/10 the standard input rate.
const CACHED_INPUT_DISCOUNT = 0.1;

// USD per 1M tokens. Source: https://developers.openai.com/api/docs/pricing
// (standard tier), verified 2026-06-10. Update when OpenAI changes prices —
// this is a fallback only and is ignored when Codex reports a cost directly.
const OPENAI_STANDARD_PRICES_PER_MILLION: Record<string, ModelPricing> = {
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-5.5": { input: 5, output: 30 },
  "gpt-5.4": { input: 2.5, output: 15 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25 },
  "gpt-5.3-codex": { input: 1.75, output: 14 },
};

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

function parseCodexUsage(data: Record<string, unknown>): TokenUsage | undefined {
  const usage = asRecord(data.usage) ?? data;
  const inputDetails = asRecord(usage.input_token_details);
  const usageDetails = asRecord(usage.token_details);

  const rawInputTokens = num(usage.input_tokens, usage.prompt_tokens, usage.inputTokens);
  const cacheReadTokens = num(
    usage.cached_input_tokens,
    usage.cache_read_input_tokens,
    usage.cacheReadTokens,
    inputDetails?.cached_tokens,
    inputDetails?.cache_read_tokens,
    usageDetails?.cached_input_tokens,
  );

  // OpenAI bundles cached tokens into the reported input/prompt count, so subtract
  // them to get fresh (full-rate) input and avoid billing cached tokens twice.
  const normalized: TokenUsage = {
    inputTokens: Math.max(0, rawInputTokens - cacheReadTokens),
    outputTokens: num(usage.output_tokens, usage.completion_tokens, usage.outputTokens),
    cacheReadTokens,
    cacheCreationTokens: num(
      usage.cache_creation_input_tokens,
      usage.cacheCreationTokens,
      inputDetails?.cache_creation_tokens,
      inputDetails?.cache_write_tokens,
      usageDetails?.cache_creation_input_tokens,
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

function parseCodexTokenCountUsage(data: Record<string, unknown>): TokenUsage | undefined {
  const payload = asRecord(data.payload);
  if (payload?.type !== "token_count") return undefined;

  const info = asRecord(payload.info);
  const lastTokenUsage = asRecord(info?.last_token_usage);
  if (!lastTokenUsage) return undefined;

  const inputTokens = num(lastTokenUsage.input_tokens);
  const cacheReadTokens = num(lastTokenUsage.cached_input_tokens);
  const usage: TokenUsage = {
    inputTokens: Math.max(0, inputTokens - cacheReadTokens),
    outputTokens: num(lastTokenUsage.output_tokens),
    cacheReadTokens,
    cacheCreationTokens: 0,
  };

  if (
    usage.inputTokens === 0 &&
    usage.outputTokens === 0 &&
    usage.cacheReadTokens === 0 &&
    usage.cacheCreationTokens === 0
  ) {
    return undefined;
  }

  return usage;
}

function normalizeOpenAIModel(model: string | undefined): string | undefined {
  if (!model) return undefined;
  if (!model.includes("/")) return model;
  const parts = model.split("/");
  return parts[parts.length - 1];
}

function estimateCodexCost(usage: TokenUsage | undefined, model: string | undefined) {
  if (!usage) return undefined;
  const pricing = OPENAI_STANDARD_PRICES_PER_MILLION[normalizeOpenAIModel(model) ?? ""];
  if (!pricing) return undefined;

  // OpenAI has no separate cache-write SKU, so cache-creation tokens bill at the
  // standard input rate alongside fresh input.
  const freshInputTokens = usage.inputTokens + usage.cacheCreationTokens;
  const costUsd =
    (freshInputTokens * pricing.input +
      usage.cacheReadTokens * pricing.input * CACHED_INPUT_DISCOUNT +
      usage.outputTokens * pricing.output) /
    1_000_000;

  return costUsd > 0 ? costUsd : undefined;
}

function parseCodexCost(
  data: Record<string, unknown>,
  usage: TokenUsage | undefined,
  model: string | undefined,
): number | undefined {
  const rawUsage = asRecord(data.usage);
  const reportedCostUsd = num(
    data.cost_usd,
    data.costUsd,
    data.total_cost_usd,
    rawUsage?.cost_usd,
    rawUsage?.costUsd,
  );
  if (reportedCostUsd > 0) return reportedCostUsd;
  return estimateCodexCost(usage, model);
}

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
  private processGeneration = 0;
  private sawErrorEvent = false;
  private lastErrorMessage: string | null = null;
  private model: string | undefined;
  private emittedIncrementalUsage = false;

  run({
    prompt,
    cwd,
    onOutput,
    onComplete,
    model,
    reasoningEffort,
    toolSessionId,
    interactionMode,
  }: RunOptions) {
    this.cwd = cwd;
    this.resultEmitted = false;
    this.interactionMode = interactionMode;
    this.lastTextContent = null;
    this.sawErrorEvent = false;
    this.lastErrorMessage = null;
    this.model = model;
    this.emittedIncrementalUsage = false;

    if (toolSessionId && !this.threadId) {
      this.threadId = toolSessionId;
    }

    const args = this.threadId
      ? ["exec", "resume", "--json", "--dangerously-bypass-approvals-and-sandbox"]
      : ["exec", "--json", "--dangerously-bypass-approvals-and-sandbox"];
    if (model) {
      args.push("--model", model);
    }
    if (reasoningEffort) {
      args.push("--config", `model_reasoning_effort="${reasoningEffort}"`);
    }
    if (this.threadId) {
      args.push(this.threadId);
    }
    args.push("-");

    const processGeneration = ++this.processGeneration;
    const child = spawn("codex", args, {
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
    if (child.stderr) {
      child.stderr.on("error", () => {});
      const rl = createInterface({ input: child.stderr });
      rl.on("line", (line) => {
        if (!isCurrentProcess()) return;
        stderrChunks.push(line);
      });
    }

    const finish = (code: number | null) => {
      if (finished) return;
      if (!isCurrentProcess()) return;
      finished = true;
      clearExitFallbackTimer();
      // If in plan mode and exited cleanly with text, wrap as PlanBlock.
      // Codex doesn't write plan files to disk, so filePath is omitted.
      if (
        this.interactionMode === "plan" &&
        (code === 0 || code === null) &&
        this.lastTextContent
      ) {
        onOutput({
          type: "assistant",
          message: { content: [{ type: "plan", content: this.lastTextContent }] },
        });
      }
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

  private processEvent(data: Record<string, unknown>, onOutput: (event: ToolOutput) => void) {
    const eventType = data.type as string | undefined;
    if (!eventType) return;

    if (eventType === "thread.started" && typeof data.thread_id === "string") {
      this.threadId = data.thread_id;
      return;
    }

    if (eventType === "event_msg") {
      const usage = parseCodexTokenCountUsage(data);
      const costUsd = estimateCodexCost(usage, this.model);
      if (usage) {
        this.emittedIncrementalUsage = true;
        onOutput({
          type: "usage",
          usage,
          ...(costUsd != null ? { costUsd } : {}),
        });
      }
      return;
    }

    // Codex surfaces fatal run errors (e.g. usage limits, auth failures) as
    // top-level `error` and `turn.failed` events with no `item`. Emit these
    // as ErrorEvents so the UI renders the message instead of a bare "Run ended".
    if (eventType === "error") {
      const message = typeof data.message === "string" ? data.message : "Codex error";
      onOutput({ type: "error", message });
      this.sawErrorEvent = true;
      this.lastErrorMessage = message;
      return;
    }

    if (eventType === "turn.failed") {
      const error = data.error as Record<string, unknown> | undefined;
      const message = typeof error?.message === "string" ? error.message : "Turn failed";
      if (this.lastErrorMessage !== message) {
        onOutput({ type: "error", message });
        this.lastErrorMessage = message;
      }
      this.sawErrorEvent = true;
      return;
    }

    if (eventType === "turn.completed") {
      this.resultEmitted = true;
      // token_count events already streamed this turn's usage and estimated cost
      // incrementally, so the completion event must not re-add either or it
      // double-counts. Only contribute usage/cost here when nothing streamed.
      if (this.emittedIncrementalUsage) {
        onOutput({ type: "result", subtype: this.sawErrorEvent ? "error" : "success" });
        return;
      }
      const usage = parseCodexUsage(data);
      const costUsd = parseCodexCost(data, usage, this.model);
      onOutput({
        type: "result",
        subtype: this.sawErrorEvent ? "error" : "success",
        ...(usage ? { usage } : {}),
        ...(costUsd != null ? { costUsd } : {}),
      });
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
      try {
        process.kill(-this.process.pid!, "SIGTERM");
      } catch {
        /* already dead */
      }
      this.process = null;
    }
  }
}
