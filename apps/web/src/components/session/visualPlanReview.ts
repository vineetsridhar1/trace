import type { Artifact, Event } from "@trace/gql";
import { asJsonObject } from "@trace/shared";

export function findLatestVisualPlanArtifact(
  eventIds: string[],
  events: Record<string, Event | undefined>,
): Artifact | null {
  for (let index = eventIds.length - 1; index >= 0; index -= 1) {
    const event = events[eventIds[index]];
    if (event?.eventType !== "artifact_created") continue;

    const artifact = asJsonObject(asJsonObject(event.payload)?.artifact);
    const manifest = asJsonObject(artifact?.manifest);
    if (
      artifact?.type === "trace.visual-plan.v1" &&
      typeof artifact.id === "string" &&
      Array.isArray(manifest?.files)
    ) {
      return artifact as unknown as Artifact;
    }
  }

  return null;
}
