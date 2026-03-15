import type { Event } from "@trace/gql";
import type { ReadGlobItem } from "./messages/ReadGlobGroup";

const READ_GLOB_NAMES = new Set(["read", "glob", "grep"]);

/** Payload types that render as nothing in SessionMessage — these should not break a Read/Glob bucket */
const INVISIBLE_PAYLOAD_TYPES = new Set(["result"]);

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
  | { kind: "plan-review"; id: string; planContent: string; planFilePath: string; timestamp: string };

/** Safely narrow unknown to a record for property access */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Extract tool name + file path from a session_output event payload, if it's a Read/Glob/Grep tool call */
function extractReadGlobInfo(
  payload: Record<string, unknown> | undefined,
  timestamp: string,
  id: string,
): ReadGlobItem | null {
  if (!payload) return null;

  const type = payload.type;

  // Assistant message with purely Read/Glob tool_use content blocks (no text)
  if (type === "assistant") {
    const message = asRecord(payload.message);
    const blocks = message?.content;
    if (!Array.isArray(blocks)) return null;

    let foundReadGlob = false;
    let filePath = "";
    let toolName = "";
    for (const rawBlock of blocks) {
      const block = asRecord(rawBlock);
      if (!block) continue;
      if (block.type === "text" && typeof block.text === "string" && block.text.trim()) return null;
      if (block.type === "tool_use") {
        const name = String(block.name ?? "");
        if (!READ_GLOB_NAMES.has(name.toLowerCase())) return null;
        if (!foundReadGlob) {
          toolName = name;
          const input = asRecord(block.input) ?? {};
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
  payload: Record<string, unknown> | undefined,
  timestamp: string,
  id: string,
): { id: string; command: string; timestamp: string } | null {
  if (!payload || payload.type !== "assistant") return null;

  const message = asRecord(payload.message);
  const blocks = message?.content;
  if (!Array.isArray(blocks)) return null;

  let command = "";
  for (const rawBlock of blocks) {
    const block = asRecord(rawBlock);
    if (!block) continue;
    if (block.type === "text" && typeof block.text === "string" && block.text.trim()) return null;
    if (block.type === "tool_use") {
      const name = String(block.name ?? "").toLowerCase();
      if (name !== "command" && name !== "bash") return null;
      const input = asRecord(block.input);
      if (typeof input?.command !== "string" || !input.command.trim()) return null;
      command = input.command;
    }
  }

  return command ? { id, command, timestamp } : null;
}

function extractCommandResult(
  payload: Record<string, unknown> | undefined,
  timestamp: string,
  id: string,
): { id: string; command?: string; output?: string | Record<string, unknown>; timestamp: string; exitCode?: number } | null {
  if (!payload || payload.type !== "assistant") return null;

  const message = asRecord(payload.message);
  const blocks = message?.content;
  if (!Array.isArray(blocks)) return null;

  let command: string | undefined;
  let output: string | Record<string, unknown> | undefined;
  let exitCode: number | undefined;
  for (const rawBlock of blocks) {
    const block = asRecord(rawBlock);
    if (!block) continue;
    if (block.type === "text" && typeof block.text === "string" && block.text.trim()) return null;
    if (block.type === "tool_result") {
      const name = String(block.name ?? "").toLowerCase();
      if (name !== "command" && name !== "bash") return null;
      const content = block.content;
      if (typeof content === "string") {
        output = content;
      } else {
        const result = asRecord(content);
        if (!result) return null;
        if (typeof result.command === "string" && result.command.trim()) command = result.command;
        if (typeof result.output === "string") {
          output = result.output;
        } else {
          const nestedOutput = asRecord(result.output);
          if (nestedOutput) output = nestedOutput;
        }
        if (typeof result.exitCode === "number") exitCode = result.exitCode;
      }
    }
  }

  return output != null || command != null ? { id, command, output, timestamp, exitCode } : null;
}

/** Group consecutive Read/Glob events into collapsed nodes */
export function buildSessionNodes(
  eventIds: string[],
  events: Record<string, Event>,
): SessionNode[] {
  const result: SessionNode[] = [];
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
      const commandStart = extractCommandStart(event.payload, event.timestamp, id);
      if (commandStart) {
        const nextId = eventIds[index + 1];
        const nextEvent = nextId ? events[nextId] : undefined;
        const nextPayload = nextEvent?.eventType === "session_output"
          ? asRecord(nextEvent.payload)
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

      const info = extractReadGlobInfo(event.payload, event.timestamp, id);
      if (info) {
        bucket.push(info);
        continue;
      }

      // Events that render as nothing should not break a Read/Glob bucket
      const payloadType = (event.payload as Record<string, unknown>).type;
      if (typeof payloadType === "string" && INVISIBLE_PAYLOAD_TYPES.has(payloadType)) {
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

  // Post-process: detect ExitPlanMode tool_use and replace with plan-review nodes
  return detectPlanReviewNodes(deduped, events);
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
        ? asRecord(event.payload)
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

/** Walk backwards through nodes to find ExitPlanMode tool calls and replace them with plan-review nodes */
function detectPlanReviewNodes(
  nodes: SessionNode[],
  events: Record<string, Event>,
): SessionNode[] {
  const result: SessionNode[] = [...nodes];

  for (let i = result.length - 1; i >= 0; i--) {
    const node = result[i];
    if (node.kind !== "event") continue;

    const event = events[node.id];
    if (!event || event.eventType !== "session_output") continue;

    const payload = asRecord(event.payload);
    if (!payload || payload.type !== "assistant") continue;

    const message = asRecord(payload.message);
    const blocks = message?.content;
    if (!Array.isArray(blocks)) continue;

    // Check if this event contains an ExitPlanMode tool_use
    const hasExitPlanMode = blocks.some((rawBlock: unknown) => {
      const block = asRecord(rawBlock);
      return block?.type === "tool_use" && block?.name === "ExitPlanMode";
    });
    if (!hasExitPlanMode) continue;

    // Look backwards for Write/Edit to a .claude/plans/ .md file
    let planContent = "";
    let planFilePath = "";
    let planEventIndex = -1;
    let fallbackText = "";

    for (let j = i - 1; j >= 0; j--) {
      const prevNode = result[j];
      if (prevNode.kind !== "event") continue;

      const prevEvent = events[prevNode.id];
      if (!prevEvent || prevEvent.eventType !== "session_output") continue;

      const prevPayload = asRecord(prevEvent.payload);
      if (!prevPayload || prevPayload.type !== "assistant") continue;

      const prevMessage = asRecord(prevPayload.message);
      const prevBlocks = prevMessage?.content;
      if (!Array.isArray(prevBlocks)) continue;

      for (const rawBlock of prevBlocks) {
        const block = asRecord(rawBlock);
        if (!block) continue;

        // Collect fallback text
        if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
          fallbackText = block.text;
        }

        if (block.type === "tool_use" && (block.name === "Write" || block.name === "Edit")) {
          const input = asRecord(block.input);
          if (!input) continue;
          const fp = String(input.file_path ?? "");
          if (fp.includes(".claude/plans/") && fp.endsWith(".md")) {
            planContent = String(input.content ?? "");
            planFilePath = fp;
            planEventIndex = j;
            break;
          }
        }
      }

      if (planContent) break;
    }

    if (!planContent && fallbackText) {
      planContent = fallbackText;
    }

    if (planContent) {
      // Replace the ExitPlanMode event with a plan-review node
      result[i] = {
        kind: "plan-review",
        id: node.id,
        planContent,
        planFilePath,
        timestamp: event.timestamp,
      };

      // Remove the Write/Edit event that wrote the plan (if found)
      if (planEventIndex >= 0) {
        result.splice(planEventIndex, 1);
      }
    }
  }

  return result;
}
