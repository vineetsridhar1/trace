import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  review: vi.fn(),
  threads: vi.fn(),
  update: vi.fn(),
  emit: vi.fn(),
  access: vi.fn(),
}));
vi.mock("../lib/db.js", () => ({
  prisma: {
    review: { findFirst: mocks.review },
    reviewThread: { findMany: mocks.threads },
    $transaction: (
      run: (tx: { reviewThread: { update: typeof mocks.update } }) => Promise<unknown>,
    ) => run({ reviewThread: { update: mocks.update } }),
  },
}));
vi.mock("./access.js", () => ({ assertSessionAccess: mocks.access }));
vi.mock("./event.js", () => ({ eventService: { create: mocks.emit } }));
vi.mock("./session.js", () => ({ sessionService: {} }));
vi.mock("./api-token.js", () => ({
  apiTokenService: { getDecryptedTokens: vi.fn().mockResolvedValue({ github: "token" }) },
}));
vi.mock("../lib/storage/index.js", () => ({ storage: {} }));

import { ReviewService } from "./review.js";
import type { ResolvedPullRequest, ReviewProviderAdapter } from "./review-provider.js";

const pull: ResolvedPullRequest = {
  provider: "github",
  remoteId: "1",
  number: 1,
  url: "https://github.com/owner/repo/pull/1",
  title: "Game",
  description: "",
  repository: { owner: "owner", repo: "repo" },
  baseSha: "base",
  headSha: "head",
  baseRef: "main",
  headRef: "feature",
  files: [
    {
      path: "route.ts",
      previousPath: null,
      status: "added",
      additions: 2,
      deletions: 0,
      patch: "@@ -0,0 +9,2 @@\n+const gameId = params.gameId;\n+",
      baseBlobId: null,
      headBlobId: "blob",
    },
  ],
};
const provider: ReviewProviderAdapter = {
  resolvePullRequest: vi.fn().mockResolvedValue(pull),
  readFileAtCommit: vi.fn(),
  submitReview: vi.fn(),
};
const service = new ReviewService(provider);
const input = {
  reviewId: "review",
  organizationId: "org",
  actorId: "user",
  actorType: "user" as const,
};
const thread = {
  id: "thread",
  scope: "line",
  deliveryStatus: "outdated",
  anchor: {
    snapshotId: "snapshot",
    filePath: "route.ts",
    side: "head",
    startLine: 10,
    endLine: 10,
    selectedText: "",
    status: "outdated",
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.review.mockResolvedValue({
    id: "review",
    attachedSessionId: "session",
    currentSnapshotId: "snapshot",
    title: pull.title,
    description: pull.description,
    pullRequestUrl: pull.url,
    snapshots: [{ id: "snapshot", baseSha: "base", headSha: "head" }],
  });
  mocks.threads.mockResolvedValue([thread]);
  mocks.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...thread, ...data, comments: [{ id: "comment", body: "Test here" }] }),
  );
});
describe("refresh repairs outdated anchors without another commit", () => {
  it("restores the anchor and eligibility, broadcasting the full thread", async () => {
    await service.refresh(input);
    expect(mocks.access).toHaveBeenCalledWith("session", "user", "org");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "thread" },
        data: expect.objectContaining({
          anchor: expect.objectContaining({ status: "current", startLine: 10, selectedText: "" }),
          deliveryStatus: "trace_only",
        }),
      }),
    );
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "review_updated",
        payload: {
          threads: [
            expect.objectContaining({
              id: "thread",
              comments: [{ id: "comment", body: "Test here" }],
              anchor: expect.objectContaining({ status: "current" }),
            }),
          ],
        },
      }),
    );
  });

  it("does not rewrite or emit an update for genuinely missing code", async () => {
    mocks.threads.mockResolvedValue([
      { ...thread, anchor: { ...thread.anchor, selectedText: "deleted code" } },
    ]);
    await service.refresh(input);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it("preserves delivered status when recovering an anchor", async () => {
    mocks.threads.mockResolvedValue([{ ...thread, deliveryStatus: "delivered" }]);
    await service.refresh(input);
    expect(mocks.update.mock.calls[0]![0].data).not.toHaveProperty("deliveryStatus");
  });
});
