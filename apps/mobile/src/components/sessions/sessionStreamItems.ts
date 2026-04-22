import type { SessionNode } from "@trace/client-core";
import type { Event } from "@trace/gql";
import { asJsonObject } from "@trace/shared";
import { formatTime } from "./nodes/utils";

export function timestampLabelForNode(
  item: SessionNode,
  events: Record<string, Event>,
): string | null {
  switch (item.kind) {
    case "event": {
      const timestamp = events[item.id]?.timestamp;
      return timestamp ? formatTime(timestamp) : null;
    }
    case "command-execution":
    case "plan-review":
    case "ask-user-question":
      return formatTime(item.timestamp);
    case "readglob-group": {
      const last = item.items[item.items.length - 1];
      return last ? formatTime(last.timestamp) : null;
    }
  }
}

export function itemTypeFor(item: SessionNode, events: Record<string, Event>): string {
  if (item.kind !== "event") {
    switch (item.kind) {
      // These rows keep local expansion/animation state, so they must not
      // recycle across different transcript items.
      case "command-execution":
        return `command-execution:${item.id}`;
      case "readglob-group": {
        const firstId = item.items[0]?.id ?? "empty";
        const lastId = item.items[item.items.length - 1]?.id ?? firstId;
        return `readglob-group:${firstId}:${lastId}`;
      }
      default:
        return item.kind;
    }
  }
  const event = events[item.id];
  if (!event) return "event:unknown";
  if (event.eventType === "session_output") {
    const payload = asJsonObject(event.payload);
    const payloadType = typeof payload?.type === "string" ? payload.type : "unknown";
    if (payloadType === "assistant" || payloadType === "user") {
      return `event:so:${payloadType}:${item.id}`;
    }
    return `event:so:${payloadType}`;
  }
  return `event:${event.eventType}`;
}
