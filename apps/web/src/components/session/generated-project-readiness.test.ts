import { describe, expect, it } from "vitest";
import { isGeneratedProjectCanvasReady } from "./generated-project-readiness";

describe("isGeneratedProjectCanvasReady", () => {
  it("keeps the canvas hidden until the AI starts working", () => {
    expect(isGeneratedProjectCanvasReady("not_started", "connected", "connected")).toBe(false);
    expect(isGeneratedProjectCanvasReady("preparing", "connected", "connected")).toBe(false);
  });

  it("reveals the canvas as soon as the AI starts so startup and HMR are visible", () => {
    expect(isGeneratedProjectCanvasReady("active", "connected", "provisioning")).toBe(true);
    expect(isGeneratedProjectCanvasReady("active", "degraded", "connected")).toBe(true);
    expect(isGeneratedProjectCanvasReady("active", "provisioning", "booting")).toBe(true);
  });

  it("restores the canvas after an AI run has finished", () => {
    expect(isGeneratedProjectCanvasReady("done", undefined, "connected")).toBe(true);
    expect(isGeneratedProjectCanvasReady("failed", null, "connected")).toBe(true);
    expect(isGeneratedProjectCanvasReady("stopped", null, "booting")).toBe(false);
  });
});
