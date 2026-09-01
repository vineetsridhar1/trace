import { describe, expect, it } from "vitest";
import {
  getDisplayAgentStatus,
  getDisplaySessionStatus,
  getSessionGroupAgentStatus,
  getSessionGroupDisplayStatus,
  isRestartableCloudRuntime,
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

describe("isRestartableCloudRuntime", () => {
  it("allows a cloud workspace stopped by idle cleanup to restart on send", () => {
    expect(
      isRestartableCloudRuntime("cloud", {
        state: "disconnected",
        deprovisionedAt: "2026-09-01T06:07:11.627Z",
      }),
    ).toBe(true);
  });

  it("does not treat a dropped local bridge as restartable cloud compute", () => {
    expect(
      isRestartableCloudRuntime("local", {
        state: "disconnected",
        deprovisionedAt: "2026-09-01T06:07:11.627Z",
      }),
    ).toBe(false);
  });
});
