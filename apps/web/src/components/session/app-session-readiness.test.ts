import { describe, expect, it } from "vitest";
import { isAppCanvasReady } from "./app-session-readiness";

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
