import { describe, expect, it } from "vitest";
import { getSessionGroupDisplayStatus } from "./sessionStatus";

describe("getSessionGroupDisplayStatus", () => {
  it("keeps lifecycle status separate from a failed agent", () => {
    expect(
      getSessionGroupDisplayStatus(
        ["needs_input"],
        ["failed"],
      ),
    ).toBe("needs_input");
  });

  it("reports the pipeline status independently of agent activity", () => {
    expect(
      getSessionGroupDisplayStatus(["in_progress"], ["active", "failed"]),
    ).toBe("in_progress");
  });

  it("keeps a group in review while an agent is active", () => {
    expect(
      getSessionGroupDisplayStatus(
        ["in_review"],
        ["active"],
      ),
    ).toBe("in_review");
  });
});
