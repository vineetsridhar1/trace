import { describe, expect, it } from "vitest";
import { designEventBadgeText } from "./SessionMessage";

describe("designEventBadgeText", () => {
  it("renders design generation failures with direction context", () => {
    expect(
      designEventBadgeText("design_generation_failed", {
        directionLabel: "Bold editorial direction",
        error: "model unavailable",
      }),
    ).toBe("Bold editorial direction failed: model unavailable");
  });

  it("renders design artifact lifecycle events", () => {
    expect(designEventBadgeText("design_artifact_created", {})).toBe("Design artifact created");
    expect(designEventBadgeText("design_artifact_created", { parentArtifactId: "artifact-1" })).toBe(
      "Design artifact iteration created",
    );
    expect(designEventBadgeText("design_artifact_updated", { published: true })).toBe(
      "Design artifact published",
    );
    expect(designEventBadgeText("design_artifact_updated", { tokens: { "--trace-accent": "red" } })).toBe(
      "Design tokens tweaked",
    );
  });

  it("renders comments, preview errors, export requests, and promotion", () => {
    expect(designEventBadgeText("design_comment_added", { sendToAgent: true })).toBe(
      "Design comment sent to agent",
    );
    expect(designEventBadgeText("design_artifact_error", { message: "ReferenceError" })).toBe(
      "Artifact preview error: ReferenceError",
    );
    expect(designEventBadgeText("design_export_requested", {})).toBe("PDF export requested");
    expect(designEventBadgeText("design_artifact_promoted", {})).toBe(
      "Design artifact promoted to coding session",
    );
  });

  it("ignores unrelated events", () => {
    expect(designEventBadgeText("message_sent", {})).toBeNull();
  });
});
