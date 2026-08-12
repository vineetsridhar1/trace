import { describe, expect, it } from "vitest";
import { resolveGitHubCloneUrl } from "./github-clone-url.js";

describe("resolveGitHubCloneUrl", () => {
  it("converts an SSH remote to authenticated HTTPS", () => {
    expect(resolveGitHubCloneUrl("git@github.com:acme/trace.git", "gh-token")).toBe(
      "https://x-access-token:gh-token@github.com/acme/trace.git",
    );
  });

  it("authenticates an HTTPS GitHub remote", () => {
    expect(resolveGitHubCloneUrl("https://github.com/acme/trace.git", "gh-token")).toBe(
      "https://x-access-token:gh-token@github.com/acme/trace.git",
    );
  });

  it("leaves non-GitHub and unauthenticated remotes unchanged", () => {
    expect(resolveGitHubCloneUrl("git@gitlab.com:acme/trace.git", "gh-token")).toBe(
      "git@gitlab.com:acme/trace.git",
    );
    expect(resolveGitHubCloneUrl("git@github.com:acme/trace.git")).toBe(
      "git@github.com:acme/trace.git",
    );
  });
});
