import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inspectTraceGitHooksMock = vi.fn();
const installTraceGitHooksMock = vi.fn();
const uninstallTraceGitHooksMock = vi.fn();
const ensureHookRunnerEntrypointMock = vi.fn();

vi.mock("@trace/shared/git-hooks", () => ({
  inspectTraceGitHooks: inspectTraceGitHooksMock,
  installTraceGitHooks: installTraceGitHooksMock,
  uninstallTraceGitHooks: uninstallTraceGitHooksMock,
}));

vi.mock("./hook-runtime.js", () => ({
  ensureHookRunnerEntrypoint: ensureHookRunnerEntrypointMock,
}));

describe("repo hooks", () => {
  beforeEach(() => {
    inspectTraceGitHooksMock.mockReset();
    installTraceGitHooksMock.mockReset();
    uninstallTraceGitHooksMock.mockReset();
    ensureHookRunnerEntrypointMock.mockReset();
    ensureHookRunnerEntrypointMock.mockReturnValue("/tmp/trace-hooks-runner");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not throw from best-effort hook installation failures", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    installTraceGitHooksMock.mockRejectedValue(
      new Error("ENOTDIR: not a directory, mkdir '/tmp/repo/.git/hooks'"),
    );

    const { installOrRepairRepoHooksBestEffort } = await import("./repo-hooks.js");

    await expect(
      installOrRepairRepoHooksBestEffort("/tmp/repo", "session worktree creation"),
    ).resolves.toBeUndefined();

    expect(installTraceGitHooksMock).toHaveBeenCalledWith(
      "/tmp/repo",
      "/tmp/trace-hooks-runner",
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed to install Trace hooks during session worktree creation"),
    );
  });
});
