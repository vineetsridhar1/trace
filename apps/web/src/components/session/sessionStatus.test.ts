import { describe, expect, it } from "vitest";
import {
  canSendMessage,
  getDisplayAgentStatus,
  getDisplaySessionStatus,
  getSessionGroupAgentStatus,
  getSessionGroupDisplayStatus,
} from "./sessionStatus";

describe("getSessionGroupDisplayStatus", () => {
  it("keeps lifecycle status separate from a failed agent", () => {
    expect(getSessionGroupDisplayStatus(["needs_input"])).toBe("needs_input");
    expect(getSessionGroupAgentStatus(["failed"])).toBe("failed");
  });

  it("reports the pipeline status independently of agent activity", () => {
    expect(getSessionGroupDisplayStatus(["in_progress"])).toBe("in_progress");
    expect(getSessionGroupAgentStatus(["active", "failed"])).toBe("active");
  });

  it("keeps a group in review while an agent is active", () => {
    expect(getSessionGroupDisplayStatus(["in_review"])).toBe("in_review");
    expect(getSessionGroupAgentStatus(["active"])).toBe("active");
  });

  it("uses review status whenever a group has an attached PR", () => {
    expect(
      getSessionGroupDisplayStatus(
        ["in_progress"],
        undefined,
        "https://github.com/trace/trace/pull/123",
      ),
    ).toBe("in_review");
  });

  it("keeps needs input ahead of an attached PR", () => {
    expect(
      getSessionGroupDisplayStatus(
        ["needs_input"],
        undefined,
        "https://github.com/trace/trace/pull/123",
      ),
    ).toBe("needs_input");
  });

  it("keeps preparation in agent activity rather than pipeline status", () => {
    const preparation = {
      workdir: null,
      lastUserMessageAt: "2026-08-05T12:00:00.000Z",
      connection: { state: "pending" },
    };

    expect(getDisplaySessionStatus("in_progress")).toBe("in_progress");
    expect(getDisplayAgentStatus("not_started", "in_progress", null, preparation)).toBe(
      "preparing",
    );
  });
});

describe("canSendMessage", () => {
  it("allows a disconnected idle session to trigger runtime recovery", () => {
    expect(canSendMessage("done", { state: "disconnected" }, false)).toBe(true);
  });

  it("allows an older session whose cached agent status is missing", () => {
    expect(canSendMessage(undefined, { state: "connected" }, false)).toBe(true);
  });

  it("keeps a deleted worktree read-only", () => {
    expect(canSendMessage("done", { state: "connected" }, true)).toBe(false);
  });
});
