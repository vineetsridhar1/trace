import { Buffer } from "buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubRepoService, parseGitHubRepo } from "./github-repo.js";

const repo = { owner: "acme", repo: "trace" };

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("GitHubRepoService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("parses GitHub remote URLs", () => {
    expect(parseGitHubRepo("https://github.com/acme/trace.git")).toEqual(repo);
    expect(parseGitHubRepo("https://github.com/acme/trace/")).toEqual(repo);
    expect(parseGitHubRepo("git@github.com:acme/trace.git")).toEqual(repo);
    expect(parseGitHubRepo("git@github.com:acme/trace/")).toEqual(repo);
    expect(parseGitHubRepo("https://example.com/acme/trace.git")).toBeNull();
  });

  it("lists blob paths from a recursive tree", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        tree: [
          { path: "src/index.ts", type: "blob" },
          { path: "src", type: "tree" },
          { path: "README.md", type: "blob" },
        ],
      }),
    );

    const service = new GitHubRepoService();
    await expect(service.listFiles(repo, "trace/branch", "gh-token")).resolves.toEqual([
      "README.md",
      "src/index.ts",
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/trace/git/trees/trace%2Fbranch?recursive=1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer gh-token" }),
      }),
    );
  });

  it("fails when GitHub truncates a recursive tree", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse({ truncated: true, tree: [] }));

    const service = new GitHubRepoService();
    await expect(service.listFiles(repo, "main", "gh-token")).rejects.toThrow(
      "GitHub file tree is too large to list completely.",
    );
  });

  it("reads base64 file content", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        type: "file",
        encoding: "base64",
        content: Buffer.from("hello\n", "utf8").toString("base64"),
      }),
    );

    const service = new GitHubRepoService();
    await expect(service.readFile(repo, "main", "src/app file.ts", "gh-token")).resolves.toBe(
      "hello\n",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/trace/contents/src/app%20file.ts?ref=main",
      expect.any(Object),
    );
  });

  it("maps compare files into branch diff entries", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        files: [
          { filename: "src/new.ts", status: "added", additions: 2, deletions: 0 },
          { filename: "src/old.ts", status: "removed", additions: 0, deletions: 4 },
          { filename: "src/moved.ts", status: "renamed", additions: 1, deletions: 1 },
        ],
      }),
    );

    const service = new GitHubRepoService();
    await expect(service.branchDiff(repo, "main", "trace/branch", "gh-token")).resolves.toEqual([
      { path: "src/new.ts", status: "A", additions: 2, deletions: 0 },
      { path: "src/old.ts", status: "D", additions: 0, deletions: 4 },
      { path: "src/moved.ts", status: "R", additions: 1, deletions: 1 },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/trace/compare/main...trace%2Fbranch",
      expect.any(Object),
    );
  });

  it("uses only the first compare response for changed files", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { files: [{ filename: "src/one.ts", status: "modified", additions: 1, deletions: 0 }] },
        {
          headers: {
            "Content-Type": "application/json",
            Link: '<https://api.github.com/repos/acme/trace/compare/main...feature?page=2>; rel="next"',
          },
        },
      ),
    );

    const service = new GitHubRepoService();
    await expect(service.branchDiff(repo, "main", "feature", "gh-token")).resolves.toEqual([
      { path: "src/one.ts", status: "M", additions: 1, deletions: 0 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries branch compare with path-style refs for branch names with slashes", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: "Not Found" }, { status: 404 }))
      .mockResolvedValueOnce(
        jsonResponse({
          files: [{ filename: "src/app.ts", status: "modified", additions: 3, deletions: 1 }],
        }),
      );

    const service = new GitHubRepoService();
    await expect(service.branchDiff(repo, "main", "trace/branch", "gh-token")).resolves.toEqual([
      { path: "src/app.ts", status: "M", additions: 3, deletions: 1 },
    ]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/repos/acme/trace/compare/main...trace/branch",
      expect.any(Object),
    );
  });

  it("returns an actionable branch compare error after GitHub 404s", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async () =>
      jsonResponse({ message: "Not Found" }, { status: 404 }),
    );

    const service = new GitHubRepoService();
    await expect(service.branchDiff(repo, "main", "missing/branch", "gh-token")).rejects.toThrow(
      'GitHub branch diff unavailable: could not compare "main" to "missing/branch".',
    );
  });
});
