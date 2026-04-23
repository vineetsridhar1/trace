import { describe, expect, it } from "vitest";
import { resolveMobileSessionHosting } from "./session-hosting";

describe("resolveMobileSessionHosting", () => {
  it("defaults hosted mobile sessions to cloud", () => {
    expect(resolveMobileSessionHosting("hosted")).toBe("cloud");
  });

  it("keeps paired local mobile sessions on local runtimes", () => {
    expect(resolveMobileSessionHosting("paired_local")).toBe("local");
  });
});
