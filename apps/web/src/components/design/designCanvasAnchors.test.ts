import { describe, expect, it } from "vitest";
import type { Event } from "@trace/gql";
import {
  buildDesignArtifactBootstrapUrl,
  buildDesignArtifactPublicUrlFromOrigin,
  designCommentsForPreview,
  designCommentFromEvent,
  getDesignArtifactPreviewMode,
  normalizeDesignAnchor,
  streamingArtifactsFromEvents,
  type DesignComment,
} from "./DesignCanvas";

describe("design canvas anchors", () => {
  it("normalizes bootstrap element-selected anchors", () => {
    expect(normalizeDesignAnchor({ id: "hero-title", text: "Welcome" })).toEqual({
      type: "element",
      dataEl: "hero-title",
      text: "Welcome",
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
        anchor: { type: "element", dataEl: "hero-title", text: "Hero" },
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
      anchor: normalizeDesignAnchor({ type: "element", dataEl: "hero-title", text: "Hero" }),
      sendToAgent: true,
      timestamp: "2026-07-09T10:00:00.000Z",
    };

    expect(designCommentsForPreview([comment])).toEqual([
      {
        id: "event-2",
        body: "Tighten the headline",
        anchor: { type: "element", dataEl: "hero-title", text: "Hero" },
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
});
