import { describe, expect, it } from "vitest";
import { formatGitError, gitEnv, isGitAuthError } from "./git-utils.js";

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
});
