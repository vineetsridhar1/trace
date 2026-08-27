import { describe, expect, it, vi } from "vitest";
import { CodingToolExecutableRegistry } from "./coding-tool-executables.js";

describe("CodingToolExecutableRegistry", () => {
  it("atomically resolves login-shell commands and manual overrides", async () => {
    const warn = vi.fn();
    const registry = new CodingToolExecutableRegistry({
      hydratePath: async () => ({ loaded: true, error: null }),
      readOverrides: () => ({ codex: "/custom/codex" }),
      resolveCommand: (command) => `/shell/${command}`,
      isExecutable: (executablePath) => executablePath !== "/custom/missing",
      warn,
    });

    await registry.refresh();

    expect(registry.get("claude_code")).toEqual({
      executablePath: "/shell/claude",
      executableSource: "automatic",
      executableOverride: null,
    });
    expect(registry.get("codex")).toEqual({
      executablePath: "/custom/codex",
      executableSource: "override",
      executableOverride: "/custom/codex",
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps an invalid override visible without silently using another binary", async () => {
    const registry = new CodingToolExecutableRegistry({
      hydratePath: async () => ({ loaded: false, error: "shell timed out" }),
      readOverrides: () => ({ claude_code: "/custom/missing" }),
      resolveCommand: (command) => `/shell/${command}`,
      isExecutable: () => false,
      warn: vi.fn(),
    });

    await registry.refresh();

    expect(registry.get("claude_code")).toEqual({
      executablePath: null,
      executableSource: null,
      executableOverride: "/custom/missing",
    });
  });

  it("coalesces concurrent refreshes", async () => {
    let resolveHydration!: (result: { loaded: boolean; error: string | null }) => void;
    const hydratePath = vi.fn(
      () =>
        new Promise<{ loaded: boolean; error: string | null }>((resolve) => {
          resolveHydration = resolve;
        }),
    );
    const registry = new CodingToolExecutableRegistry({
      hydratePath,
      readOverrides: () => ({}),
      resolveCommand: () => null,
      isExecutable: () => false,
      warn: vi.fn(),
    });

    const first = registry.refresh();
    const second = registry.refresh();
    expect(hydratePath).toHaveBeenCalledOnce();
    resolveHydration({ loaded: true, error: null });
    await Promise.all([first, second]);
  });

  it("can queue a fresh resolution after an in-flight refresh", async () => {
    let executablePath = "/old/claude";
    let finishFirstHydration!: () => void;
    let hydrationCount = 0;
    const registry = new CodingToolExecutableRegistry({
      hydratePath: () => {
        hydrationCount += 1;
        if (hydrationCount === 1) {
          return new Promise((resolve) => {
            finishFirstHydration = () => resolve({ loaded: true, error: null });
          });
        }
        return Promise.resolve({ loaded: true, error: null });
      },
      readOverrides: () => ({}),
      resolveCommand: (command) => (command === "claude" ? executablePath : null),
      isExecutable: () => true,
      warn: vi.fn(),
    });

    const initialRefresh = registry.refresh();
    const queuedRefresh = registry.refreshAfterCurrent();
    executablePath = "/new/claude";
    finishFirstHydration();
    await Promise.all([initialRefresh, queuedRefresh]);

    expect(hydrationCount).toBe(2);
    expect(registry.get("claude_code").executablePath).toBe("/new/claude");
  });
});
