import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getReview: vi.fn(),
  getGuide: vi.fn(),
  access: vi.fn(),
  create: vi.fn(),
  emit: vi.fn(),
}));
vi.mock("../lib/db.js", () => ({
  prisma: {
    review: { findFirst: mocks.getReview, findUnique: vi.fn().mockResolvedValue(null) },
    reviewGuide: { findFirst: mocks.getGuide },
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        reviewInquiry: { findFirst: vi.fn().mockResolvedValue(null), create: mocks.create },
      }),
  },
}));
vi.mock("./access.js", () => ({ assertSessionAccess: mocks.access }));
vi.mock("./event.js", () => ({ eventService: { create: mocks.emit } }));
vi.mock("./session.js", () => ({ sessionService: {} }));
vi.mock("./api-token.js", () => ({ apiTokenService: {} }));
vi.mock("../lib/storage/index.js", () => ({ storage: {} }));
import { ReviewService } from "./review.js";

const service = new ReviewService();
const chapter = {
  id: "validation",
  title: "Validate moves",
  explanation: "Validation precedes the state update.",
  references: [{ filePath: "src/game.ts", startLine: 12, endLine: 18 }],
};
const input = {
  reviewId: "review",
  snapshotId: "old-snapshot",
  organizationId: "org",
  actorId: "user",
  actorType: "user" as const,
  sourceKind: "guide_anchor" as const,
  question: "Why validate first?",
  context: { guideId: "guide", guideChapterId: "validation" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getReview.mockResolvedValue({
    id: "review",
    attachedSessionId: "session",
    snapshots: [{ id: "old-snapshot" }],
  });
  mocks.getGuide.mockResolvedValue({
    id: "guide",
    content: { title: "Game updates", chapters: [chapter] },
  });
  mocks.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "inquiry", state: "queued", ...data }),
  );
});

describe("Guide chapter questions", () => {
  it("queues the saved chapter and its exact ranges and emits the complete inquiry", async () => {
    const inquiry = await service.enqueueInquiry({
      ...input,
      context: { ...input.context, guideChapter: { explanation: "Untrusted replacement" } },
    });
    expect(mocks.getGuide).toHaveBeenCalledWith({
      where: { reviewId: "review", snapshotId: "old-snapshot", id: "guide" },
      orderBy: { version: "desc" },
    });
    expect(inquiry).toMatchObject({
      sessionId: "session",
      question: "Why validate first?",
      snapshotId: "old-snapshot",
      context: {
        guideId: "guide",
        guideChapterId: "validation",
        guideTitle: "Game updates",
        guideChapter: chapter,
        requestedByActorId: "user",
      },
    });
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "review_inquiry_enqueued", payload: { inquiry } }),
    );
  });

  it("captures chapter context for an inline Guide code question", async () => {
    const anchor = {
      snapshotId: "old-snapshot",
      filePath: "src/game.ts",
      side: "head",
      startLine: 12,
      endLine: 14,
    };
    const inquiry = await service.enqueueInquiry({
      ...input,
      sourceKind: "diff_anchor",
      anchor,
      context: {
        ...input.context,
        selectedText: "selected code",
        surroundingContext: "source context",
      },
    });
    expect(inquiry).toMatchObject({
      sourceKind: "diff_anchor",
      anchor,
      context: {
        guideId: "guide",
        guideChapter: chapter,
        selectedText: "selected code",
        surroundingContext: "source context",
      },
    });
  });

  it("rejects a chapter or guide that does not belong to the snapshot", async () => {
    await expect(
      service.enqueueInquiry({
        ...input,
        context: { ...input.context, guideChapterId: "missing" },
      }),
    ).rejects.toThrow("does not belong");
    mocks.getGuide.mockResolvedValue(null);
    await expect(service.enqueueInquiry(input)).rejects.toThrow("does not belong");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("supports older clients that send a chapter ID without a guide ID", async () => {
    await service.enqueueInquiry({ ...input, context: { guideChapterId: "validation" } });
    expect(mocks.getGuide).toHaveBeenCalledWith({
      where: { reviewId: "review", snapshotId: "old-snapshot" },
      orderBy: { version: "desc" },
    });
  });

  it("checks session access before looking up the chapter or creating a question", async () => {
    mocks.access.mockRejectedValueOnce(new Error("Access denied"));
    await expect(service.enqueueInquiry(input)).rejects.toThrow("Access denied");
    expect(mocks.getGuide).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
