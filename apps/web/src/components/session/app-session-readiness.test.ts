import { describe, expect, it } from "vitest";
import { isAppCloudReady } from "./app-session-readiness";

describe("isAppCloudReady", () => {
  it("keeps the canvas hidden while the selected session is provisioning", () => {
    expect(isAppCloudReady("provisioning", "connected")).toBe(false);
  });

  it("reveals the canvas when the selected session connects", () => {
    expect(isAppCloudReady("connected", "provisioning")).toBe(true);
    expect(isAppCloudReady("degraded", "connected")).toBe(true);
  });

  it("falls back to group readiness when session state is unavailable", () => {
    expect(isAppCloudReady(undefined, "connected")).toBe(true);
    expect(isAppCloudReady(null, "booting")).toBe(false);
  });
});
