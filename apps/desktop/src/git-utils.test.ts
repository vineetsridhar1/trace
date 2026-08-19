import { describe, expect, it } from "vitest";
import {
  formatGitError,
  gitBranchInUseMessage,
  gitEnv,
  gitLockErrorMessage,
  isGitAuthError,
  stripGitProgress,
} from "./git-utils.js";

describe("git-utils", () => {
  it("disables interactive git credential prompts", () => {
    expect(gitEnv()).toEqual(
      expect.objectContaining({
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "echo",
        SSH_ASKPASS: "echo",
      }),
    );
  });

  it("formats GitHub credential prompts as a user action", () => {
    const error = Object.assign(new Error("Command failed"), {
      stderr: "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
    });

    expect(isGitAuthError(error.stderr)).toBe(true);
    expect(formatGitError(error)).toBe(
      "GitHub login required for this repository. Run `gh auth login` or switch the repo remote to SSH, then try again.",
    );
  });

  it("turns a held index lock into instructions naming the lock file", () => {
    const error = Object.assign(new Error("Command failed: git add -A"), {
      stderr:
        "fatal: Unable to create '/Users/dev/repo/.git/index.lock': File exists.\n\n" +
        "Another git process seems to be running in this repository, e.g.\n" +
        "an editor opened by 'git commit'. Please make sure all processes\n" +
        "are terminated then try again.",
    });

    expect(gitLockErrorMessage(error.stderr)).toBe(
      "Another Git process is using this repository. Wait for it to finish, or quit other Git tools, " +
        "then try again. If nothing else is running, delete /Users/dev/repo/.git/index.lock and retry.",
    );
    expect(formatGitError(error)).toContain("/Users/dev/repo/.git/index.lock");
    expect(formatGitError(error)).not.toContain("fatal:");
  });

  it("drops checkout progress frames from a failure", () => {
    const progress = Array.from(
      { length: 200 },
      (_, i) => `Updating files:  ${i}% (${i * 500}/113756)`,
    ).join("\r");
    const error = Object.assign(new Error("Command failed"), {
      stderr:
        `Preparing worktree (checking out 'trace-session')\n${progress}\r` +
        "fatal: 'trace-session' is already used by worktree at '/Users/dev/repo'",
    });

    expect(stripGitProgress(`a\rUpdating files:  5% (1/2)\rb`)).toBe("a\nb");
    expect(formatGitError(error)).not.toContain("Updating files");
  });

  it("names the checkout holding a branch instead of repeating git's wording", () => {
    const error = Object.assign(new Error("Command failed"), {
      stderr:
        "Preparing worktree (checking out 'trace-session')\n" +
        "fatal: 'trace-session' is already used by worktree at '/Users/dev/repo'",
    });

    expect(gitBranchInUseMessage(error.stderr)).toBe(
      "Branch trace-session is already checked out at /Users/dev/repo. " +
        "Switch that checkout to another branch, or move this session to it.",
    );
    expect(formatGitError(error)).toBe(gitBranchInUseMessage(error.stderr));
  });

  it("caps a long error, keeping the tail where git reports the failure", () => {
    const error = Object.assign(new Error("Command failed"), {
      stderr: `${"warning: noise\n".repeat(500)}fatal: the actual problem`,
    });

    const formatted = formatGitError(error);
    expect(formatted.length).toBeLessThanOrEqual(801);
    expect(formatted).toContain("fatal: the actual problem");
  });

  it("leaves unrelated git errors untouched", () => {
    const error = Object.assign(new Error("Command failed"), {
      stderr: "error: pathspec 'nope' did not match any file(s) known to git",
    });

    expect(gitLockErrorMessage(error.stderr)).toBeNull();
    expect(formatGitError(error)).toBe(
      "error: pathspec 'nope' did not match any file(s) known to git",
    );
  });
});
