import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubReviewProvider, parseGitHubPullRequestUrl } from "./review-provider.js";

afterEach(() => vi.unstubAllGlobals());

describe("parseGitHubPullRequestUrl", () => {
  it("accepts canonical GitHub pull request URLs", () => {
    expect(parseGitHubPullRequestUrl("https://github.com/acme/widgets/pull/42")).toEqual({
      repo: { owner: "acme", repo: "widgets" },
      number: 42,
    });
  });

  it("rejects non-pull and non-GitHub URLs", () => {
    expect(parseGitHubPullRequestUrl("https://github.com/acme/widgets/issues/42")).toBeNull();
    expect(parseGitHubPullRequestUrl("https://example.com/acme/widgets/pull/42")).toBeNull();
  });
});

describe("GitHubReviewProvider", () => {
  it("resolves immutable base/head metadata and file patches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 99,
            number: 42,
            html_url: "https://github.com/acme/widgets/pull/42",
            title: "Safer widgets",
            body: "Explains why the widgets are safer.",
            base: { sha: "base-sha", ref: "main" },
            head: { sha: "head-sha", ref: "feat/widgets" },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              filename: "src/widget.ts",
              status: "modified",
              additions: 2,
              deletions: 1,
              patch: "@@ -1 +1,2 @@\n-old\n+new\n+more",
              sha: "blob-sha",
            },
          ]),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const pull = await new GitHubReviewProvider().resolvePullRequest(
      "https://github.com/acme/widgets/pull/42",
      "token",
    );
    expect(pull).toMatchObject({
      remoteId: "99",
      baseSha: "base-sha",
      headSha: "head-sha",
      baseRef: "main",
      headRef: "feat/widgets",
      description: "Explains why the widgets are safer.",
    });
    expect(pull.files).toEqual([
      expect.objectContaining({ path: "src/widget.ts", patch: expect.stringContaining("+new") }),
    ]);
  });

  it("recovers an existing idempotent delivery instead of posting a duplicate", async () => {
    const marker = "<!-- trace-review-delivery:delivery-key -->";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 700, body: marker }]), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ id: 701, body: "comment\n<!-- trace-thread:thread-1 -->" }]),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await new GitHubReviewProvider().submitReview({
      pullRequest: {
        provider: "github",
        remoteId: "99",
        number: 42,
        url: "https://github.com/acme/widgets/pull/42",
        title: "Review",
        description: "Review description",
        repository: { owner: "acme", repo: "widgets" },
        baseSha: "base",
        headSha: "head",
        baseRef: "main",
        headRef: "feature",
        files: [],
      },
      token: "token",
      disposition: "comment",
      comments: [{ threadId: "thread-1", body: "comment" }],
      idempotencyKey: "delivery-key",
    });
    expect(result).toEqual({ reviewId: "700", commentIds: { "thread-1": "701" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === "POST"),
    ).toBe(false);
  });
});
