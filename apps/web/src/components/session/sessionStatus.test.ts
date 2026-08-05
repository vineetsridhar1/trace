import { describe, expect, it } from "vitest";
import { getSessionGroupDisplayStatus } from "./sessionStatus";

describe("getSessionGroupDisplayStatus", () => {
  it("keeps lifecycle status separate from a failed agent", () => {
    expect(
      getSessionGroupDisplayStatus(
        ["needs_input"],
        ["failed"],
        "https://github.com/trace/trace/pull/123",
      ),
    ).toBe("needs_input");
  });

  it("reports the pipeline status independently of agent activity", () => {
    expect(
      getSessionGroupDisplayStatus(["in_progress"], ["active", "failed"], null),
    ).toBe("in_progress");
  });

  it("keeps a group in review while an agent is active", () => {
    expect(
      getSessionGroupDisplayStatus(
        ["in_review"],
        ["active"],
        null,
      ),
    ).toBe("in_review");
  });
});
