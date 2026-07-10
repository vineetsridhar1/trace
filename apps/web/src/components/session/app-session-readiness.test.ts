import { describe, expect, it } from "vitest";
import { isAppCanvasReady } from "./app-session-readiness";

describe("isAppCanvasReady", () => {
  it("keeps the canvas hidden until the AI starts working", () => {
    expect(isAppCanvasReady("not_started", "connected", "connected")).toBe(false);
    expect(isAppCanvasReady("preparing", "connected", "connected")).toBe(false);
  });

  it("reveals the canvas when the AI is active and its cloud is ready", () => {
    expect(isAppCanvasReady("active", "connected", "provisioning")).toBe(true);
    expect(isAppCanvasReady("active", "degraded", "connected")).toBe(true);
    expect(isAppCanvasReady("active", "provisioning", "connected")).toBe(false);
  });

  it("restores the canvas after an AI run has finished", () => {
    expect(isAppCanvasReady("done", undefined, "connected")).toBe(true);
    expect(isAppCanvasReady("failed", null, "connected")).toBe(true);
    expect(isAppCanvasReady("stopped", null, "booting")).toBe(false);
  });
});
