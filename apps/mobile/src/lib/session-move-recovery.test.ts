import { describe, expect, it } from "vitest";
import { shouldAllowUnverifiedSourceGitStatusForMove } from "./session-move-recovery";

describe("shouldAllowUnverifiedSourceGitStatusForMove", () => {
  it("allows unverified source status for recovery connection states", () => {
    for (const state of ["disconnected", "failed", "timed_out", "deprovision_failed"] as const) {
      expect(shouldAllowUnverifiedSourceGitStatusForMove({ state })).toBe(true);
    }
  });

  it("keeps ordinary move states verified by default", () => {
    for (const state of ["connected", "pending", "provisioning", "connecting"] as const) {
      expect(shouldAllowUnverifiedSourceGitStatusForMove({ state })).toBe(false);
    }
  });

  it("falls back to the group connection state", () => {
    expect(
      shouldAllowUnverifiedSourceGitStatusForMove(null, { state: "disconnected" }),
    ).toBe(true);
  });
});
