import type { SessionNode } from "@trace/client-core";
import type { Event } from "@trace/gql";
import { asJsonObject } from "@trace/shared";
import { nodeKey } from "@/hooks/useNewActivityTracker";
import type { CollapsedSessionEventsSummary } from "@/hooks/session-events-timeline";
import { formatMessageTimestamp, formatTime } from "./nodes/utils";

export type SessionStreamNode =
  | SessionNode
  | { kind: "collapsed-events"; id: string; collapsed: CollapsedSessionEventsSummary };

export interface SessionStreamListItem {
  key: string;
  itemType: string;
  node: SessionStreamNode;
  timestampLabel: string | null;
  isLast: boolean;
}

export interface SessionStreamItemCache {
  byIdentity: Map<string, SessionStreamListItem>;
}

export function buildSessionStreamItems(
  nodes: SessionStreamNode[],
  events: Record<string, Event>,
  previous?: SessionStreamItemCache,
): { items: SessionStreamListItem[]; cache: SessionStreamItemCache } {
  const byIdentity = new Map<string, SessionStreamListItem>();
  const items = nodes.map((node, index) => {
    const descriptor = describeNode(node, events, index === nodes.length - 1);
    const previousItem = previous?.byIdentity.get(descriptor.identity);
    const item =
      descriptor.reuse &&
      previousItem &&
      previousItem.key === descriptor.key &&
      previousItem.itemType === descriptor.itemType &&
      previousItem.timestampLabel === descriptor.timestampLabel &&
      previousItem.isLast === descriptor.isLast
        ? previousItem
        : {
            key: descriptor.key,
            itemType: descriptor.itemType,
            node,
            timestampLabel: descriptor.timestampLabel,
            isLast: descriptor.isLast,
          };
    byIdentity.set(descriptor.identity, item);
    return item;
  });

  return { items, cache: { byIdentity } };
}

function describeNode(
  node: SessionStreamNode,
  events: Record<string, Event>,
  isLast: boolean,
): {
  identity: string;
  key: string;
  itemType: string;
  timestampLabel: string | null;
  isLast: boolean;
  reuse: boolean;
} {
  switch (node.kind) {
    case "collapsed-events":
      return {
        identity: `collapsed-events:${node.id}`,
        key: node.id,
        itemType: "collapsed-events",
        timestampLabel: `${formatTime(node.collapsed.startTimestamp)} - ${formatTime(
          node.collapsed.endTimestamp,
        )}`,
        isLast,
        reuse: true,
      };
    case "event": {
      const event = events[node.id];
      const payload = asJsonObject(event?.payload);
      const clientMutationId = payload?.clientMutationId;
      const key = typeof clientMutationId === "string" ? `cm:${clientMutationId}` : nodeKey(node);
      const timestampFormatter = isUserMessageEvent(event, payload)
        ? formatMessageTimestamp
        : formatTime;
      return {
        identity: `event:${node.id}`,
        key,
        itemType: eventTypeFor(event, node.id),
        timestampLabel: event?.timestamp ? timestampFormatter(event.timestamp) : null,
        isLast,
        reuse: true,
      };
    }
    case "command-execution":
      return {
        identity: `command-execution:${node.id}`,
        key: node.id,
        itemType: `command-execution:${node.id}`,
        timestampLabel: formatTime(node.timestamp),
        isLast,
        reuse: false,
      };
    case "plan-review":
      return {
        identity: `plan-review:${node.id}`,
        key: node.id,
        itemType: node.kind,
        timestampLabel: formatTime(node.timestamp),
        isLast,
        reuse: true,
      };
    case "ask-user-question":
      return {
        identity: `ask-user-question:${node.id}`,
        key: node.id,
        itemType: node.kind,
        timestampLabel: formatTime(node.timestamp),
        isLast,
        reuse: true,
      };
    case "readglob-group": {
      const firstId = node.items[0]?.id ?? "empty";
      const last = node.items[node.items.length - 1];
      const lastId = last?.id ?? firstId;
      return {
        identity: `readglob-group:${firstId}:${lastId}`,
        key: `rg:${firstId}`,
        itemType: `readglob-group:${firstId}:${lastId}`,
        timestampLabel: last ? formatTime(last.timestamp) : null,
        isLast,
        reuse: true,
      };
    }
  }
}

function isUserMessageEvent(
  event: Event | undefined,
  payload: Record<string, unknown> | undefined,
): boolean {
  return (
    (event?.eventType === "session_started" && typeof payload?.prompt === "string") ||
    event?.eventType === "message_sent" ||
    (event?.eventType === "session_output" && payload?.type === "user")
  );
}

function eventTypeFor(event: Event | undefined, eventId: string): string {
  if (!event) return "event:unknown";
  if (event.eventType === "session_output") {
    const payload = asJsonObject(event.payload);
    const payloadType = typeof payload?.type === "string" ? payload.type : "unknown";
    if (payloadType === "assistant" || payloadType === "user") {
      return `event:so:${payloadType}:${eventId}`;
    }
    return `event:so:${payloadType}`;
  }
  return `event:${event.eventType}`;
}
