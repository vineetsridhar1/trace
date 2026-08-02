import type { Event } from "@trace/gql";
import { describe, expect, it } from "vitest";
import { findLatestVisualPlanArtifact } from "./visualPlanReview";

function artifactEvent(id: string, type = "trace.visual-plan.v1"): Event {
  return {
    id: `event-${id}`,
    scopeType: "session",
    scopeId: "session-1",
    eventType: "artifact_created",
    payload: {
      artifact: {
        id,
        sessionId: "session-1",
        type,
        key: "primary",
        createdAt: `2026-08-02T00:00:0${id}.000Z`,
        manifest: {
          schemaVersion: 1,
          files: [{ path: "plan.html", mediaType: "text/html", size: 1, digest: "digest" }],
        },
      },
    },
    actor: { type: "agent", id: "agent-1", name: null, avatarUrl: null },
    parentId: null,
    timestamp: `2026-08-02T00:00:0${id}.000Z`,
    metadata: null,
  };
}

describe("findLatestVisualPlanArtifact", () => {
  it("finds the newest plan directly from timeline events", () => {
    const first = artifactEvent("1");
    const image = artifactEvent("2", "trace.image.v1");
    const latest = artifactEvent("3");
    const events = { [first.id]: first, [image.id]: image, [latest.id]: latest };

    expect(findLatestVisualPlanArtifact([first.id, image.id, latest.id], events)?.id).toBe("3");
  });

  it("returns null when the timeline has no plan", () => {
    const image = artifactEvent("1", "trace.image.v1");

    expect(findLatestVisualPlanArtifact([image.id], { [image.id]: image })).toBeNull();
  });
});
