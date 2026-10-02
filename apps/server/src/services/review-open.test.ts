import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  findReview: vi.fn(),
  updateReview: vi.fn(),
  findSession: vi.fn(),
  findThreads: vi.fn(),
  startSession: vi.fn(),
  resolvePullRequest: vi.fn(),
}));

vi.mock("../lib/db.js", () => ({
  prisma: {
    review: { findFirst: mocks.findReview, update: mocks.updateReview },
    session: { findFirst: mocks.findSession },
    reviewThread: { findMany: mocks.findThreads },
  },
}));
vi.mock("./access.js", () => ({ assertSessionAccess: mocks.access }));
vi.mock("./api-token.js", () => ({
  apiTokenService: { getDecryptedTokens: vi.fn().mockResolvedValue({ github: "token" }) },
}));
vi.mock("./event.js", () => ({ eventService: { create: vi.fn() } }));
vi.mock("./session.js", () => ({ sessionService: { start: mocks.startSession } }));
vi.mock("../lib/storage/index.js", () => ({ storage: {} }));

import { ReviewService } from "./review.js";
import type { ResolvedPullRequest, ReviewProviderAdapter } from "./review-provider.js";

const pull: ResolvedPullRequest = {
  provider: "github",
  remoteId: "pull-1",
  number: 1,
  url: "https://github.com/owner/repo/pull/1",
  title: "Fresh review chat",
  description: "",
  repository: { owner: "owner", repo: "repo" },
  baseSha: "base",
  headSha: "head",
  baseRef: "main",
  headRef: "feature",
  files: [],
};

const provider: ReviewProviderAdapter = {
  resolvePullRequest: mocks.resolvePullRequest,
  readFileAtCommit: vi.fn(),
  submitReview: vi.fn(),
};

const review = {
  id: "review-1",
  attachedSessionId: "old-review-chat",
  status: "open",
  title: pull.title,
  description: pull.description,
  currentSnapshotId: "snapshot-1",
  snapshots: [{ id: "snapshot-1", baseSha: pull.baseSha, headSha: pull.headSha }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolvePullRequest.mockResolvedValue(pull);
  mocks.findSession.mockResolvedValue({
    id: "source-chat",
    tool: "codex",
    model: "gpt-5.3-codex",
    reasoningEffort: "high",
    repo: { id: "repo-1", provider: "github", remoteUrl: "https://github.com/owner/repo.git" },
    sessionGroup: { repo: null },
  });
  mocks.startSession.mockResolvedValue({ id: "review-chat" });
  mocks.findReview.mockResolvedValue(review);
  mocks.updateReview.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
    ...review,
    ...data,
  }));
  mocks.findThreads.mockResolvedValue([]);
});

describe("opening a review", () => {
  it("starts and attaches a fresh chat instead of the source chat", async () => {
    const service = new ReviewService(provider);

    await service.open({
      organizationId: "org-1",
      actorId: "user-1",
      actorType: "user",
      sessionId: "source-chat",
      pullRequestUrl: pull.url,
    });

    expect(mocks.startSession).toHaveBeenCalledWith({
      organizationId: "org-1",
      createdById: "user-1",
      actorType: "user",
      sourceSessionId: "source-chat",
      tool: "codex",
      model: "gpt-5.3-codex",
      reasoningEffort: "high",
      name: "Review: Fresh review chat",
      clientSource: "web",
    });
    expect(mocks.updateReview).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attachedSessionId: "review-chat", status: "open" } }),
    );
  });
});
