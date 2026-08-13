import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import type { CodingToolAdapter, RunOptions, ToolOutput, TokenUsage } from "./coding-tool.js";
import { buildChildProcessEnv } from "./spawn-env.js";

const EXIT_CLOSE_GRACE_MS = 1_000;

type JsonObject = Record<string, unknown>;

interface PendingRequest {
  resolve: (value: JsonObject) => void;
  reject: (error: Error) => void;
}

interface ActiveRun {
  rootThreadId: string;
  rootTurnId?: string;
  onOutput: (event: ToolOutput) => void;
  onComplete: () => void;
  finished: boolean;
}

interface ChildThread {
  threadId: string;
  parentToolUseId?: string;
  toolUseId: string;
  description: string;
  role: string;
  lastMessage?: string;
  completed: boolean;
}

function asRecord(value: unknown): JsonObject | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function threadIdFrom(params: JsonObject): string | undefined {
  return str(params.threadId) ?? str(asRecord(params.thread)?.id);
}

function usageFromNotification(params: JsonObject): TokenUsage | undefined {
  const last = asRecord(asRecord(params.tokenUsage)?.last);
  if (!last) return undefined;

  const inputTokens = num(last.inputTokens);
  const cacheReadTokens = num(last.cachedInputTokens);
  const usage: TokenUsage = {
    inputTokens: Math.max(0, inputTokens - cacheReadTokens),
    outputTokens: num(last.outputTokens),
    cacheReadTokens,
    cacheCreationTokens: num(last.cacheWriteInputTokens),
  };

  return Object.values(usage).some((value) => value > 0) ? usage : undefined;
}

function errorMessage(value: unknown, fallback: string): string {
  const record = asRecord(value);
  return str(record?.message) ?? fallback;
}

/**
 * Adapter for the Codex app-server JSON-RPC protocol.
 *
 * A Trace session maps to one root Codex thread. AgentControl-spawned child
 * threads are normalized into an `agent` tool call plus nested events whose
 * `parentToolUseId` points at that call, matching Trace's existing subagent UI.
 */
export class CodexAdapter implements CodingToolAdapter {
  private process: ChildProcess | null = null;
  private threadId: string | null = null;
  private activeRun: ActiveRun | null = null;
  private processGeneration = 0;
  private requestSequence = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private children = new Map<string, ChildThread>();
  private announcedChildren = new Set<string>();
  private emittedUsage = new Set<string>();
  private stderrChunks: string[] = [];
  private exitFallbackTimer: ReturnType<typeof setTimeout> | null = null;

  run(options: RunOptions): void {
    const generation = ++this.processGeneration;
    this.threadId = options.toolSessionId ?? this.threadId;
    this.children.clear();
    this.announcedChildren.clear();
    this.emittedUsage.clear();
    this.stderrChunks = [];

    const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: buildChildProcessEnv({ ...process.env, ...options.runtimeEnv }),
    });
    this.process = child;

    const rootThreadId = this.threadId ?? "";
    this.activeRun = {
      rootThreadId,
      onOutput: options.onOutput,
      onComplete: options.onComplete,
      finished: false,
    };

    child.stdin?.on("error", () => {});
    child.stdout?.on("error", () => {});
    child.stderr?.on("error", () => {});

    if (child.stdout) {
      const lines = createInterface({ input: child.stdout });
      lines.on("line", (line) => this.processLine(line, generation));
    }
    if (child.stderr) {
      const lines = createInterface({ input: child.stderr });
      lines.on("line", (line) => {
        if (generation === this.processGeneration) this.stderrChunks.push(line);
      });
    }

    child.on("exit", (code: number | null) => {
      if (!this.isCurrent(generation, child)) return;
      this.clearExitFallback();
      this.exitFallbackTimer = setTimeout(
        () => this.finishFromProcessExit(code, generation, child),
        EXIT_CLOSE_GRACE_MS,
      );
    });
    child.on("close", (code: number | null) => this.finishFromProcessExit(code, generation, child));
    child.on("error", (error: Error) => {
      if (!this.isCurrent(generation, child)) return;
      this.failRun(error.message);
      this.rejectPending(error);
      this.process = null;
    });

    void this.initializeAndRun(options, generation).catch((error: unknown) => {
      if (generation !== this.processGeneration) return;
      this.failRun(error instanceof Error ? error.message : String(error));
      this.stopProcess(child);
    });
  }

  private async initializeAndRun(options: RunOptions, generation: number): Promise<void> {
    await this.request("initialize", {
      clientInfo: { name: "trace", title: "Trace", version: "2" },
      capabilities: { experimentalApi: true },
    });
    this.notify("initialized", {});

    let rootThreadId = this.threadId;
    if (rootThreadId) {
      const response = await this.request("thread/resume", {
        threadId: rootThreadId,
        model: options.model ?? null,
        cwd: options.cwd,
        approvalPolicy: "never",
        sandbox: "danger-full-access",
      });
      rootThreadId = str(asRecord(response.thread)?.id) ?? rootThreadId;
    } else {
      const config: JsonObject = {};
      if (options.reasoningEffort) config.model_reasoning_effort = options.reasoningEffort;
      const response = await this.request("thread/start", {
        model: options.model ?? null,
        cwd: options.cwd,
        approvalPolicy: "never",
        sandbox: "danger-full-access",
        config,
      });
      rootThreadId = str(asRecord(response.thread)?.id) ?? null;
    }

    if (!rootThreadId) throw new Error("Codex app-server did not return a thread ID");
    if (generation !== this.processGeneration) return;

    this.threadId = rootThreadId;
    if (this.activeRun) this.activeRun.rootThreadId = rootThreadId;

    const response = await this.request("turn/start", {
      threadId: rootThreadId,
      input: [{ type: "text", text: options.prompt, text_elements: [] }],
      cwd: options.cwd,
      model: options.model ?? null,
      effort: options.reasoningEffort ?? null,
      approvalPolicy: "never",
      sandboxPolicy: { type: "dangerFullAccess" },
    });
    const turnId = str(asRecord(response.turn)?.id);
    if (this.activeRun && generation === this.processGeneration) {
      this.activeRun.rootTurnId = turnId;
    }
  }

  private processLine(line: string, generation: number): void {
    if (generation !== this.processGeneration || !line.trim()) return;

    let message: JsonObject;
    try {
      message = JSON.parse(line) as JsonObject;
    } catch {
      return;
    }

    const numericId = typeof message.id === "number" ? message.id : undefined;
    const requestId =
      typeof message.id === "number" || typeof message.id === "string" ? message.id : undefined;
    if (numericId != null && ("result" in message || "error" in message)) {
      const pending = this.pendingRequests.get(numericId);
      if (!pending) return;
      this.pendingRequests.delete(numericId);
      if (message.error) {
        pending.reject(new Error(errorMessage(message.error, "Codex app-server request failed")));
      } else {
        pending.resolve(asRecord(message.result) ?? {});
      }
      return;
    }

    const method = str(message.method);
    const params = asRecord(message.params) ?? {};
    if (!method) return;

    // With approvalPolicy=never these should be exceptional. Always answer
    // server requests so a protocol addition cannot deadlock the run.
    if (requestId != null) {
      this.respondToServerRequest(requestId, method, params);
      return;
    }

    this.processNotification(method, params);
  }

  private processNotification(method: string, params: JsonObject): void {
    const run = this.activeRun;
    if (!run || run.finished) return;

    if (method === "thread/started") {
      this.handleThreadStarted(asRecord(params.thread));
      return;
    }

    if (method === "item/started" || method === "item/completed") {
      const item = asRecord(params.item);
      const eventThreadId = threadIdFrom(params);
      if (item && eventThreadId) {
        this.handleItem(method === "item/completed", eventThreadId, item);
      }
      return;
    }

    if (method === "thread/tokenUsage/updated") {
      const eventThreadId = threadIdFrom(params);
      const turnId = str(params.turnId) ?? "";
      const usage = usageFromNotification(params);
      if (!eventThreadId || !usage) return;
      const key = `${eventThreadId}:${turnId}:${JSON.stringify(usage)}`;
      if (this.emittedUsage.has(key)) return;
      this.emittedUsage.add(key);
      run.onOutput({ type: "usage", usage });
      return;
    }

    if (method === "turn/completed") {
      const eventThreadId = threadIdFrom(params);
      const turn = asRecord(params.turn);
      if (!eventThreadId || !turn) return;
      const status = str(turn.status);
      const message = errorMessage(turn.error, "Codex turn failed");

      if (eventThreadId === run.rootThreadId) {
        if (run.rootTurnId && str(turn.id) !== run.rootTurnId) return;
        if (status === "failed") {
          run.onOutput({ type: "error", message });
        }
        this.finishRun(status === "failed" ? "error" : "success");
      } else {
        const child = this.children.get(eventThreadId);
        if (child) this.completeChild(child, status === "failed" ? message : undefined);
      }
      return;
    }

    if (method === "error" || method === "warning") {
      const message = str(params.message);
      if (method === "error" && message) {
        run.onOutput({ type: "error", message });
      }
    }
  }

  private handleThreadStarted(thread: JsonObject | undefined): void {
    const run = this.activeRun;
    const threadId = str(thread?.id);
    const parentThreadId = str(thread?.parentThreadId);
    if (!run || !threadId || !parentThreadId) return;

    const description = str(thread?.preview) || str(thread?.agentNickname) || "Codex subagent";
    const role = str(thread?.agentRole) || str(thread?.agentNickname) || "agent";
    this.ensureChild(threadId, parentThreadId, description, role);
  }

  private ensureChild(
    threadId: string,
    parentThreadId: string,
    description: string,
    role: string,
  ): ChildThread {
    const existing = this.children.get(threadId);
    if (existing) return existing;

    const child: ChildThread = {
      threadId,
      parentToolUseId: this.children.get(parentThreadId)?.toolUseId,
      toolUseId: `codex-subagent:${threadId}`,
      description,
      role,
      completed: false,
    };
    this.children.set(threadId, child);
    this.announceChild(child);
    return child;
  }

  private announceChild(child: ChildThread): void {
    const run = this.activeRun;
    if (!run || this.announcedChildren.has(child.threadId)) return;
    this.announcedChildren.add(child.threadId);
    run.onOutput({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            id: child.toolUseId,
            name: "agent",
            input: {
              description: child.description,
              prompt: child.description,
              subagent_type: child.role,
              thread_id: child.threadId,
            },
          },
        ],
      },
      ...(child.parentToolUseId ? { parentToolUseId: child.parentToolUseId } : {}),
    });
  }

  private handleItem(completed: boolean, eventThreadId: string, item: JsonObject): void {
    const run = this.activeRun;
    if (!run) return;
    const itemType = str(item.type);
    const itemId = str(item.id);
    const child = this.children.get(eventThreadId);
    const parentToolUseId = child?.toolUseId;

    if (itemType === "collabAgentToolCall") {
      const tool = str(item.tool);
      const receivers = Array.isArray(item.receiverThreadIds)
        ? item.receiverThreadIds.filter((value): value is string => typeof value === "string")
        : [];
      if (tool === "spawnAgent") {
        for (const receiver of receivers) {
          this.ensureChild(receiver, eventThreadId, str(item.prompt) || "Codex subagent", "agent");
        }
      }
      return;
    }

    if (itemType === "subAgentActivity") {
      const childThreadId = str(item.agentThreadId);
      if (childThreadId && str(item.kind) === "started") {
        this.ensureChild(
          childThreadId,
          eventThreadId,
          str(item.agentPath) || "Codex subagent",
          str(item.agentPath) || "agent",
        );
      }
      return;
    }

    if (!itemId) return;

    if (!completed && itemType === "commandExecution") {
      run.onOutput({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: itemId,
              name: "command",
              input: { command: str(item.command) ?? "" },
            },
          ],
        },
        ...(parentToolUseId ? { parentToolUseId } : {}),
      });
      return;
    }

    if (completed && itemType === "commandExecution") {
      run.onOutput({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: itemId,
              name: "command",
              content: {
                command: str(item.command) ?? "",
                output: str(item.aggregatedOutput) ?? "",
                ...(typeof item.exitCode === "number" ? { exitCode: item.exitCode } : {}),
              },
              is_error: str(item.status) === "failed",
            },
          ],
        },
        ...(parentToolUseId ? { parentToolUseId } : {}),
      });
      return;
    }

    if (completed && itemType === "agentMessage") {
      const text = str(item.text);
      if (!text) return;
      if (child) child.lastMessage = text;
      run.onOutput({
        type: "assistant",
        message: { content: [{ type: "text", text }] },
        ...(parentToolUseId ? { parentToolUseId } : {}),
      });
      return;
    }

    if (completed && itemType === "plan") {
      const content = str(item.text);
      if (!content) return;
      run.onOutput({
        type: "assistant",
        message: { content: [{ type: "plan", content }] },
        ...(parentToolUseId ? { parentToolUseId } : {}),
      });
      return;
    }

    if (itemType === "fileChange") {
      const changes = Array.isArray(item.changes) ? item.changes : [];
      if (!completed) {
        run.onOutput({
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: itemId,
                name: "file_change",
                input: { changes },
              },
            ],
          },
          ...(parentToolUseId ? { parentToolUseId } : {}),
        });
      } else {
        run.onOutput({
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_result",
                tool_use_id: itemId,
                name: "file_change",
                content: { changes, status: str(item.status) ?? "completed" },
                is_error: str(item.status) === "failed",
              },
            ],
          },
          ...(parentToolUseId ? { parentToolUseId } : {}),
        });
      }
      return;
    }

    if (itemType === "mcpToolCall" || itemType === "dynamicToolCall") {
      const name =
        itemType === "mcpToolCall"
          ? `${str(item.server) ?? "mcp"}.${str(item.tool) ?? "tool"}`
          : (str(item.tool) ?? "tool");
      if (!completed) {
        run.onOutput({
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: itemId,
                name,
                input: asRecord(item.arguments) ?? {},
              },
            ],
          },
          ...(parentToolUseId ? { parentToolUseId } : {}),
        });
      } else {
        run.onOutput({
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_result",
                tool_use_id: itemId,
                name,
                content: asRecord(item.result) ?? asRecord(item.error) ?? {},
                is_error: item.error != null || str(item.status) === "failed",
              },
            ],
          },
          ...(parentToolUseId ? { parentToolUseId } : {}),
        });
      }
    }
  }

  private completeChild(child: ChildThread, failure?: string): void {
    const run = this.activeRun;
    if (!run || child.completed) return;
    child.completed = true;
    run.onOutput({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: child.toolUseId,
            name: "agent",
            content: failure ?? child.lastMessage ?? "Subagent completed",
            ...(failure ? { is_error: true } : {}),
          },
        ],
      },
      ...(child.parentToolUseId ? { parentToolUseId: child.parentToolUseId } : {}),
    });
  }

  private finishRun(subtype: "success" | "error"): void {
    const run = this.activeRun;
    if (!run || run.finished) return;
    for (const child of this.children.values()) {
      if (!child.completed) this.completeChild(child);
    }
    run.finished = true;
    run.onOutput({ type: "result", subtype });
    run.onComplete();
  }

  private failRun(message: string): void {
    const run = this.activeRun;
    if (!run || run.finished) return;
    run.onOutput({ type: "error", message });
    this.finishRun("error");
  }

  private request(method: string, params: JsonObject): Promise<JsonObject> {
    const id = ++this.requestSequence;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      if (!this.write({ id, method, params })) {
        this.pendingRequests.delete(id);
        reject(new Error("Codex app-server stdin is unavailable"));
      }
    });
  }

  private notify(method: string, params: JsonObject): void {
    this.write({ method, params });
  }

  private write(message: JsonObject): boolean {
    const stdin = this.process?.stdin;
    if (!stdin || stdin.destroyed || !stdin.writable) return false;
    return stdin.write(`${JSON.stringify(message)}\n`);
  }

  private respondToServerRequest(id: number | string, method: string, params: JsonObject): void {
    if (method === "item/tool/requestUserInput" && params.isBlocking !== false) {
      const questions = Array.isArray(params.questions)
        ? params.questions.flatMap((value) => {
            const question = asRecord(value);
            const questionText = str(question?.question);
            if (!questionText) return [];
            const options = Array.isArray(question?.options)
              ? question.options.flatMap((optionValue) => {
                  const option = asRecord(optionValue);
                  const label = str(option?.label);
                  return label
                    ? [
                        {
                          id: label,
                          label,
                          description: str(option?.description) ?? "",
                        },
                      ]
                    : [];
                })
              : [];
            const allowsOther = question?.isOther === true;
            return [
              {
                id: str(question?.id),
                type:
                  options.length === 0
                    ? ("text" as const)
                    : allowsOther
                      ? ("select-with-other" as const)
                      : ("single-select" as const),
                protocol: "native" as const,
                question: questionText,
                header: str(question?.header) ?? questionText,
                options,
                multiSelect: false,
                other: allowsOther,
              },
            ];
          })
        : [];
      if (questions.length > 0) {
        const eventThreadId = threadIdFrom(params);
        const child = eventThreadId ? this.children.get(eventThreadId) : undefined;
        this.activeRun?.onOutput({
          type: "assistant",
          message: {
            content: [
              {
                type: "question",
                questions,
                toolUseId: str(params.itemId),
              },
            ],
          },
          ...(child ? { parentToolUseId: child.toolUseId } : {}),
        });
        return;
      }
    }

    const result = method.includes("requestApproval")
      ? { decision: "denied" }
      : method === "item/tool/requestUserInput"
        ? { answers: {} }
        : {};
    this.write({ id, result });
  }

  private isCurrent(generation: number, child: ChildProcess): boolean {
    return generation === this.processGeneration && child === this.process;
  }

  private finishFromProcessExit(
    code: number | null,
    generation: number,
    child: ChildProcess,
  ): void {
    if (!this.isCurrent(generation, child)) return;
    this.clearExitFallback();
    const suffix = this.stderrChunks.length > 0 ? `: ${this.stderrChunks.join("\n")}` : "";
    if (this.activeRun && !this.activeRun.finished) {
      this.failRun(`Codex app-server exited${code == null ? "" : ` with code ${code}`}${suffix}`);
    }
    this.rejectPending(new Error("Codex app-server exited"));
    this.process = null;
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) pending.reject(error);
    this.pendingRequests.clear();
  }

  private clearExitFallback(): void {
    if (!this.exitFallbackTimer) return;
    clearTimeout(this.exitFallbackTimer);
    this.exitFallbackTimer = null;
  }

  private stopProcess(child: ChildProcess): void {
    try {
      child.kill("SIGTERM");
    } catch {
      // Already stopped.
    }
  }

  getSessionId(): string | null {
    return this.threadId;
  }

  abort(): void {
    const child = this.process;
    if (!child) return;
    ++this.processGeneration;
    this.clearExitFallback();
    this.rejectPending(new Error("Codex run aborted"));
    this.activeRun = null;
    this.process = null;
    this.stopProcess(child);
  }
}
