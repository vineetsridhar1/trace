import { describe, expect, it } from "vitest";
import { canUseMobileCloudHosting, resolveMobileSessionHosting } from "./session-hosting";

describe("resolveMobileSessionHosting", () => {
  it("defaults hosted mobile sessions to cloud", () => {
    expect(resolveMobileSessionHosting("hosted")).toBe("cloud");
  });

  it("keeps paired local mobile sessions on local runtimes", () => {
    expect(resolveMobileSessionHosting("paired_local")).toBe("local");
  });
});

describe("canUseMobileCloudHosting", () => {
  it("allows cloud sessions against hosted Trace", () => {
    expect(canUseMobileCloudHosting("hosted")).toBe(true);
  });

  it("disables cloud sessions against paired local servers", () => {
    expect(canUseMobileCloudHosting("paired_local")).toBe(false);
  });
});
