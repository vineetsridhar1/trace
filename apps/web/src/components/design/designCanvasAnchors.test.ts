import { describe, expect, it } from "vitest";
import type { Event } from "@trace/gql";
import {
  buildDesignIterationPromptDefault,
  buildDesignArtifactBootstrapUrl,
  buildDesignArtifactPublicUrlFromOrigin,
  clampDesignPreviewScale,
  designCommentsForPreview,
  designCommentFromEvent,
  getDesignArtifactPreviewMode,
  getArtifactPlacements,
  getArtifactLineageStrip,
  getDesignPreviewDeviceFrame,
  normalizeDesignAnchor,
  promotedSessionTarget,
  streamingArtifactsFromEvents,
  updateDesignArtifactSelection,
  type DesignComment,
} from "./DesignCanvas";

describe("design canvas anchors", () => {
  it("normalizes bootstrap element-selected anchors", () => {
    expect(
      normalizeDesignAnchor({
        id: "hero-title",
        text: "Welcome",
        bounds: { left: 12, top: 24, width: 320, height: 80, x: 0.1, y: 0.2 },
      }),
    ).toEqual({
      type: "element",
      dataEl: "hero-title",
      text: "Welcome",
      bounds: { left: 12, top: 24, width: 320, height: 80, x: 0.1, y: 0.2 },
    });
  });

  it("rejects element anchors without a data-el id", () => {
    expect(normalizeDesignAnchor({ type: "element", text: "Missing id" })).toBeNull();
  });

  it("parses design comment events with anchors", () => {
    const event = {
      id: "event-1",
      scopeType: "session",
      scopeId: "session-1",
      eventType: "design_comment_added",
      payload: {
        artifactId: "artifact-1",
        body: "Tighten the header spacing.",
        anchor: {
          type: "element",
          dataEl: "hero-title",
          text: "Hero",
          bounds: { left: 10, top: 20, width: 100, height: 40 },
        },
        sendToAgent: true,
      },
      actor: {
        __typename: "User",
        id: "user-1",
        name: "Designer",
        avatarUrl: null,
      },
      timestamp: "2026-07-09T10:00:00.000Z",
    } as unknown as Event;

    expect(designCommentFromEvent(event)).toEqual({
      id: "event-1",
      artifactId: "artifact-1",
      body: "Tighten the header spacing.",
      anchor: {
        type: "element",
        dataEl: "hero-title",
        text: "Hero",
        bounds: { left: 10, top: 20, width: 100, height: 40 },
      },
      sendToAgent: true,
      timestamp: "2026-07-09T10:00:00.000Z",
    });
  });

  it("preserves artifact coordinates for preview comment pins", () => {
    const comment: DesignComment = {
      id: "event-1",
      artifactId: "artifact-1",
      body: "Move this lower",
      anchor: normalizeDesignAnchor({ type: "artifact", x: 0.4, y: 0.2 }),
      sendToAgent: false,
      timestamp: "2026-07-09T10:00:00.000Z",
    };

    expect(designCommentsForPreview([comment])).toEqual([
      {
        id: "event-1",
        body: "Move this lower",
        anchor: { type: "artifact", x: 0.4, y: 0.2 },
      },
    ]);
  });

  it("passes element anchors through the preview comment payload", () => {
    const comment: DesignComment = {
      id: "event-2",
      artifactId: "artifact-1",
      body: "Tighten the headline",
      anchor: normalizeDesignAnchor({
        type: "element",
        dataEl: "hero-title",
        text: "Hero",
        bounds: { left: 10, top: 20, width: 100, height: 40 },
      }),
      sendToAgent: true,
      timestamp: "2026-07-09T10:00:00.000Z",
    };

    expect(designCommentsForPreview([comment])).toEqual([
      {
        id: "event-2",
        body: "Tighten the headline",
        anchor: {
          type: "element",
          dataEl: "hero-title",
          text: "Hero",
          bounds: { left: 10, top: 20, width: 100, height: 40 },
        },
      },
    ]);
  });

  it("uses srcDoc only as an explicit development fallback", () => {
    expect(getDesignArtifactPreviewMode("https://usercontent.example", false)).toBe("bootstrap");
    expect(getDesignArtifactPreviewMode(null, true)).toBe("srcdoc");
    expect(getDesignArtifactPreviewMode(null, false)).toBe("unavailable");
  });

  it("builds nonce-bound user-content bootstrap URLs for artifact previews", () => {
    const url = buildDesignArtifactBootstrapUrl({
      artifactId: "artifact-1",
      userContentOrigin: "https://traceusercontent.test",
      parentOrigin: "https://app.trace.test",
      nonce: "nonce-1",
    });

    expect(url).toBe(
      "https://artifact-1.traceusercontent.test/_bootstrap?parentOrigin=https%3A%2F%2Fapp.trace.test&nonce=nonce-1",
    );
  });

  it("builds published artifact URLs from user-content origin unless server supplies one", () => {
    expect(
      buildDesignArtifactPublicUrlFromOrigin(
        {
          id: "artifact-1",
          publishedAt: "2026-07-09T10:00:00.000Z",
          publicUrl: null,
        },
        "https://traceusercontent.test",
      ),
    ).toBe("https://artifact-1.traceusercontent.test/");

    expect(
      buildDesignArtifactPublicUrlFromOrigin(
        {
          id: "artifact-1",
          publishedAt: "2026-07-09T10:00:00.000Z",
          publicUrl: "https://cdn.trace.test/artifact-1/",
        },
        "https://traceusercontent.test",
      ),
    ).toBe("https://cdn.trace.test/artifact-1/");
  });

  it("places sibling variants side-by-side and iterations as vertical lineage", () => {
    const placements = getArtifactPlacements([
      makeCanvasArtifact("direction-a"),
      makeCanvasArtifact("direction-b"),
      makeCanvasArtifact("a-child", "direction-a"),
      makeCanvasArtifact("a-grandchild", "a-child"),
      makeCanvasArtifact("b-child", "direction-b"),
    ]);
    const byId = new Map(placements.map((placement) => [placement.artifact.id, placement]));

    expect(byId.get("direction-a")).toMatchObject({ x: 0, y: 0 });
    expect(byId.get("direction-b")?.x).toBeGreaterThan(byId.get("direction-a")?.x ?? 0);
    expect(byId.get("direction-b")?.y).toBe(0);

    expect(byId.get("a-child")?.x).toBe(byId.get("direction-a")?.x);
    expect(byId.get("a-child")?.y).toBeGreaterThan(byId.get("direction-a")?.y ?? 0);
    expect(byId.get("a-grandchild")?.x).toBe(byId.get("direction-a")?.x);
    expect(byId.get("a-grandchild")?.y).toBeGreaterThan(byId.get("a-child")?.y ?? 0);

    expect(byId.get("b-child")?.x).toBe(byId.get("direction-b")?.x);
    expect(byId.get("b-child")?.y).toBeGreaterThan(byId.get("direction-b")?.y ?? 0);
  });

  it("places artifacts with missing parents as root variants", () => {
    const placements = getArtifactPlacements([
      makeCanvasArtifact("direction-a"),
      makeCanvasArtifact("orphan", "missing-parent"),
    ]);

    expect(placements.map((placement) => placement.artifact.id)).toEqual(["direction-a", "orphan"]);
    expect(placements[0]?.y).toBe(0);
    expect(placements[1]?.y).toBe(0);
    expect(placements[1]?.x).toBeGreaterThan(placements[0]?.x ?? 0);
  });

  it("keeps focus-mode lineage to the selected artifact branch", () => {
    const artifacts = [
      makeCanvasArtifact("direction-a"),
      makeCanvasArtifact("direction-b"),
      makeCanvasArtifact("a-child", "direction-a"),
      makeCanvasArtifact("a-grandchild", "a-child"),
      makeCanvasArtifact("b-child", "direction-b"),
    ];

    expect(getArtifactLineageStrip(artifacts, "a-child").map((artifact) => artifact.id)).toEqual([
      "direction-a",
      "a-child",
      "a-grandchild",
    ]);
    expect(getArtifactLineageStrip(artifacts, "missing")).toEqual([]);
  });

  it("tracks single and comparative artifact selection", () => {
    expect(updateDesignArtifactSelection([], "direction-a", false)).toEqual(["direction-a"]);
    expect(updateDesignArtifactSelection(["direction-a"], "direction-b", true)).toEqual([
      "direction-a",
      "direction-b",
    ]);
    expect(
      updateDesignArtifactSelection(["direction-a", "direction-b"], "direction-c", true),
    ).toEqual(["direction-b", "direction-c"]);
    expect(
      updateDesignArtifactSelection(["direction-a", "direction-b"], "direction-a", true),
    ).toEqual(["direction-b"]);
  });

  it("builds comparative prompt defaults for two selected artifacts", () => {
    expect(buildDesignIterationPromptDefault([makeCanvasArtifact("direction-a")])).toBe(
      "Prompt for direction-a",
    );
    expect(
      buildDesignIterationPromptDefault([
        makeCanvasArtifact("direction-a"),
        makeCanvasArtifact("direction-b"),
      ]),
    ).toContain("Merge direction-a with direction-b");
  });

  it("defines stable per-card preview frames and zoom bounds", () => {
    expect(getDesignPreviewDeviceFrame("desktop")).toMatchObject({ width: 1280, height: 900 });
    expect(getDesignPreviewDeviceFrame("tablet")).toMatchObject({ width: 820, height: 1080 });
    expect(getDesignPreviewDeviceFrame("mobile")).toMatchObject({ width: 390, height: 844 });
    expect(clampDesignPreviewScale(0.1)).toBe(0.35);
    expect(clampDesignPreviewScale(1.5)).toBe(1.25);
    expect(clampDesignPreviewScale(0.8)).toBe(0.8);
  });

  it("shows failed design generations as visible canvas artifacts", () => {
    const event = {
      id: "event-failed",
      scopeType: "session",
      scopeId: "session-1",
      eventType: "design_generation_failed",
      payload: {
        generationId: "generation-1",
        sessionGroupId: "group-1",
        parentArtifactId: null,
        prompt: "Make three dashboards",
        directionIndex: 1,
        directionCount: 3,
        directionLabel: "Operational dashboard",
        error: 'Model failed <script>alert("x")</script>',
      },
      actor: {
        __typename: "User",
        id: "user-1",
        name: "Designer",
        avatarUrl: null,
      },
      timestamp: "2026-07-09T10:00:00.000Z",
    } as unknown as Event;

    const artifacts = streamingArtifactsFromEvents({ [event.id]: event }, []);

    expect(artifacts["generation-1"]).toMatchObject({
      id: "failed:generation-1",
      generationId: "generation-1",
      failed: true,
      title: "Operational dashboard",
      prompt: "Make three dashboards",
      metadata: {
        failed: true,
        error: 'Model failed <script>alert("x")</script>',
      },
    });
    expect(artifacts["generation-1"]?.html).toContain("Design generation failed");
    expect(artifacts["generation-1"]?.html).toContain(
      "Model failed &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(artifacts["generation-1"]?.html).not.toContain("<script>");
  });

  it("extracts promoted coding session navigation targets", () => {
    expect(
      promotedSessionTarget({
        id: "session-promoted",
        sessionGroupId: "group-promoted",
      }),
    ).toEqual({
      sessionId: "session-promoted",
      sessionGroupId: "group-promoted",
    });

    expect(promotedSessionTarget({ id: "session-promoted" })).toBeNull();
    expect(promotedSessionTarget(null)).toBeNull();
  });
});

function makeCanvasArtifact(id: string, parentArtifactId: string | null = null) {
  return {
    id,
    sessionGroupId: "group-1",
    parentArtifactId,
    title: id,
    prompt: `Prompt for ${id}`,
    contentType: "text/html",
    html: "<!doctype html><html><body></body></html>",
    metadata: {},
    publishedAt: null,
    publicUrl: null,
    createdAt: "2026-07-09T10:00:00.000Z",
    updatedAt: "2026-07-09T10:00:00.000Z",
  };
}
