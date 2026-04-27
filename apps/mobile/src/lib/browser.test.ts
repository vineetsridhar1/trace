import { describe, expect, it } from "vitest";
import { gitRemoteToBrowserUrl, normalizeBrowserInputUrl, resolveBrowserUrl } from "./browser";

describe("resolveBrowserUrl", () => {
  it("prefers an explicit override", () => {
    expect(
      resolveBrowserUrl(
        "https://example.com",
        "https://github.com/org/repo/pull/1",
        "git@github.com:org/repo.git",
      ),
    ).toBe("https://example.com");
  });

  it("falls back to the PR URL before the repo remote", () => {
    expect(
      resolveBrowserUrl(null, "https://github.com/org/repo/pull/1", "git@github.com:org/repo.git"),
    ).toBe("https://github.com/org/repo/pull/1");
  });

  it("converts ssh remotes to browser URLs", () => {
    expect(resolveBrowserUrl(null, null, "git@github.com:org/repo.git")).toBe(
      "https://github.com/org/repo",
    );
  });
});

describe("gitRemoteToBrowserUrl", () => {
  it("strips .git from https remotes", () => {
    expect(gitRemoteToBrowserUrl("https://github.com/org/repo.git")).toBe(
      "https://github.com/org/repo",
    );
  });
});

describe("normalizeBrowserInputUrl", () => {
  it("adds https to bare domains", () => {
    expect(normalizeBrowserInputUrl("trace.new")).toBe("https://trace.new");
  });

  it("preserves explicit protocols", () => {
    expect(normalizeBrowserInputUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeBrowserInputUrl("   ")).toBe("");
  });
});
