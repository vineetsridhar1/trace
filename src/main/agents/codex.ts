import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runProcess } from "../process";
import type {
  AgentAdapter,
  AgentCapabilities,
  AgentCommand,
  AgentDetectResult,
  AgentSpawnContext,
  AgentStreamParser,
  ParsedEnrichment,
  StreamParserOpts,
} from "./types";

export class CodexStreamParser implements AgentStreamParser {
  private buffer = "";
  private lastAssistantText = "";
  private toolCounter = 0;
  private itemIdToToolId = new Map<string, string>();
  private pendingPosts: Promise<void>[] = [];

  private readonly serverUrl: string;
  private readonly workspaceId: string;
  private readonly cwd: string;
  private readonly callbacks: StreamParserOpts["callbacks"];
  private readonly log: (line: string) => void;

  constructor(opts: StreamParserOpts) {
    this.serverUrl = opts.serverUrl;
    this.workspaceId = opts.workspaceId;
    this.cwd = opts.cwd;
    this.callbacks = opts.callbacks;
    this.log = opts.log;
  }

  processChunk(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      this.parseLine(trimmed);
    }
  }

  flush(): void {
    const trimmed = this.buffer.trim();
    if (trimmed) {
      this.parseLine(trimmed);
    }
    this.buffer = "";
  }

  getEnrichment(): ParsedEnrichment {
    return {
      sessionId: undefined,
      lastAssistantText: this.lastAssistantText,
      usage: undefined,
    };
  }

  async waitForPendingPosts(): Promise<void> {
    await Promise.allSettled(this.pendingPosts);
    this.pendingPosts = [];
  }

  private parseLine(line: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
    } catch {
      // Codex can emit non-JSON startup noise — treat as plain text
      this.log(`codex: non-json line len=${line.length}`);
      this.lastAssistantText += line + "\n";
      return;
    }

    this.callbacks.onActivity();

    const type = parsed.type as string | undefined;
    this.log(
      `codex: line type=${type ?? "unknown"} keys=${Object.keys(parsed).join(",")}`,
    );

    switch (type) {
      case "agent_message":
        this.handleAgentMessage(parsed);
        break;
      case "item.started":
        this.handleItemStarted(parsed);
        break;
      case "item.completed":
        this.handleItemCompleted(parsed);
        break;
      case "error":
        this.handleError(parsed);
        break;
      default:
        break;
    }
  }

  private handleAgentMessage(parsed: Record<string, unknown>): void {
    const content = parsed.content as string | undefined;
    if (content) {
      this.lastAssistantText = content;
    }
  }

  private handleItemStarted(parsed: Record<string, unknown>): void {
    const item = parsed.item as Record<string, unknown> | undefined;
    if (!item) return;

    const itemType = item.type as string | undefined;
    const toolName = this.mapCodexItemToToolName(itemType, item);
    if (!toolName) return;

    const toolId = `codex-${++this.toolCounter}`;
    const itemId = (item.id as string) ?? toolId;
    this.itemIdToToolId.set(itemId, toolId);
    const toolInput = this.extractToolInput(itemType, item);

    this.trackPost({
      session_id: `trace-local-${this.workspaceId}`,
      cwd: this.cwd,
      hook_event_name: "PreToolUse",
      tool_name: toolName,
      tool_input: toolInput,
      tool_use_id: toolId,
      source: "codex-stream",
    });
  }

  private handleItemCompleted(parsed: Record<string, unknown>): void {
    const item = parsed.item as Record<string, unknown> | undefined;
    if (!item) return;

    const itemType = item.type as string | undefined;
    const toolName = this.mapCodexItemToToolName(itemType, item);
    if (!toolName) return;

    const itemId = (item.id as string) ?? `codex-${this.toolCounter}`;
    const toolId = this.itemIdToToolId.get(itemId) ?? itemId;
    this.itemIdToToolId.delete(itemId);
    const toolInput = this.extractToolInput(itemType, item);
    const toolResponse = this.extractToolResponse(itemType, item);

    this.trackPost({
      session_id: `trace-local-${this.workspaceId}`,
      cwd: this.cwd,
      hook_event_name: "PostToolUse",
      tool_name: toolName,
      tool_input: toolInput,
      tool_response: toolResponse,
      tool_use_id: toolId,
      source: "codex-stream",
    });
  }

  private handleError(parsed: Record<string, unknown>): void {
    const message =
      (parsed.message as string) ?? (parsed.error as string) ?? "Unknown error";
    this.lastAssistantText += `\nError: ${message}`;
  }

  private mapCodexItemToToolName(
    itemType: string | undefined,
    item: Record<string, unknown>,
  ): string | null {
    if (itemType === "command_execution") return "Bash";
    if (itemType === "file_edit") return "Edit";
    if (itemType === "file_write") return "Write";
    if (itemType === "file_read") return "Read";

    // Some Codex versions use a generic type with a sub-field
    const action = item.action as string | undefined;
    if (action === "command_execution") return "Bash";
    if (action === "file_edit") return "Edit";
    if (action === "file_write") return "Write";
    if (action === "file_read") return "Read";

    return null;
  }

  private extractToolInput(
    itemType: string | undefined,
    item: Record<string, unknown>,
  ): unknown {
    if (itemType === "command_execution") {
      return { command: item.command ?? item.cmd };
    }
    // Check both file_path and path variants
    const filePath = item.file_path ?? item.path;
    if (itemType === "file_edit" || itemType === "file_write") {
      return { file_path: filePath, content: item.content };
    }
    if (itemType === "file_read") {
      return { file_path: filePath };
    }
    return item;
  }

  private extractToolResponse(
    itemType: string | undefined,
    item: Record<string, unknown>,
  ): unknown {
    if (itemType === "command_execution") {
      // Check both aggregated_output and output variants
      return item.aggregated_output ?? item.output ?? "";
    }
    return item.result ?? "";
  }

  private trackPost(payload: Record<string, unknown>): void {
    const p = this.postEvent(payload);
    this.pendingPosts.push(p);
  }

  private async postEvent(payload: Record<string, unknown>): Promise<void> {
    try {
      const response = await fetch(`${this.serverUrl}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      this.log(
        `codex: posted ${payload.hook_event_name} tool=${payload.tool_name ?? "n/a"} status=${response.status}`,
      );
    } catch (err) {
      this.log(
        `codex: post failed ${payload.hook_event_name} error=${String(err)}`,
      );
    }
  }
}

export class CodexAdapter implements AgentAdapter {
  readonly type = "codex" as const;

  private static readonly REASONING_OPTIONS = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "extra_high", label: "Extra High" },
  ];

  readonly capabilities: AgentCapabilities = {
    displayName: "Codex",
    supportsResume: false,
    supportsPlanMode: false,
    models: [
      {
        value: "gpt-5.3-codex",
        label: "gpt-5.3-codex",
        effortOptions: CodexAdapter.REASONING_OPTIONS,
      },
      {
        value: "gpt-5.2-codex",
        label: "gpt-5.2-codex",
        effortOptions: CodexAdapter.REASONING_OPTIONS,
      },
      {
        value: "gpt-5.1-codex-max",
        label: "gpt-5.1-codex-max",
        effortOptions: CodexAdapter.REASONING_OPTIONS,
      },
      {
        value: "gpt-5.2",
        label: "gpt-5.2",
        effortOptions: CodexAdapter.REASONING_OPTIONS,
      },
      {
        value: "gpt-5.1-codex-mini",
        label: "gpt-5.1-codex-mini",
        effortOptions: CodexAdapter.REASONING_OPTIONS,
      },
    ],
    defaultModel: "gpt-5.3-codex",
    effortLabel: "Reasoning",
  };

  async detect(): Promise<AgentDetectResult> {
    try {
      const result = await runProcess("codex", ["--version"], "/");
      if (result.code !== 0) {
        return {
          available: false,
          error: "codex CLI not found",
          installHint: "npm install -g @openai/codex",
        };
      }
      const version = result.stdout.trim();

      // Check auth: OPENAI_API_KEY env var OR ~/.codex/auth.json
      let authStatus: "ok" | "missing" = "missing";
      let authHint: string | undefined =
        "Set OPENAI_API_KEY or run: codex login";

      if (process.env.OPENAI_API_KEY) {
        authStatus = "ok";
        authHint = undefined;
      } else {
        const authPath = path.join(os.homedir(), ".codex", "auth.json");
        if (fs.existsSync(authPath)) {
          authStatus = "ok";
          authHint = undefined;
        }
      }

      return {
        available: true,
        version,
        authStatus,
        authHint,
        installHint: "npm install -g @openai/codex",
      };
    } catch {
      return {
        available: false,
        error: "codex CLI not found",
        installHint: "npm install -g @openai/codex",
      };
    }
  }

  async buildCommand(ctx: AgentSpawnContext): Promise<AgentCommand> {
    const args = [
      "exec",
      "--full-auto",
      "--json",
      "--model",
      ctx.model ?? this.capabilities.defaultModel,
      "--sandbox",
      "workspace-write",
    ];

    if (ctx.effort) {
      args.push("--reasoning-effort", ctx.effort);
    }

    args.push("-");

    return {
      command: "codex",
      args,
      stdin: ctx.prompt,
      stdinMode: "pipe",
      // No envFilter — Codex needs OPENAI_API_KEY to flow through
    };
  }

  createParser(opts: StreamParserOpts): AgentStreamParser {
    return new CodexStreamParser(opts);
  }
}
