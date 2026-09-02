import { describe, expect, it } from "vitest";
import { hasReadyWorkspace, workspaceState } from "./workspace-readiness.js";

describe("workspace readiness", () => {
  it("accepts legacy connected rows with a workdir", () => {
    expect(hasReadyWorkspace({ state: "connected" }, "/workspaces/ibex-2")).toBe(true);
  });

  it("rejects stale paths while preparation is active or failed", () => {
    expect(
      hasReadyWorkspace({ state: "connected", workspaceState: "preparing" }, "/workspaces/ibex-2"),
    ).toBe(false);
    expect(
      hasReadyWorkspace({ state: "connected", workspaceState: "failed" }, "/workspaces/ibex-2"),
    ).toBe(false);
  });

  it("requires both runtime connectivity and a workspace path", () => {
    expect(
      hasReadyWorkspace({ state: "disconnected", workspaceState: "ready" }, "/workspaces/ibex-2"),
    ).toBe(false);
    expect(hasReadyWorkspace({ state: "connected", workspaceState: "ready" }, null)).toBe(false);
  });

  it("ignores invalid workspace state values", () => {
    expect(workspaceState({ workspaceState: "unknown" })).toBeUndefined();
  });
});
