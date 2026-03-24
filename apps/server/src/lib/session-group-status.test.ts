import { describe, expect, it } from "vitest";
import { deriveSessionGroupStatus } from "./session-group-status.js";

describe("deriveSessionGroupStatus", () => {
  it("prioritizes needs_input over review and in_progress", () => {
    expect(
      deriveSessionGroupStatus(
        [
          { agentStatus: "done", sessionStatus: "needs_input" },
          { agentStatus: "active", sessionStatus: "in_progress" },
        ],
        "https://github.com/trace/trace/pull/123",
      ),
    ).toBe("needs_input");
  });

  it("prioritizes in_review over in_progress when no session needs input", () => {
    expect(
      deriveSessionGroupStatus(
        [{ agentStatus: "active", sessionStatus: "in_progress" }],
        "https://github.com/trace/trace/pull/123",
      ),
    ).toBe("in_review");
  });

  it("falls back to in_progress before failed and stopped", () => {
    expect(
      deriveSessionGroupStatus(
        [
          { agentStatus: "done", sessionStatus: "in_progress" },
          { agentStatus: "failed", sessionStatus: "in_progress" },
          { agentStatus: "stopped", sessionStatus: "in_progress" },
        ],
        null,
      ),
    ).toBe("in_progress");
  });
});
