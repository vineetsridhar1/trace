import { spawn, type ChildProcess } from "child_process";
import { createInterface } from "readline";
import type {
  CodingToolAdapter,
  OutputDeltaCallback,
  RunOptions,
  ToolOutput,
} from "./coding-tool.js";

type JsonRpcMessage = {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
};

const CODEX_APP_SERVER_REQUEST_TIMEOUT_MS = 30_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(
  value: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const field = value?.[key];
  return typeof field === "string" ? field : null;
}

/**
 * Adapter for running OpenAI Codex CLI sessions through the experimental
 * app-server protocol. `codex exec --json` only emits completed assistant
 * messages; app-server emits `item/agentMessage/delta` notifications while
 * preserving completed item events for durable history.
 */
export class CodexAdapter implements CodingToolAdapter {
  private process: ChildProcess | null = null;
  private threadId: string | null = null;
  private resultEmitted = false;
  private interactionMode: "code" | "plan" | "ask" | undefined;
  private lastTextContent: string | null = null;
  private processGeneration = 0;
  private nextRequestId = 1;
  private pendingInitializeRequestId: number | null = null;
  private pendingRunRequestId: number | null = null;
  private pendingTurnRequestId: number | null = null;
  private requestTimeout: ReturnType<typeof setTimeout> | null = null;
  private stderrChunks: string[] = [];

  run({
    prompt,
    cwd,
    onOutput,
    onOutputDelta,
    onComplete,
    model,
    reasoningEffort,
    toolSessionId,
    interactionMode,
  }: RunOptions) {
    this.resultEmitted = false;
    this.interactionMode = interactionMode;
    this.lastTextContent = null;
    this.stderrChunks = [];
    this.nextRequestId = 1;
    this.pendingInitializeRequestId = null;
    this.pendingRunRequestId = null;
    this.pendingTurnRequestId = null;

    if (toolSessionId && !this.threadId) {
      this.threadId = toolSessionId;
    }

    const processGeneration = ++this.processGeneration;
    const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
      detached: true,
    });
    this.process = child;

    const isCurrentProcess = () =>
      this.processGeneration === processGeneration && this.process === child;

    const complete = () => {
      if (!isCurrentProcess()) return;
      onComplete();
      this.shutdownProcess(child);
    };

    const fail = (message: string) => {
      if (!isCurrentProcess()) return;
      if (message.trim()) {
        onOutput({ type: "error", message });
      }
      this.emitResult(onOutput, "error");
      complete();
    };

    const startRequestTimeout = (description: string) => {
      this.clearRequestTimeout();
      this.requestTimeout = setTimeout(() => {
        if (!isCurrentProcess()) return;
        fail(`Codex app-server timed out waiting for ${description}`);
      }, CODEX_APP_SERVER_REQUEST_TIMEOUT_MS);
    };

    child.stdout?.on("error", () => {});
    child.stderr?.on("error", () => {});
    child.stdin?.on("error", () => {});

    if (child.stdout) {
      const rl = createInterface({ input: child.stdout });
      rl.on("line", (line) => {
        if (!isCurrentProcess() || !line.trim()) return;
        try {
          const parsed = JSON.parse(line) as JsonRpcMessage;
          this.processMessage({
            data: parsed,
            prompt,
            cwd,
            model,
            reasoningEffort,
            onOutput,
            onOutputDelta,
            startRequestTimeout,
            complete,
            fail,
          });
        } catch {
          // app-server stdout is JSON-RPC; ignore malformed lines defensively.
        }
      });
    }

    if (child.stderr) {
      const rl = createInterface({ input: child.stderr });
      rl.on("line", (line) => {
        if (isCurrentProcess()) this.stderrChunks.push(line);
      });
    }

    child.on("close", (code: number | null) => {
      if (!isCurrentProcess()) return;
      this.clearRequestTimeout();
      if (!this.resultEmitted) {
        if (code !== 0 && code !== null && this.stderrChunks.length > 0) {
          onOutput({ type: "error", message: this.stderrChunks.join("\n") });
        }
        this.emitResult(onOutput, code === 0 || code === null ? "success" : "error");
        onComplete();
      }
      this.process = null;
    });

    child.on("error", (err: Error) => {
      if (!isCurrentProcess()) return;
      this.clearRequestTimeout();
      onOutput({ type: "error", message: err.message });
      this.emitResult(onOutput, "error");
      onComplete();
      this.process = null;
    });

    this.pendingInitializeRequestId = this.sendRequest("initialize", {
      clientInfo: { name: "trace", title: "Trace", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    startRequestTimeout("initialize");
    this.sendNotification("initialized");
  }

  private processMessage({
    data,
    prompt,
    cwd,
    model,
    reasoningEffort,
    onOutput,
    onOutputDelta,
    startRequestTimeout,
    complete,
    fail,
  }: {
    data: JsonRpcMessage;
    prompt: string;
    cwd: string;
    model?: string;
    reasoningEffort?: string;
    onOutput: (event: ToolOutput) => void;
    onOutputDelta: OutputDeltaCallback | undefined;
    startRequestTimeout: (description: string) => void;
    complete: () => void;
    fail: (message: string) => void;
  }) {
    if (data.error) {
      fail(data.error.message ?? "Codex app-server error");
      return;
    }

    if (data.id === this.pendingInitializeRequestId) {
      this.clearRequestTimeout();
      this.pendingInitializeRequestId = null;
      const runRequestDescription = this.threadId ? "thread resume" : "thread start";
      this.pendingRunRequestId = this.threadId
        ? this.sendRequest("thread/resume", {
            threadId: this.threadId,
            model: model ?? null,
            modelProvider: null,
            serviceTier: null,
            cwd,
            approvalPolicy: "never",
            approvalsReviewer: null,
            sandbox: "danger-full-access",
            permissionProfile: null,
            config: null,
            baseInstructions: null,
            developerInstructions: null,
            personality: null,
            excludeTurns: true,
            persistExtendedHistory: false,
          })
        : this.sendRequest("thread/start", {
            model: model ?? null,
            modelProvider: null,
            serviceTier: null,
            cwd,
            approvalPolicy: "never",
            approvalsReviewer: null,
            sandbox: "danger-full-access",
            permissionProfile: null,
            config: null,
            serviceName: null,
            baseInstructions: null,
            developerInstructions: null,
            personality: null,
            ephemeral: false,
            experimentalRawEvents: false,
            persistExtendedHistory: false,
          });
      startRequestTimeout(runRequestDescription);
      return;
    }

    if (data.id === this.pendingRunRequestId) {
      this.clearRequestTimeout();
      const result = asRecord(data.result);
      const thread = asRecord(result?.thread);
      const threadId = stringField(thread, "id") ?? stringField(result, "threadId");
      if (!threadId) {
        fail("Codex did not return a thread id");
        return;
      }
      this.threadId = threadId;
      this.pendingRunRequestId = null;
      this.pendingTurnRequestId = this.sendRequest("turn/start", {
        threadId,
        input: [{ type: "text", text: prompt, text_elements: [] }],
        cwd,
        approvalPolicy: "never",
        approvalsReviewer: null,
        sandboxPolicy: { type: "dangerFullAccess" },
        permissionProfile: null,
        model: model ?? null,
        serviceTier: null,
        effort: reasoningEffort ?? null,
        summary: null,
        personality: null,
        outputSchema: null,
        collaborationMode: null,
      });
      startRequestTimeout("turn start");
      return;
    }

    if (data.id === this.pendingTurnRequestId) {
      this.clearRequestTimeout();
      this.pendingTurnRequestId = null;
      return;
    }

    if (!data.method) return;
    this.processNotification(data.method, data.params, onOutput, onOutputDelta, complete, fail);
  }

  private processNotification(
    method: string,
    paramsValue: unknown,
    onOutput: (event: ToolOutput) => void,
    onOutputDelta: OutputDeltaCallback | undefined,
    complete: () => void,
    fail: (message: string) => void,
  ) {
    const params = asRecord(paramsValue);
    if (!params) return;

    if (method === "error") {
      const error = asRecord(params.error);
      fail(stringField(error, "message") ?? "Codex app-server error");
      return;
    }

    if (method === "item/agentMessage/delta") {
      const delta = stringField(params, "delta");
      if (delta) onOutputDelta?.({ type: "assistant_text_delta", text: delta });
      return;
    }

    if (method === "item/started") {
      const item = asRecord(params.item);
      if (item?.type === "commandExecution") {
        const command = stringField(item, "command");
        if (command) {
          onOutput({
            type: "assistant",
            message: { content: [{ type: "tool_use", name: "command", input: { command } }] },
          });
        }
      }
      return;
    }

    if (method === "item/completed") {
      this.processCompletedItem(asRecord(params.item), onOutput);
      return;
    }

    if (method === "turn/completed") {
      if (this.interactionMode === "plan" && this.lastTextContent) {
        onOutput({
          type: "assistant",
          message: { content: [{ type: "plan", content: this.lastTextContent }] },
        });
      }
      const turn = asRecord(params.turn);
      const status = stringField(turn, "status");
      const isError = status === "failed" || status === "cancelled";
      const error = asRecord(turn?.error);
      const message = stringField(error, "message");
      if (message) onOutput({ type: "error", message });
      this.emitResult(onOutput, isError ? "error" : "success");
      complete();
    }
  }

  private processCompletedItem(
    item: Record<string, unknown> | null,
    onOutput: (event: ToolOutput) => void,
  ) {
    if (!item) return;

    if (item.type === "commandExecution") {
      const command = stringField(item, "command");
      const output = stringField(item, "aggregatedOutput") ?? "";
      const exitCode = typeof item.exitCode === "number" ? item.exitCode : undefined;
      const content: Record<string, unknown> = { output };
      if (command) content.command = command;
      if (exitCode != null) content.exitCode = exitCode;
      onOutput({
        type: "assistant",
        message: { content: [{ type: "tool_result", name: "command", content }] },
      });
      return;
    }

    if (item.type === "agentMessage") {
      const text = stringField(item, "text");
      if (text) {
        this.lastTextContent = text;
        onOutput({
          type: "assistant",
          message: { content: [{ type: "text", text }] },
        });
      }
      return;
    }

    if (item.type === "plan") {
      const text = stringField(item, "text");
      if (text) {
        onOutput({
          type: "assistant",
          message: { content: [{ type: "plan", content: text }] },
        });
      }
    }
  }

  private sendRequest(method: string, params: Record<string, unknown>): number {
    const id = this.nextRequestId++;
    this.writeJson({ method, id, params });
    return id;
  }

  private sendNotification(method: string, params?: Record<string, unknown>): void {
    this.writeJson(params ? { method, params } : { method });
  }

  private writeJson(value: Record<string, unknown>): void {
    this.process?.stdin?.write(`${JSON.stringify(value)}\n`);
  }

  private emitResult(onOutput: (event: ToolOutput) => void, subtype: "success" | "error") {
    if (this.resultEmitted) return;
    this.resultEmitted = true;
    onOutput({ type: "result", subtype });
  }

  getSessionId(): string | null {
    return this.threadId;
  }

  abort() {
    if (this.process) {
      this.shutdownProcess(this.process);
    }
  }

  private shutdownProcess(child: ChildProcess): void {
    this.clearRequestTimeout();
    try {
      process.kill(-child.pid!, "SIGTERM");
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        /* already stopped */
      }
    }
    if (this.process === child) this.process = null;
  }

  private clearRequestTimeout(): void {
    if (!this.requestTimeout) return;
    clearTimeout(this.requestTimeout);
    this.requestTimeout = null;
  }
}
