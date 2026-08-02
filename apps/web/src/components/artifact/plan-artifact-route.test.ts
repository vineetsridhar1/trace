import { describe, expect, it } from "vitest";
import { planArtifactIdFromPath, planArtifactPath } from "./plan-artifact-route";

describe("plan artifact route", () => {
  it("builds and parses a plan viewer path", () => {
    const path = planArtifactPath("artifact / one");

    expect(path).toBe("/plans/artifact%20%2F%20one");
    expect(planArtifactIdFromPath(path)).toBe("artifact / one");
  });

  it("ignores unrelated and malformed paths", () => {
    expect(planArtifactIdFromPath("/artifacts/artifact-1")).toBeNull();
    expect(planArtifactIdFromPath("/plans/%E0%A4%A")).toBeNull();
  });
});
