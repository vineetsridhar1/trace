import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCodingToolsStore } from "./coding-tools";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function status(executablePath: string, source: "automatic" | "override") {
  return {
    tool: "claude_code",
    label: "Claude Code",
    status: "installed" as const,
    installedVersion: "2.1.229",
    latestVersion: "2.1.229",
    executablePath,
    executableSource: source,
    executableOverride: source === "override" ? executablePath : null,
  };
}

describe("coding tool status request ordering", () => {
  beforeEach(() => {
    useCodingToolsStore.setState({
      statuses: null,
      checking: false,
      operations: {},
      failures: {},
      recentlyUpdated: [],
      lastCheckedAt: null,
    });
  });

  it("does not let an older check overwrite a newer executable selection", async () => {
    const check = deferred<DesktopCodingToolStatus[]>();
    const choose = deferred<DesktopCodingToolStatus[] | null>();
    const trace = {
      getCodingToolStatuses: vi.fn(() => check.promise),
      chooseCodingToolExecutable: vi.fn(() => choose.promise),
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { trace: trace as unknown as TraceElectronBridge },
    });

    const olderRequest = useCodingToolsStore.getState().check();
    const newerRequest = useCodingToolsStore.getState().chooseExecutable("claude_code");

    check.resolve([status("/old/claude", "automatic")]);
    await olderRequest;
    expect(useCodingToolsStore.getState().statuses).toBeNull();
    expect(useCodingToolsStore.getState().checking).toBe(true);

    choose.resolve([status("/new/claude", "override")]);
    await newerRequest;
    expect(useCodingToolsStore.getState().statuses).toEqual([
      status("/new/claude", "override"),
    ]);
    expect(useCodingToolsStore.getState().checking).toBe(false);
  });
});
