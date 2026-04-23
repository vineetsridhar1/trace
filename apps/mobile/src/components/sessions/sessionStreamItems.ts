import type { SessionNode } from "@trace/client-core";
import type { Event } from "@trace/gql";
import { asJsonObject } from "@trace/shared";
import { nodeKey } from "@/hooks/useNewActivityTracker";
import { formatTime } from "./nodes/utils";

export interface SessionStreamListItem {
  key: string;
  itemType: string;
  node: SessionNode;
  timestampLabel: string | null;
  isLast: boolean;
}

export interface SessionStreamItemCache {
  byIdentity: Map<string, SessionStreamListItem>;
}

export function buildSessionStreamItems(
  nodes: SessionNode[],
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
  node: SessionNode,
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
    case "event": {
      const event = events[node.id];
      const payload = asJsonObject(event?.payload);
      const clientMutationId = payload?.clientMutationId;
      const key = typeof clientMutationId === "string" ? `cm:${clientMutationId}` : nodeKey(node);
      return {
        identity: `event:${node.id}`,
        key,
        itemType: eventTypeFor(event, node.id),
        timestampLabel: event?.timestamp ? formatTime(event.timestamp) : null,
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
