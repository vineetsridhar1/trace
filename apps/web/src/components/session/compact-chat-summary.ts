import type { Event } from "@trace/gql";
import { asJsonObject, attachmentKeysFromPayload } from "@trace/shared";
import type { SessionListNode } from "./SessionMessageList";

export interface CompactChatSummary {
  userText: string | null;
  assistantText: string | null;
  actionCount: number;
}

function userTurn(event: Event | undefined): { present: boolean; text: string | null } {
  const payload = asJsonObject(event?.payload);
  if (event?.eventType !== "message_sent" && event?.eventType !== "session_started") {
    return { present: false, text: null };
  }

  const rawText = event.eventType === "message_sent" ? payload?.text : payload?.prompt;
  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (text) return { present: true, text };

  const attachmentCount = attachmentKeysFromPayload(payload).length;
  return {
    present: true,
    text:
      attachmentCount === 0
        ? null
        : attachmentCount === 1
          ? "Image prompt"
          : `${attachmentCount} image prompt`,
  };
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
  nodes: SessionListNode[],
  events: Record<string, Event>,
): CompactChatSummary {
  const summary: CompactChatSummary = {
    userText: null,
    assistantText: null,
    actionCount: 0,
  };

  for (const node of nodes) {
    if (node.kind === "event") {
      const nextUserTurn = userTurn(events[node.id]);
      if (nextUserTurn.present) {
        summary.userText = nextUserTurn.text;
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
    } else if (node.kind === "collapsed-events") {
      summary.actionCount += node.collapsedRanges.reduce(
        (count, range) => count + range.actionCount,
        0,
      );
    } else {
      summary.actionCount += 1;
    }
  }

  return summary;
}
