import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePullRequestStatus, sessionPullRequestService } from "./session-pull-request.js";
import { prisma } from "../lib/db.js";
import { apiTokenService } from "./api-token.js";

vi.mock("../lib/db.js", () => ({ prisma: { sessionGroup: { findMany: vi.fn() } } }));
vi.mock("./api-token.js", () => ({ apiTokenService: { getDecryptedTokens: vi.fn() } }));
const prUrl = "https://github.com/acme/project/pull/42";
const response = (pr: Record<string, unknown>) => ({ data: { repository: { pullRequest: pr } } });

describe("pull request status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["APPROVED", "SUCCESS", "approved", "success"],
    ["CHANGES_REQUESTED", "FAILURE", "changes_requested", "failure"],
    ["REVIEW_REQUIRED", "PENDING", "pending", "pending"],
    ["APPROVED", "ERROR", "approved", "failure"],
    [null, null, "unknown", "unknown"],
  ])(
    "maps review %s and CI %s without treating missing data as success",
    (reviewDecision, state, review, checks) => {
      expect(
        parsePullRequestStatus(response({ reviewDecision, statusCheckRollup: { state } }), prUrl),
      ).toEqual({ prUrl, review, checks });
    },
  );

  it("uses latest opinions for repos without required reviews and prioritizes requested changes", () => {
    expect(
      parsePullRequestStatus(
        response({
          reviewDecision: null,
          latestOpinionatedReviews: {
            nodes: [{ state: "APPROVED" }, { state: "CHANGES_REQUESTED" }],
            pageInfo: { hasNextPage: false },
          },
        }),
        prUrl,
      ).review,
    ).toBe("changes_requested");
    expect(
      parsePullRequestStatus(
        response({
          latestOpinionatedReviews: {
            nodes: [{ state: "APPROVED" }],
            pageInfo: { hasNextPage: true },
          },
        }),
        prUrl,
      ).review,
    ).toBe("unknown");
  });

  it("does not show green when GitHub returns partial data with errors", () => {
    expect(
      parsePullRequestStatus({ ...response({ reviewDecision: "APPROVED" }), errors: [{}] }, prUrl)
        .review,
    ).toBe("unknown");
  });

  function groups(values: Array<{ id: string; prUrl: string | null }>) {
    vi.mocked(prisma.sessionGroup.findMany).mockResolvedValue(
      values as Awaited<ReturnType<typeof prisma.sessionGroup.findMany>>,
    );
  }

  it("authorizes the complete batch before reading credentials", async () => {
    groups([{ id: "allowed", prUrl }]);
    await expect(
      sessionPullRequestService.getStatuses(["allowed", "private"], "org", "user"),
    ).rejects.toThrow("Not authorized");
    expect(prisma.sessionGroup.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["allowed", "private"] },
        organizationId: "org",
        OR: [{ visibility: "public" }, { ownerUserId: "user" }],
      },
      select: { id: true, prUrl: true },
    });
    expect(apiTokenService.getDecryptedTokens).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("batches distinct PRs and deduplicates links shared by workspaces", async () => {
    const secondUrl = "https://github.com/acme/other/pull/12";
    groups([
      { id: "one", prUrl },
      { id: "two", prUrl: secondUrl },
      { id: "three", prUrl },
    ]);
    vi.mocked(apiTokenService.getDecryptedTokens).mockResolvedValue({ github: "viewer-token" });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            pr0: {
              pullRequest: { reviewDecision: "APPROVED", statusCheckRollup: { state: "SUCCESS" } },
            },
            pr1: {
              pullRequest: {
                reviewDecision: "CHANGES_REQUESTED",
                statusCheckRollup: { state: "FAILURE" },
              },
            },
          },
        }),
      ),
    );
    await expect(
      sessionPullRequestService.getStatuses(["one", "two", "three"], "org", "user"),
    ).resolves.toEqual([
      { prUrl, review: "approved", checks: "success" },
      { prUrl: secondUrl, review: "changes_requested", checks: "failure" },
    ]);
    expect(apiTokenService.getDecryptedTokens).toHaveBeenCalledExactlyOnceWith("user");
    expect(fetch).toHaveBeenCalledTimes(1);
    const query = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string).query;
    expect(query).toContain('pr0: repository(owner: "acme", name: "project")');
    expect(query).toContain('pr1: repository(owner: "acme", name: "other")');
    expect(query).not.toContain("pr2:");
  });

  it("bounds both client batches and GitHub request sizes", async () => {
    await expect(
      sessionPullRequestService.getStatuses(Array(101).fill("id"), "org", "user"),
    ).rejects.toThrow("At most 100");
    expect(prisma.sessionGroup.findMany).not.toHaveBeenCalled();
    const rows = Array.from({ length: 26 }, (_, i) => ({
      id: String(i),
      prUrl: `https://github.com/acme/project/pull/${i + 1}`,
    }));
    groups(rows);
    vi.mocked(apiTokenService.getDecryptedTokens).mockResolvedValue({ github: "token" });
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ data: {} })));
    await sessionPullRequestService.getStatuses(
      rows.map((row) => row.id),
      "org",
      "user",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    const queries = vi
      .mocked(fetch)
      .mock.calls.map((call) => JSON.parse(call[1]?.body as string).query as string);
    expect(queries[0].match(/repository\(/g)).toHaveLength(25);
    expect(queries[1].match(/repository\(/g)).toHaveLength(1);
  });

  it("preserves unaffected aliases when one PR fails", async () => {
    groups([
      { id: "one", prUrl },
      { id: "two", prUrl: prUrl + "0" },
    ]);
    vi.mocked(apiTokenService.getDecryptedTokens).mockResolvedValue({ github: "token" });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { pr0: { pullRequest: { reviewDecision: "APPROVED" } }, pr1: null },
          errors: [{ path: ["pr1"], message: "Not found" }],
        }),
      ),
    );
    const statuses = await sessionPullRequestService.getStatuses(["one", "two"], "org", "user");
    expect(statuses.map((status) => status.review)).toEqual(["approved", "unknown"]);
  });

  it("handles provider failure and keeps the single-workspace query compatible", async () => {
    groups([{ id: "group", prUrl }]);
    vi.mocked(apiTokenService.getDecryptedTokens).mockResolvedValue({ github: "token" });
    vi.mocked(fetch).mockRejectedValue(new Error("timeout"));
    await expect(sessionPullRequestService.getStatus("group", "org", "user")).resolves.toEqual({
      prUrl,
      review: "unknown",
      checks: "unknown",
    });
  });
});
