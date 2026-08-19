import { describe, expect, it } from "vitest";
import { resolveBridgeWorkdir } from "./bridge.js";

describe("resolveBridgeWorkdir", () => {
  it("treats a missing mode as prepared and refuses a server cwd", () => {
    expect(
      resolveBridgeWorkdir({
        cwd: "/stale/server/path",
        homeDir: "/home/runtime",
      }),
    ).toBeNull();
  });

  it("uses only the bridge-tracked path for prepared workspaces", () => {
    expect(
      resolveBridgeWorkdir({
        workspaceMode: "prepared",
        cwd: "/stale/server/path",
        preparedWorkdir: "/prepared/worktree",
        homeDir: "/home/runtime",
      }),
    ).toBe("/prepared/worktree");
  });

  it("uses home only when the service explicitly opts in", () => {
    expect(
      resolveBridgeWorkdir({
        workspaceMode: "home",
        homeDir: "/home/runtime",
      }),
    ).toBe("/home/runtime");
  });
});
