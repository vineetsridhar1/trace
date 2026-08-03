import type { Event } from "@trace/gql";
import { asJsonObject } from "@trace/shared";
import type { SessionNode } from "./groupReadGlob";

export interface CompactChatSummary {
  userText: string | null;
  assistantText: string | null;
  actionCount: number;
}

function userText(event: Event | undefined): string | null {
  const payload = asJsonObject(event?.payload);
  if (event?.eventType === "message_sent" && typeof payload?.text === "string") {
    return payload.text.trim() || null;
  }
  if (event?.eventType === "session_started" && typeof payload?.prompt === "string") {
    return payload.prompt.trim() || null;
  }
  return null;
}

function assistantContent(event: Event | undefined): { text: string | null; actions: number } {
  if (event?.eventType !== "session_output") return { text: null, actions: 0 };
  const payload = asJsonObject(event.payload);
  if (payload?.type !== "assistant") return { text: null, actions: 0 };
  const message = asJsonObject(payload.message);
  if (!Array.isArray(message?.content)) return { text: null, actions: 0 };

  const text: string[] = [];
  let actions = 0;
  for (const value of message.content) {
    const block = asJsonObject(value);
    if (block?.type === "text" && typeof block.text === "string" && block.text.trim()) {
      text.push(block.text.trim());
    } else if (block?.type === "tool_use") {
      actions += 1;
    }
  }
  return { text: text.length > 0 ? text.join("\n\n") : null, actions };
}

export function buildCompactChatSummary(
  nodes: SessionNode[],
  events: Record<string, Event>,
): CompactChatSummary {
  const summary: CompactChatSummary = {
    userText: null,
    assistantText: null,
    actionCount: 0,
  };

  for (const node of nodes) {
    if (node.kind === "event") {
      const nextUserText = userText(events[node.id]);
      if (nextUserText) {
        summary.userText = nextUserText;
        summary.assistantText = null;
        summary.actionCount = 0;
        continue;
      }

      const content = assistantContent(events[node.id]);
      if (content.text) summary.assistantText = content.text;
      summary.actionCount += content.actions;
      continue;
    }

    if (node.kind === "readglob-group") {
      summary.actionCount += node.items.length;
    } else {
      summary.actionCount += 1;
    }
  }

  return summary;
}
