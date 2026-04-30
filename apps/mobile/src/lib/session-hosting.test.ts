import { describe, expect, it } from "vitest";
import { canUseMobileCloudHosting } from "./session-hosting";

describe("canUseMobileCloudHosting", () => {
  it("allows cloud sessions against hosted Trace", () => {
    expect(canUseMobileCloudHosting("hosted")).toBe(true);
  });

  it("disables cloud sessions against paired local servers", () => {
    expect(canUseMobileCloudHosting("paired_local")).toBe(false);
  });
});
