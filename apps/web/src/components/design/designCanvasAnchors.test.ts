import { describe, expect, it } from "vitest";
import type { Event } from "@trace/gql";
import {
  buildDesignArtifactBootstrapUrl,
  buildDesignArtifactPublicUrlFromOrigin,
  designCommentFromEvent,
  getDesignArtifactPreviewMode,
  normalizeDesignAnchor,
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
});
