import type { Event } from "@trace/gql";
import { asJsonObject, parseQuestion, type JsonObject, type Question } from "@trace/shared";
import type { ReadGlobItem } from "./messages/ReadGlobGroup";

const READ_GLOB_NAMES = new Set(["read", "glob", "grep"]);
const AGENT_NAMES = new Set(["agent", "task"]);

export interface AgentToolResult {
  content: unknown;
}

export interface BuildSessionNodesResult {
  nodes: SessionNode[];
  completedAgentTools: Map<string, AgentToolResult>;
}

/** Payload types that render content but should not break a Read/Glob bucket */
const BUCKET_TRANSPARENT_TYPES = new Set(["result"]);
/** Payload types that render as nothing in SessionMessage — skip entirely (don't create nodes) */
const SKIP_ENTIRELY_TYPES = new Set([
  "connection_lost",
  "connection_restored",
  "git_checkpoint",
  "git_checkpoint_rewrite",
  "title_generated",
  "config_changed",
  "branch_renamed",
  "prepare",
  "run",
  "send",
  "session_rehomed",
  "recovery_requested",
  "recovery_failed",
  "upgrade_workspace",
  "workspace_ready",
]);

export type SessionNode =
  | { kind: "event"; id: string }
  | {
    kind: "command-execution";
    id: string;
    command: string;
    output?: string | Record<string, unknown>;
    timestamp: string;
    exitCode?: number;
  }
  | { kind: "readglob-group"; items: ReadGlobItem[] }
  | { kind: "plan-review"; id: string; planContent: string; planFilePath: string; timestamp: string }
  | { kind: "ask-user-question"; id: string; questions: Question[]; timestamp: string };

/** Extract tool name + file path from a session_output event payload, if it's a Read/Glob/Grep tool call */
function extractReadGlobInfo(
  payload: JsonObject | undefined,
  timestamp: string,
  id: string,
): ReadGlobItem | null {
  if (!payload) return null;

  const type = payload.type;

  // Assistant message with purely Read/Glob tool_use content blocks (no text)
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
): { id: string; command?: string; output?: string | Record<string, unknown>; timestamp: string; exitCode?: number } | null {
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
  const completedAgentTools = new Map<string, AgentToolResult>();
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

  for (let index = 0; index < eventIds.length; index++) {
    const id = eventIds[index];
    const event: Event | undefined = events[id];
    if (!event) {
      flushBucket();
      result.push({ kind: "event", id });
      continue;
    }

    if (event.eventType === "session_output") {
      const payload = asJsonObject(event.payload);

      // Collect agent/task tool_result blocks for cross-event matching
      if (payload?.type === "assistant") {
        const msg = asJsonObject(payload.message);
        const blocks = msg?.content;
        if (Array.isArray(blocks)) {
          for (const raw of blocks) {
            const block = asJsonObject(raw);
            if (!block || block.type !== "tool_result") continue;
            const name = typeof block.name === "string" ? block.name.toLowerCase() : "";
            if (!AGENT_NAMES.has(name)) continue;
            if (typeof block.tool_use_id === "string") {
              completedAgentTools.set(block.tool_use_id, { content: block.content });
            }
          }
        }
      }
      const commandStart = extractCommandStart(payload, event.timestamp, id);
      if (commandStart) {
        const nextId = eventIds[index + 1];
        const nextEvent = nextId ? events[nextId] : undefined;
        const nextPayload = nextEvent?.eventType === "session_output"
          ? asJsonObject(nextEvent.payload)
          : undefined;
        const commandResult = extractCommandResult(nextPayload, nextEvent?.timestamp ?? "", nextId ?? "");
        if (commandResult && (!commandResult.command || commandResult.command === commandStart.command)) {
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
      // Connection events render as nothing — skip entirely
      if (typeof payloadType === "string" && SKIP_ENTIRELY_TYPES.has(payloadType)) {
        continue;
      }
      // Result/checkpoint events render content but should not break a Read/Glob bucket
      if (typeof payloadType === "string" && BUCKET_TRANSPARENT_TYPES.has(payloadType)) {
        result.push({ kind: "event", id });
        continue;
      }
    }

    flushBucket();
    result.push({ kind: "event", id });
  }

  flushBucket();

  // Deduplicate consecutive "result" events (race between readline and process close)
  const deduped = deduplicateResultEvents(result, events);

  // Post-process: detect special blocks and replace with semantic nodes.
  // Questions run first — they need immediate interaction and take precedence
  // if both a QuestionBlock and PlanBlock appear in the same event.
  const withQuestions = detectQuestionNodes(deduped, events);
  return { nodes: detectPlanReviewNodes(withQuestions, events), completedAgentTools };
}

/** Remove duplicate consecutive "result" session_output events */
function deduplicateResultEvents(
  nodes: SessionNode[],
  events: Record<string, Event>,
): SessionNode[] {
  const result: SessionNode[] = [];
  let lastWasResult = false;

  for (const node of nodes) {
    if (node.kind === "event") {
      const event = events[node.id];
      const payload = event?.eventType === "session_output"
        ? asJsonObject(event.payload)
        : undefined;
      const isResult = payload?.type === "result";

      if (isResult && lastWasResult) continue; // skip duplicate
      lastWasResult = isResult;
    } else {
      lastWasResult = false;
    }
    result.push(node);
  }

  return result;
}

/** Detect PlanBlock in assistant events and replace with plan-review nodes */
function detectPlanReviewNodes(
  nodes: SessionNode[],
  events: Record<string, Event>,
): SessionNode[] {
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

    const qBlock = blocks.find((b: unknown) => asJsonObject(b)?.type === "question");
    if (!qBlock) return node;
    const q = asJsonObject(qBlock)!;
    const questions = Array.isArray(q.questions) ? q.questions : [];

    return {
      kind: "ask-user-question" as const,
      id: node.id,
      questions: questions.map(parseQuestion),
      timestamp: event.timestamp,
    };
  });
}
