import { describe, expect, it } from "vitest";
import { getSessionGroupDisplayStatus } from "./sessionStatus";

describe("getSessionGroupDisplayStatus", () => {
  it("reports failed before stale non-terminal lifecycle states", () => {
    expect(
      getSessionGroupDisplayStatus(
        ["needs_input"],
        ["failed"],
        "https://github.com/trace/trace/pull/123",
      ),
    ).toBe("failed");
  });

  it("keeps a group in progress while another agent is active", () => {
    expect(
      getSessionGroupDisplayStatus(["in_progress"], ["active", "failed"], null),
    ).toBe("in_progress");
  });

  it("keeps a group in review while an agent is active and a PR exists", () => {
    expect(
      getSessionGroupDisplayStatus(
        ["in_progress"],
        ["active"],
        "https://github.com/trace/trace/pull/123",
      ),
    ).toBe("in_review");
  });
});
