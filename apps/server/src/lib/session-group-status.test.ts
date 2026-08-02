import { describe, expect, it } from "vitest";
import { deriveSessionGroupStatus } from "./session-group-status.js";

describe("deriveSessionGroupStatus", () => {
  it("returns archived when the group has an archived timestamp", () => {
    expect(
      deriveSessionGroupStatus(
        [{ agentStatus: "active", sessionStatus: "in_progress" }],
        "https://github.com/trace/trace/pull/123",
        "2024-01-03T00:00:00.000Z",
      ),
    ).toBe("archived");
  });

  it("keeps a group in progress while another agent is active", () => {
    expect(
      deriveSessionGroupStatus(
        [
          { agentStatus: "done", sessionStatus: "needs_input" },
          { agentStatus: "active", sessionStatus: "in_progress" },
        ],
        "https://github.com/trace/trace/pull/123",
      ),
    ).toBe("in_progress");
  });

  it("keeps a group in progress while another agent is active and a PR exists", () => {
    expect(
      deriveSessionGroupStatus(
        [{ agentStatus: "active", sessionStatus: "in_progress" }],
        "https://github.com/trace/trace/pull/123",
      ),
    ).toBe("in_progress");
  });

  it("reports failed before a stale in_progress session status", () => {
    expect(
      deriveSessionGroupStatus(
        [
          { agentStatus: "done", sessionStatus: "in_progress" },
          { agentStatus: "failed", sessionStatus: "in_progress" },
          { agentStatus: "stopped", sessionStatus: "in_progress" },
        ],
        null,
      ),
    ).toBe("failed");
  });

  it("reports failed before stale needs_input and review lifecycle states", () => {
    expect(
      deriveSessionGroupStatus(
        [
          { agentStatus: "failed", sessionStatus: "needs_input" },
        ],
        "https://github.com/trace/trace/pull/123",
      ),
    ).toBe("failed");
  });
});
