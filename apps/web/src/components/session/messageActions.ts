import { asJsonObject } from "@trace/shared";

type ActionEvent = { eventType?: string; payload?: unknown };

function hasArrayContent(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function hasUserMessageContent(eventType: string | undefined, payload: unknown): boolean {
  const record = asJsonObject(payload);
  if (!record) return false;
  if (eventType === "message_sent") {
    return (
      (typeof record.text === "string" && record.text.trim().length > 0) ||
      hasArrayContent(record.imageKeys) ||
      hasArrayContent(record.attachmentKeys)
    );
  }
  if (eventType === "session_started") {
    return (
      (typeof record.prompt === "string" && record.prompt.trim().length > 0) ||
      hasArrayContent(record.imageKeys) ||
      hasArrayContent(record.attachmentKeys)
    );
  }
  return false;
}

function hasAssistantTextContent(payload: unknown): boolean {
  const record = asJsonObject(payload);
  if (record?.type !== "assistant") return false;
  const message = asJsonObject(record.message);
  const content = message?.content;
  if (!Array.isArray(content)) return false;
  return content.some((item) => {
    const block = asJsonObject(item);
    return block?.type === "text" && typeof block.text === "string" && block.text.trim().length > 0;
  });
}

function hasAssistantToolUseContent(payload: unknown): boolean {
  const record = asJsonObject(payload);
  if (record?.type !== "assistant") return false;
  const message = asJsonObject(record.message);
  const content = message?.content;
  if (!Array.isArray(content)) return false;
  return content.some((item) => asJsonObject(item)?.type === "tool_use");
}

export function findMessageActionsEventIds(
  eventIds: string[],
  events: Record<string, ActionEvent | undefined>,
): ReadonlySet<string> {
  const actionEventIds = new Set<string>();
  let pendingFinalAssistantEventIds: string[] = [];

  const flushPendingFinals = () => {
    for (const id of pendingFinalAssistantEventIds) {
      actionEventIds.add(id);
    }
    pendingFinalAssistantEventIds = [];
  };

  for (const id of eventIds) {
    const event = events[id];
    if (!event) continue;

    if (hasUserMessageContent(event.eventType, event.payload)) {
      flushPendingFinals();
      continue;
    }

    if (event.eventType !== "session_output") continue;
    if (hasAssistantToolUseContent(event.payload)) {
      pendingFinalAssistantEventIds = [];
      continue;
    }
    if (hasAssistantTextContent(event.payload)) {
      pendingFinalAssistantEventIds.push(id);
    }
  }

  flushPendingFinals();
  return actionEventIds;
}
