import { describe, expect, it } from "vitest";
import { deriveSessionGroupStatus } from "./session-group-status.js";

describe("deriveSessionGroupStatus", () => {
  it("returns archived when the group has an archived timestamp", () => {
    expect(
      deriveSessionGroupStatus(
        [{ agentStatus: "active", sessionStatus: "in_progress" }],
        "2024-01-03T00:00:00.000Z",
      ),
    ).toBe("archived");
  });

  it("uses the pipeline status even while another agent is active", () => {
    expect(
      deriveSessionGroupStatus(
        [
          { agentStatus: "done", sessionStatus: "needs_input" },
          { agentStatus: "active", sessionStatus: "in_progress" },
        ],
      ),
    ).toBe("needs_input");
  });

  it("keeps a group in review while an agent is active", () => {
    expect(
      deriveSessionGroupStatus(
        [{ agentStatus: "active", sessionStatus: "in_review" }],
      ),
    ).toBe("in_review");
  });

  it("keeps the pipeline status separate from failed and stopped agents", () => {
    expect(
      deriveSessionGroupStatus(
        [
          { agentStatus: "done", sessionStatus: "in_progress" },
          { agentStatus: "failed", sessionStatus: "in_progress" },
          { agentStatus: "stopped", sessionStatus: "in_progress" },
        ],
      ),
    ).toBe("in_progress");
  });

  it("keeps review lifecycle state separate from a failed agent", () => {
    expect(
      deriveSessionGroupStatus(
        [
          { agentStatus: "failed", sessionStatus: "in_review" },
        ],
      ),
    ).toBe("in_review");
  });
});
