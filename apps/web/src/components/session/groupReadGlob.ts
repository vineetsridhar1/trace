import type { Event } from "@trace/gql";
import type { ReadGlobItem } from "./messages/ReadGlobGroup";

const READ_GLOB_NAMES = new Set(["read", "glob", "grep"]);

/** Payload types that render as nothing in SessionMessage — these should not break a Read/Glob bucket */
const INVISIBLE_PAYLOAD_TYPES = new Set(["result"]);

export type SessionNode =
  | { kind: "event"; id: string }
  | { kind: "readglob-group"; items: ReadGlobItem[] };

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

  for (const id of eventIds) {
    const event: Event | undefined = events[id];
    if (!event) {
      flushBucket();
      result.push({ kind: "event", id });
      continue;
    }

    if (event.eventType === "session_output") {
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
  return result;
}
