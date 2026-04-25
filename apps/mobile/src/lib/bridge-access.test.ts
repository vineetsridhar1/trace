import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeBridgeAccessScope,
  formatCapabilities,
  getBridgeAccessApprovalExpiresAt,
  getBridgeAccessRequestExpiresAt,
  normalizeBridgeAccessApprovalScope,
} from "./bridge-access";

describe("bridge access date helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calculates request expiration windows", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-04-25T12:00:00.000Z"));

    expect(getBridgeAccessRequestExpiresAt("1h")).toBe("2026-04-25T13:00:00.000Z");
    expect(getBridgeAccessRequestExpiresAt("never")).toBeUndefined();
  });

  it("calculates approval expiration windows", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-04-25T12:00:00.000Z"));

    expect(getBridgeAccessApprovalExpiresAt("3h")).toBe("2026-04-25T15:00:00.000Z");
    expect(getBridgeAccessApprovalExpiresAt("never")).toBeUndefined();
  });
});

describe("bridge access presentation helpers", () => {
  it("formats capabilities consistently", () => {
    expect(formatCapabilities()).toBe("No access");
    expect(formatCapabilities(["session"])).toBe("Sessions");
    expect(formatCapabilities(["session", "terminal"])).toBe("Sessions + terminal");
  });

  it("describes scopes with and without a workspace name", () => {
    expect(describeBridgeAccessScope("all_sessions")).toBe("All sessions");
    expect(
      describeBridgeAccessScope("session_group", {
        name: "Mobile",
      }),
    ).toBe("Workspace: Mobile");
    expect(describeBridgeAccessScope("session_group")).toBe("Single workspace");
  });
});

describe("normalizeBridgeAccessApprovalScope", () => {
  it("keeps workspace scope when a workspace id exists", () => {
    expect(
      normalizeBridgeAccessApprovalScope("session_group", {
        id: "group-1",
      }),
    ).toEqual({
      scopeType: "session_group",
      sessionGroupId: "group-1",
    });
  });

  it("falls back to all sessions when the workspace relation is missing", () => {
    expect(normalizeBridgeAccessApprovalScope("session_group", null)).toEqual({
      scopeType: "all_sessions",
      sessionGroupId: null,
    });
  });
});
