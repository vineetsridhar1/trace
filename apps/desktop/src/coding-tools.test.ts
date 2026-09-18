import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { CODING_TOOL_CLIS } from "@trace/shared";
import { getInstallCommand, getPackageManager, installOrUpdateCodingTool } from "./coding-tools.js";

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
  realpath: vi.fn(),
  resolveExecutable: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:child_process")>();
  const { promisify } = await import("node:util");
  return {
    ...original,
    execFile: Object.assign(vi.fn(), { [promisify.custom]: mocks.execFile }),
    spawn: mocks.spawn,
  };
});
vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  realpathSync: mocks.realpath,
}));
vi.mock("@trace/shared/adapters", () => ({
  buildChildProcessEnv: () => ({}),
  resolveExecutable: mocks.resolveExecutable,
}));

afterEach(() => vi.resetAllMocks());

describe("Claude package manager detection", () => {
  it("updates the detected native launcher instead of a second npm installation", () => {
    const executablePath = "/Users/example/.local/bin/claude";
    const manager = getPackageManager(
      "claude_code",
      executablePath,
      () => "/Users/example/.local/share/claude/versions/2.1.270",
    );
    expect(manager).toEqual({ kind: "native", executablePath });
    expect(getInstallCommand(CODING_TOOL_CLIS.claude_code, manager, null, "2.1.276")).toEqual({
      executable: executablePath,
      args: ["install", "2.1.276"],
    });
  });

  it("recognizes a native installation under a custom data directory", () => {
    expect(
      getPackageManager(
        "claude_code",
        "/home/user/.local/bin/claude",
        () => "/data/claude/versions/2.1.270",
      ),
    ).toEqual({ kind: "native", executablePath: "/home/user/.local/bin/claude" });
  });

  it.each([null, "/usr/local/bin/claude"])("keeps npm installation behavior for %s", (path) => {
    const manager = getPackageManager(
      "claude_code",
      path,
      () => "/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js",
    );
    expect(manager).toEqual({ kind: "npm", packageName: "@anthropic-ai/claude-code" });
    expect(getInstallCommand(CODING_TOOL_CLIS.claude_code, manager, "/usr/local")).toEqual({
      executable: "npm",
      args: ["--prefix", "/usr/local", "install", "--global", "@anthropic-ai/claude-code@latest"],
    });
  });

  it("does not classify an unresolved executable as native", () => {
    expect(
      getPackageManager("claude_code", "/missing/claude", () => {
        throw new Error("ENOENT");
      }),
    ).toEqual({ kind: "npm", packageName: "@anthropic-ai/claude-code" });
  });
});

describe("native Claude update flow", () => {
  const executablePath = "/Users/example/.local/bin/claude";

  beforeEach(() => {
    mocks.realpath.mockReturnValue("/Users/example/.local/share/claude/versions/2.1.270");
    mocks.resolveExecutable.mockImplementation((command) =>
      command === "claude" ? executablePath : null,
    );
    mocks.execFile.mockImplementation(async (executable, args) => ({
      stdout:
        executable === executablePath
          ? "2.1.276 (Claude Code)"
          : args[1] === "@anthropic-ai/claude-code"
            ? '"2.1.276"'
            : '"0.155.0"',
      stderr: "",
    }));
    mocks.spawn.mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), { stderr: new PassThrough(), kill: vi.fn() });
      queueMicrotask(() => child.emit("close", 0));
      return child;
    });
  });

  it("installs the explicit version to preserve the saved update channel and verifies the launcher", async () => {
    await expect(installOrUpdateCodingTool("claude_code")).resolves.toMatchObject({
      status: "installed",
      installedVersion: "2.1.276",
      latestVersion: "2.1.276",
    });
    expect(mocks.spawn).toHaveBeenCalledExactlyOnceWith(
      executablePath,
      ["install", "2.1.276"],
      expect.any(Object),
    );
    expect(mocks.execFile).toHaveBeenCalledWith(executablePath, ["--version"], expect.any(Object));
  });

  it("gives native recovery instructions if the launcher still runs the old version", async () => {
    mocks.execFile.mockImplementation(async (executable) => ({
      stdout: executable === executablePath ? "2.1.270 (Claude Code)" : '"2.1.276"',
      stderr: "",
    }));
    await expect(installOrUpdateCodingTool("claude_code")).rejects.toThrow(
      `Claude Code is still running 2.1.270. Check the native installation at ${executablePath}, then run \`claude install 2.1.276\` in Terminal and check again.`,
    );
  });

  it("does not report success when version verification fails", async () => {
    mocks.execFile.mockImplementation(async (executable) => {
      if (executable === executablePath) throw new Error("version unavailable");
      return { stdout: '"2.1.276"', stderr: "" };
    });
    await expect(installOrUpdateCodingTool("claude_code")).rejects.toThrow(
      "could not verify its version",
    );
  });

  it("does not start an installer when the target version is unavailable", async () => {
    mocks.execFile.mockRejectedValue(new Error("registry unavailable"));
    await expect(installOrUpdateCodingTool("claude_code")).rejects.toThrow(
      "Could not determine the latest Claude Code version",
    );
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("reports a native installer failure", async () => {
    mocks.spawn.mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), { stderr: new PassThrough(), kill: vi.fn() });
      queueMicrotask(() => {
        child.stderr.write("Download failed");
        child.emit("close", 1);
      });
      return child;
    });
    await expect(installOrUpdateCodingTool("claude_code")).rejects.toThrow(
      "install failed (exit 1): Download failed",
    );
  });
});

describe("Codex package manager detection", () => {
  it("detects the Homebrew cask from its resolved executable", () => {
    expect(
      getPackageManager("codex", "/opt/homebrew/bin/codex", () =>
        "/opt/homebrew/Caskroom/codex/0.147.0/bin/codex",
      ),
    ).toEqual({ kind: "homebrew", packageName: "codex", cask: true });
  });

  it("upgrades a Homebrew-installed Codex with brew", () => {
    expect(
      getInstallCommand(
        CODING_TOOL_CLIS.codex,
        { kind: "homebrew", packageName: "codex", cask: true },
        null,
      ),
    ).toEqual({ executable: "brew", args: ["upgrade", "--cask", "codex"] });
  });

  it("keeps npm updates scoped to the npm installation that owns Codex", () => {
    expect(
      getInstallCommand(
        CODING_TOOL_CLIS.codex,
        { kind: "npm", packageName: "@openai/codex" },
        "/Users/example/.nvm/versions/node/v22.0.0",
      ),
    ).toEqual({
      executable: "npm",
      args: [
        "--prefix",
        "/Users/example/.nvm/versions/node/v22.0.0",
        "install",
        "--global",
        "@openai/codex@latest",
      ],
    });
  });
});
