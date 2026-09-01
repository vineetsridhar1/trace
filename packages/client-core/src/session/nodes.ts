import type { Event } from "@trace/gql";
import {
  asJsonObject,
  actionRequiredArtifactKey,
  DELIVERY_DEFERRED_OUTPUT_TYPE,
  hasVisibleUserSessionContent,
  isActionRequiredArtifact,
  parseQuestion,
  parseTraceRequestInputs,
  type JsonObject,
  type Question,
} from "@trace/shared";
import { HIDDEN_SESSION_PAYLOAD_TYPE_SET } from "./event-filters.js";

const READ_GLOB_NAMES = new Set(["read", "glob", "grep"]);
const AGENT_NAMES = new Set(["agent", "task"]);

/** A single Read/Glob/Grep item collected into a collapsed group node. */
export interface ReadGlobItem {
  id: string;
  toolName: string;
  filePath: string;
  timestamp: string;
}

export interface AgentToolResult {
  content: unknown;
}

export interface BuildSessionNodesResult {
  nodes: SessionNode[];
  completedAgentTools: Map<string, AgentToolResult>;
  toolResultByUseId: Map<string, unknown>;
}

/** Payload types that render content but should not break a Read/Glob bucket */
const BUCKET_TRANSPARENT_TYPES = new Set(["result"]);

/**
 * Returns true when an assistant/user session_output payload would render to nothing.
 * These are typically user events carrying only tool_result blocks (already collected
 * in toolResultByUseId and rendered inline inside the matching ToolCallRow) or
 * assistant events whose only text blocks are whitespace.
 */
function isEmptySessionOutput(payload: JsonObject | undefined): boolean {
  if (!payload) return true;
  const type = payload.type;
  if (type !== "assistant" && type !== "user") return false;
  const message = asJsonObject(payload.message);
  const blocks = message?.content;
  if (!Array.isArray(blocks)) return true;
  for (const raw of blocks) {
    const block = asJsonObject(raw);
    if (!block) continue;
    if (block.type === "tool_result") continue;
    if (block.type === "text") {
      if (typeof block.text === "string" && block.text.trim()) return false;
      continue;
    }
    return false;
  }
  return true;
}

export type SessionNode =
  | { kind: "event"; id: string; repeatCount?: number }
  | {
      kind: "command-execution";
      id: string;
      command: string;
      output?: string | Record<string, unknown>;
      timestamp: string;
      exitCode?: number;
    }
  | { kind: "readglob-group"; items: ReadGlobItem[] }
  | {
      kind: "plan-review";
      id: string;
      planContent: string;
      planFilePath: string;
      timestamp: string;
    }
  | {
      kind: "ask-user-question";
      id: string;
      questions: Question[];
      leadingText?: string;
      timestamp: string;
    };

/** Extract tool name + file path from a session_output event payload, if it's a Read/Glob/Grep tool call */
function extractReadGlobInfo(
  payload: JsonObject | undefined,
  timestamp: string,
  id: string,
): ReadGlobItem | null {
  if (!payload) return null;

  const type = payload.type;

  if (type === "assistant") {
    const message = asJsonObject(payload.message);
    const blocks = message?.content;
    if (!Array.isArray(blocks)) return null;

    let foundReadGlob = false;
    let filePath = "";
    let toolName = "";
    for (const rawBlock of blocks) {
      const block = asJsonObject(rawBlock);
      if (!block) continue;
      if (block.type === "text" && typeof block.text === "string" && block.text.trim()) return null;
      if (block.type === "tool_use") {
        const name = String(block.name ?? "");
        if (!READ_GLOB_NAMES.has(name.toLowerCase())) return null;
        if (!foundReadGlob) {
          toolName = name;
          const input = asJsonObject(block.input) ?? {};
          filePath = String(input.file_path ?? input.path ?? input.pattern ?? input.filepath ?? "");
          foundReadGlob = true;
        }
      }
    }
    if (foundReadGlob) return { id, toolName, filePath, timestamp };
  }

  return null;
}

function extractCommandStart(
  payload: JsonObject | undefined,
  timestamp: string,
  id: string,
): { id: string; command: string; timestamp: string } | null {
  if (!payload || payload.type !== "assistant") return null;

  const message = asJsonObject(payload.message);
  const blocks = message?.content;
  if (!Array.isArray(blocks)) return null;

  let command = "";
  for (const rawBlock of blocks) {
    const block = asJsonObject(rawBlock);
    if (!block) continue;
    if (block.type === "text" && typeof block.text === "string" && block.text.trim()) return null;
    if (block.type === "tool_use") {
      const name = String(block.name ?? "").toLowerCase();
      if (name !== "command" && name !== "bash") return null;
      const input = asJsonObject(block.input);
      if (typeof input?.command !== "string" || !input.command.trim()) return null;
      command = input.command;
    }
  }

  return command ? { id, command, timestamp } : null;
}

function extractCommandResult(
  payload: JsonObject | undefined,
  timestamp: string,
  id: string,
): {
  id: string;
  command?: string;
  output?: string | Record<string, unknown>;
  timestamp: string;
  exitCode?: number;
} | null {
  if (!payload || payload.type !== "assistant") return null;

  const message = asJsonObject(payload.message);
  const blocks = message?.content;
  if (!Array.isArray(blocks)) return null;

  let command: string | undefined;
  let output: string | Record<string, unknown> | undefined;
  let exitCode: number | undefined;
  for (const rawBlock of blocks) {
    const block = asJsonObject(rawBlock);
    if (!block) continue;
    if (block.type === "text" && typeof block.text === "string" && block.text.trim()) return null;
    if (block.type === "tool_result") {
      const name = String(block.name ?? "").toLowerCase();
      if (name !== "command" && name !== "bash") return null;
      const content = block.content;
      if (typeof content === "string") {
        output = content;
      } else {
        const result = asJsonObject(content);
        if (!result) return null;
        if (typeof result.command === "string" && result.command.trim()) {
          command = result.command;
        } else if (typeof result.cmd === "string" && result.cmd.trim()) {
          command = result.cmd;
        }
        if (typeof result.output === "string") {
          output = result.output;
        } else {
          const nestedOutput = asJsonObject(result.output);
          if (nestedOutput) output = nestedOutput;
        }
        if (typeof result.exitCode === "number") {
          exitCode = result.exitCode;
        } else if (typeof result.exit_code === "number") {
          exitCode = result.exit_code;
        }
      }
    }
  }

  return output != null || command != null ? { id, command, output, timestamp, exitCode } : null;
}

/** Group consecutive Read/Glob events into collapsed nodes and collect completed agent tool results */
export function buildSessionNodes(
  eventIds: string[],
  events: Record<string, Event>,
): BuildSessionNodesResult {
  const result: SessionNode[] = [];
  const visibleActionableArtifacts = new Map<
    string,
    Extract<SessionNode, { kind: "event" }>
  >();
  let hasActionableFailure = false;
  const completedAgentTools = new Map<string, AgentToolResult>();
  const toolResultByUseId = new Map<string, unknown>();
  let bucket: ReadGlobItem[] = [];

  const flushBucket = () => {
    if (bucket.length === 0) return;
    if (bucket.length === 1) {
      result.push({ kind: "event", id: bucket[0].id });
    } else {
      result.push({ kind: "readglob-group", items: [...bucket] });
    }
    bucket = [];
  };

  // First pass: collect all tool_result blocks across ALL events.
  // Agent/task results power SubagentRow; all others power ToolCallRow inline output.
  // tool_use blocks live in assistant events; matching tool_result blocks live in the
  // subsequent user event — they must be correlated here before per-event rendering.
  for (const id of eventIds) {
    const event = events[id];
    if (!event || event.eventType !== "session_output") continue;
    const payload = asJsonObject(event.payload);
    if (payload?.type !== "assistant" && payload?.type !== "user") continue;
    const msg = asJsonObject(payload.message);
    const blocks = msg?.content;
    if (!Array.isArray(blocks)) continue;
    for (const raw of blocks) {
      const block = asJsonObject(raw);
      if (!block || block.type !== "tool_result") continue;
      const toolUseId = typeof block.tool_use_id === "string" ? block.tool_use_id : undefined;
      if (!toolUseId) continue;
      const name = typeof block.name === "string" ? block.name.toLowerCase() : "";
      if (AGENT_NAMES.has(name)) {
        completedAgentTools.set(toolUseId, { content: block.content });
      } else {
        toolResultByUseId.set(toolUseId, block.content ?? block.output);
      }
    }
  }

  for (let index = 0; index < eventIds.length; index++) {
    const id = eventIds[index];
    const event: Event | undefined = events[id];
    if (!event) {
      flushBucket();
      result.push({ kind: "event", id });
      continue;
    }

    if (HIDDEN_SESSION_PAYLOAD_TYPE_SET.has(event.eventType)) {
      continue;
    }
    if (event.eventType === "session_runtime_start_failed") {
      const payload = asJsonObject(event.payload);
      if (!isActionRequiredArtifact(asJsonObject(payload?.artifact))) continue;
    }
    if (event.eventType === "session_started") {
      const payload = asJsonObject(event.payload);
      if (
        !hasVisibleUserSessionContent(event.eventType, event.payload) &&
        payload?.type !== "runtime_move"
      ) {
        continue;
      }
    }

    if (event.eventType === "message_sent") {
      visibleActionableArtifacts.clear();
      hasActionableFailure = false;
    }

    const eventPayload = asJsonObject(event.payload);
    const eventArtifact = asJsonObject(eventPayload?.artifact);
    const hasEventArtifact =
      eventPayload?.type !== "assistant" && isActionRequiredArtifact(eventArtifact);
    if (hasEventArtifact) hasActionableFailure = true;

    if (
      hasActionableFailure &&
      ((event.eventType === "session_terminated" && eventPayload?.reason === "workspace_failed") ||
        (event.eventType === "session_output" && eventPayload?.type === "workspace_failed"))
    ) {
      continue;
    }

    // Subagent child events render nested inside their parent's SubagentRow — never as top-level nodes.
    if (event.parentId) {
      continue;
    }

    if (event.eventType === "session_output") {
      const payload = eventPayload;

      const artifact = asJsonObject(payload?.artifact);
      if (payload?.type !== "assistant" && isActionRequiredArtifact(artifact)) {
        const key = actionRequiredArtifactKey(artifact);
        const priorNode = visibleActionableArtifacts.get(key);
        if (priorNode) {
          priorNode.repeatCount = (priorNode.repeatCount ?? 1) + 1;
          continue;
        }
        const artifactNode: Extract<SessionNode, { kind: "event" }> = {
          kind: "event",
          id,
          repeatCount: 1,
        };
        visibleActionableArtifacts.set(key, artifactNode);
        flushBucket();
        result.push(artifactNode);
        continue;
      }

      if (isEmptySessionOutput(payload)) {
        continue;
      }

      const commandStart = extractCommandStart(payload, event.timestamp, id);
      if (commandStart) {
        const nextId = eventIds[index + 1];
        const nextEvent = nextId ? events[nextId] : undefined;
        const nextPayload =
          nextEvent?.eventType === "session_output" ? asJsonObject(nextEvent.payload) : undefined;
        const commandResult = extractCommandResult(
          nextPayload,
          nextEvent?.timestamp ?? "",
          nextId ?? "",
        );
        if (
          commandResult &&
          (!commandResult.command || commandResult.command === commandStart.command)
        ) {
          flushBucket();
          result.push({
            kind: "command-execution",
            id: `${id}:${nextId}`,
            command: commandStart.command,
            output: commandResult.output,
            timestamp: commandStart.timestamp,
            exitCode: commandResult.exitCode,
          });
          index += 1;
          continue;
        }
      }

      const info = extractReadGlobInfo(payload, event.timestamp, id);
      if (info) {
        bucket.push(info);
        continue;
      }

      const payloadType = payload?.type;
      if (typeof payloadType === "string" && HIDDEN_SESSION_PAYLOAD_TYPE_SET.has(payloadType)) {
        continue;
      }
      if (typeof payloadType === "string" && BUCKET_TRANSPARENT_TYPES.has(payloadType)) {
        result.push({ kind: "event", id });
        continue;
      }
    }

    flushBucket();
    result.push({ kind: "event", id });
  }

  flushBucket();

  const deduped = deduplicateResultEvents(result, events);

  const withQuestions = detectQuestionNodes(deduped, events);
  return {
    nodes: detectPlanReviewNodes(withQuestions, events),
    completedAgentTools,
    toolResultByUseId,
  };
}

/**
 * Payload types that render identical, information-free rows, so a run of them
 * reads as noise. `delivery_deferred` bursts when a replay loop retries several
 * queued commands against the same unroutable runtime; user-initiated ones are
 * separated by their own message bubbles and so survive this collapse.
 */
const COLLAPSE_CONSECUTIVE_TYPES = new Set(["result", DELIVERY_DEFERRED_OUTPUT_TYPE]);

/** Remove duplicate consecutive "result" and deferred-delivery session_output events */
function deduplicateResultEvents(
  nodes: SessionNode[],
  events: Record<string, Event>,
): SessionNode[] {
  const result: SessionNode[] = [];
  let lastCollapsibleType: string | undefined;

  for (const node of nodes) {
    if (node.kind === "event") {
      const event = events[node.id];
      const payload =
        event?.eventType === "session_output" ? asJsonObject(event.payload) : undefined;
      const type = typeof payload?.type === "string" ? payload.type : undefined;
      const collapsibleType = type && COLLAPSE_CONSECUTIVE_TYPES.has(type) ? type : undefined;

      if (collapsibleType && collapsibleType === lastCollapsibleType) continue;
      lastCollapsibleType = collapsibleType;
    } else {
      lastCollapsibleType = undefined;
    }
    result.push(node);
  }

  return result;
}

/** Detect PlanBlock in assistant events and replace with plan-review nodes */
function detectPlanReviewNodes(nodes: SessionNode[], events: Record<string, Event>): SessionNode[] {
  return nodes.map((node) => {
    if (node.kind !== "event") return node;
    const event = events[node.id];
    if (!event || event.eventType !== "session_output") return node;
    const payload = asJsonObject(event.payload);
    if (!payload || payload.type !== "assistant") return node;
    const message = asJsonObject(payload.message);
    const blocks = message?.content;
    if (!Array.isArray(blocks)) return node;

    const planBlock = blocks.find((b: unknown) => asJsonObject(b)?.type === "plan");
    if (!planBlock) return node;
    const p = asJsonObject(planBlock)!;

    return {
      kind: "plan-review" as const,
      id: node.id,
      planContent: String(p.content ?? ""),
      planFilePath: String(p.filePath ?? ""),
      timestamp: event.timestamp,
    };
  });
}

/** Extract text that precedes the first structured question in a message. */
function extractQuestionLeadingText(blocks: unknown[]): string | undefined {
  const textParts: string[] = [];

  for (const block of blocks) {
    const parsed = asJsonObject(block);
    if (!parsed) continue;
    if (parsed.type === "question") break;
    if (parsed.type !== "text" || typeof parsed.text !== "string") continue;

    const unfencedText = parsed.text.replace(/```[\s\S]*?```/gu, (fence) =>
      " ".repeat(fence.length),
    );
    const requestInputIndex = unfencedText.search(/<trace:request-input\b/iu);
    if (requestInputIndex >= 0 && parseTraceRequestInputs(parsed.text).length > 0) {
      textParts.push(parsed.text.slice(0, requestInputIndex));
      break;
    }
    textParts.push(parsed.text);
  }

  const leadingText = textParts.join("\n\n").trim();
  return leadingText || undefined;
}

/** Detect QuestionBlock in assistant events and replace with ask-user-question nodes */
function detectQuestionNodes(nodes: SessionNode[], events: Record<string, Event>): SessionNode[] {
  return nodes.map((node) => {
    if (node.kind !== "event") return node;
    const event = events[node.id];
    if (!event || event.eventType !== "session_output") return node;
    const payload = asJsonObject(event.payload);
    if (!payload || payload.type !== "assistant") return node;
    const message = asJsonObject(payload.message);
    const blocks = message?.content;
    if (!Array.isArray(blocks)) return node;

    const questions: Question[] = [];
    for (const block of blocks) {
      const parsed = asJsonObject(block);
      if (parsed?.type === "question") {
        const nativeQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
        questions.push(...nativeQuestions.map(parseQuestion));
      } else if (parsed?.type === "text" && typeof parsed.text === "string") {
        questions.push(...parseTraceRequestInputs(parsed.text));
      }
    }
    if (questions.length === 0) return node;

    const leadingText = extractQuestionLeadingText(blocks);
    return {
      kind: "ask-user-question" as const,
      id: node.id,
      questions,
      ...(leadingText ? { leadingText } : {}),
      timestamp: event.timestamp,
    };
  });
}
