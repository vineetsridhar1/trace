/**
 * Parses Claude Code `--output-format stream-json --verbose` NDJSON output
 * and translates it into HookEvent-compatible POSTs to the server.
 *
 * Replaces the old hook-based approach: instead of injecting curl hooks into
 * .claude/settings.json, we read structured events directly from stdout.
 */

import type { ParsedEnrichment, StreamParserOpts } from "./types";

interface PendingToolUse {
  name: string;
  input: unknown;
  assistantText?: string;
}

export class ClaudeStreamParser {
  private buffer = "";
  private sessionId: string | undefined;
  private lastAssistantText = "";
  private pendingAssistantText: string | undefined;
  private usage: { input_tokens: number; output_tokens: number } | undefined;
  private costUsd: number | undefined;
  private detectedToolName: "AskUserQuestion" | "ExitPlanMode" | undefined;
  private detectedToolInput: unknown;
  private pendingToolUses = new Map<string, PendingToolUse>();

  private readonly serverUrl: string;
  private readonly workspaceId: string;
  private readonly cwd: string;
  private readonly callbacks: StreamParserOpts["callbacks"];
  private readonly log: (line: string) => void;
  private pendingPosts: Promise<void>[] = [];

  constructor(opts: StreamParserOpts) {
    this.serverUrl = opts.serverUrl;
    this.workspaceId = opts.workspaceId;
    this.cwd = opts.cwd;
    this.callbacks = opts.callbacks;
    this.log = opts.log;
  }

  /** Feed raw stdout chunks. Complete lines are parsed immediately. */
  processChunk(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    // Keep the last (possibly incomplete) segment in the buffer
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      this.parseLine(trimmed);
    }
  }

  /** Flush any remaining buffer content (call on process close). */
  flush(): void {
    const trimmed = this.buffer.trim();
    if (trimmed) {
      this.parseLine(trimmed);
    }
    this.buffer = "";
  }

  /** Return accumulated enrichment data for the final Stop event. */
  getEnrichment(): ParsedEnrichment {
    return {
      sessionId: this.sessionId,
      lastAssistantText: this.lastAssistantText,
      usage: this.usage,
      costUsd: this.costUsd,
      detectedToolName: this.detectedToolName,
      detectedToolInput: this.detectedToolInput,
    };
  }

  /** Wait for all in-flight event POSTs to complete. Call before posting Stop. */
  async waitForPendingPosts(): Promise<void> {
    await Promise.allSettled(this.pendingPosts);
    this.pendingPosts = [];
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private parseLine(line: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.log(`stream-json: unparseable line len=${line.length}`);
      return;
    }

    this.callbacks.onActivity();

    const type = parsed.type as string | undefined;
    this.log(
      `stream-json: line type=${type ?? "unknown"} keys=${Object.keys(parsed).join(",")}`,
    );

    switch (type) {
      case "system":
        this.handleSystem(parsed);
        break;
      case "assistant":
        this.handleAssistant(parsed);
        break;
      case "user":
        this.handleUser(parsed);
        break;
      case "result":
        this.handleResult(parsed);
        break;
      default:
        break;
    }
  }

  private handleSystem(parsed: Record<string, unknown>): void {
    const sid = parsed.session_id as string | undefined;
    if (sid) {
      this.sessionId = sid;
      this.callbacks.onSessionId(sid);
      this.log(`stream-json: session_id=${sid}`);
    }
  }

  private handleAssistant(parsed: Record<string, unknown>): void {
    const message = parsed.message as Record<string, unknown> | undefined;
    if (!message) return;

    const content = message.content as
      | Array<Record<string, unknown>>
      | undefined;
    if (!Array.isArray(content)) return;

    // Accumulate usage from assistant messages
    const usage = message.usage as
      | { input_tokens?: number; output_tokens?: number }
      | undefined;
    if (usage?.input_tokens) {
      this.usage = {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens ?? 0,
      };
    }

    const blockTypes = content.map((b) => b.type).join(",");
    this.log(
      `stream-json: assistant content blocks=${content.length} types=${blockTypes}`,
    );

    for (const block of content) {
      if (block.type === "text" && typeof block.text === "string") {
        this.lastAssistantText = block.text;
        this.pendingAssistantText = block.text;
      }

      if (block.type === "tool_use") {
        const toolName = block.name as string;
        const toolId = block.id as string;
        const toolInput = block.input;

        // Grab and clear pending assistant text for this tool use
        const assistantText = this.pendingAssistantText;
        this.pendingAssistantText = undefined;

        // Store for correlation with subsequent tool_result
        if (toolId) {
          this.pendingToolUses.set(toolId, {
            name: toolName,
            input: toolInput,
            assistantText,
          });
        }

        // Detect AskUserQuestion / ExitPlanMode — kill the process so
        // execution stops immediately and the question/plan surfaces in the UI.
        if (toolName === "AskUserQuestion") {
          this.detectedToolName = "AskUserQuestion";
          this.detectedToolInput = toolInput;
          this.callbacks.onInputRequired();
        } else if (toolName === "ExitPlanMode") {
          this.detectedToolName = "ExitPlanMode";
          this.detectedToolInput = toolInput;
          this.callbacks.onInputRequired();
        }

        // Emit PreToolUse for Task tool (subagent tracking)
        if (toolName === "Task" || toolName === "Agent") {
          this.trackPost({
            session_id: this.sessionId ?? `trace-local-${this.workspaceId}`,
            cwd: this.cwd,
            hook_event_name: "PreToolUse",
            tool_name: toolName,
            tool_input: toolInput,
            tool_use_id: toolId,
            source: "stream-json",
            ...(assistantText ? { last_assistant_message: assistantText } : {}),
          });
        }
      }
    }
  }

  private handleUser(parsed: Record<string, unknown>): void {
    const message = parsed.message as Record<string, unknown> | undefined;
    if (!message) return;

    const content = message.content as
      | Array<Record<string, unknown>>
      | undefined;
    if (!Array.isArray(content)) return;

    const userBlockTypes = content.map((b) => b.type).join(",");
    this.log(
      `stream-json: user content blocks=${content.length} types=${userBlockTypes}`,
    );

    for (const block of content) {
      if (block.type === "tool_result") {
        const toolUseId = block.tool_use_id as string | undefined;
        if (!toolUseId) continue;

        const pending = this.pendingToolUses.get(toolUseId);
        if (!pending) {
          this.log(
            `stream-json: tool_result id=${toolUseId} has no pending tool_use (orphan)`,
          );
          continue;
        }
        this.pendingToolUses.delete(toolUseId);

        // Emit PostToolUse event
        this.trackPost({
          session_id: this.sessionId ?? `trace-local-${this.workspaceId}`,
          cwd: this.cwd,
          hook_event_name: "PostToolUse",
          tool_name: pending.name,
          tool_input: pending.input,
          tool_response: block.content,
          tool_use_id: toolUseId,
          source: "stream-json",
          ...(pending.assistantText
            ? { last_assistant_message: pending.assistantText }
            : {}),
        });
      }
    }
  }

  private handleResult(parsed: Record<string, unknown>): void {
    if (typeof parsed.result === "string") {
      this.lastAssistantText = parsed.result;
    }

    const usage = parsed.usage as
      | { input_tokens?: number; output_tokens?: number }
      | undefined;
    if (usage?.input_tokens) {
      this.usage = {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens ?? 0,
      };
    }

    const sid = parsed.session_id as string | undefined;
    if (sid && !this.sessionId) {
      this.sessionId = sid;
      this.callbacks.onSessionId(sid);
    }

    const costUsd = parsed.cost_usd as number | undefined;
    if (typeof costUsd === "number") {
      this.costUsd = costUsd;
    }

    this.log(
      `stream-json: result usage=${JSON.stringify(this.usage)} cost_usd=${this.costUsd ?? "n/a"}`,
    );
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
        `stream-json: posted ${payload.hook_event_name} tool=${payload.tool_name ?? "n/a"} status=${response.status}`,
      );
    } catch (err) {
      this.log(
        `stream-json: post failed ${payload.hook_event_name} error=${String(err)}`,
      );
    }
  }
}
