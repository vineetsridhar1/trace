import type { Artifact, Event } from "@trace/gql";
import { asJsonObject, hasPlanBlock, hasQuestionBlock } from "@trace/shared";

export type TimelineInputRequest =
  | { kind: "visual-plan"; artifact: Artifact }
  | { kind: "native-plan" }
  | { kind: "question" };

export function findLatestTimelineInputRequest(
  eventIds: string[],
  events: Record<string, Event | undefined>,
): TimelineInputRequest | null {
  for (let index = eventIds.length - 1; index >= 0; index -= 1) {
    const event = events[eventIds[index]];
    if (!event) continue;

    // A user message supersedes any earlier input request. This keeps a
    // collapsed question resumable across status changes until the user
    // explicitly continues the conversation.
    if (event.eventType === "message_sent") return null;

    const payload = asJsonObject(event.payload);
    if (event.eventType === "session_output" && payload) {
      if (hasQuestionBlock(payload)) return { kind: "question" };
      if (hasPlanBlock(payload)) return { kind: "native-plan" };
      continue;
    }

    if (event.eventType !== "artifact_created") continue;

    const artifact = asJsonObject(payload?.artifact);
    const manifest = asJsonObject(artifact?.manifest);
    if (
      artifact?.type === "trace.visual-plan.v1" &&
      typeof artifact.id === "string" &&
      Array.isArray(manifest?.files)
    ) {
      return { kind: "visual-plan", artifact: artifact as unknown as Artifact };
    }
  }

  return null;
}
