import { describe, expect, it } from "vitest";
import { isAnimationCanvasReady, isAppCanvasReady } from "./app-session-readiness";

describe("isAppCanvasReady", () => {
  it("keeps the preview hidden until the app session is connected", () => {
    expect(isAppCanvasReady("not_started", "connected", "connected")).toBe(false);
    expect(isAppCanvasReady("active", "provisioning", "connected")).toBe(false);
  });

  it("reveals the preview once an active or completed session is connected", () => {
    expect(isAppCanvasReady("active", "connected", "provisioning")).toBe(true);
    expect(isAppCanvasReady("done", undefined, "connected")).toBe(true);
  });
});

describe("isAnimationCanvasReady", () => {
  it("reveals the canvas from the saved bundle when no container is live", () => {
    expect(isAnimationCanvasReady(false, "https://app.test/animation-previews/groups/g1")).toBe(
      true,
    );
  });

  it("still reveals the canvas for a live container with no saved bundle yet", () => {
    expect(isAnimationCanvasReady(true, null)).toBe(true);
  });

  it("keeps the canvas hidden with neither a live container nor a saved bundle", () => {
    expect(isAnimationCanvasReady(false, null)).toBe(false);
    expect(isAnimationCanvasReady(false, undefined)).toBe(false);
  });
});
