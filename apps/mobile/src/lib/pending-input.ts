import type { Event } from "@trace/gql";
import { asJsonObject, parseQuestion, type Question } from "@trace/shared";

export type PendingInputData =
  | {
      kind: "question";
      eventId: string;
      questions: Question[];
      timestamp: string;
    }
  | {
      kind: "plan";
      eventId: string;
      planContent: string;
      planFilePath: string;
      timestamp: string;
    };

/**
 * Walk events backwards to find the most recent assistant event containing
 * either a question or plan block. Mirrors the detection in
 * `packages/client-core/src/session/nodes.ts` so the pending-input bar
 * always surfaces the same block the stream node represents.
 */
export function findMostRecentPendingInput(
  eventIds: string[],
  events: Record<string, Event>,
): PendingInputData | null {
  for (let i = eventIds.length - 1; i >= 0; i--) {
    const id = eventIds[i];
    if (!id) continue;
    const ev = events[id];
    if (!ev || ev.eventType !== "session_output") continue;
    const payload = asJsonObject(ev.payload);
    if (!payload || payload.type !== "assistant") continue;
    const message = asJsonObject(payload.message);
    const blocks = message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const rawBlock of blocks) {
      const block = asJsonObject(rawBlock);
      if (!block) continue;
      if (block.type === "plan") {
        return {
          kind: "plan",
          eventId: ev.id,
          planContent: String(block.content ?? ""),
          planFilePath: String(block.filePath ?? ""),
          timestamp: ev.timestamp,
        };
      }
      if (block.type === "question") {
        const qs = Array.isArray(block.questions) ? block.questions : [];
        return {
          kind: "question",
          eventId: ev.id,
          questions: qs.map(parseQuestion),
          timestamp: ev.timestamp,
        };
      }
    }
  }
  return null;
}
