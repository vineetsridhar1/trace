import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  review: vi.fn(),
  create: vi.fn(),
  access: vi.fn(),
  emit: vi.fn(),
}));
vi.mock("../lib/db.js", () => ({
  prisma: { review: { findFirst: mocks.review }, reviewThread: { create: mocks.create } },
}));
vi.mock("./access.js", () => ({ assertSessionAccess: mocks.access }));
vi.mock("./event.js", () => ({ eventService: { create: mocks.emit } }));
vi.mock("./session.js", () => ({ sessionService: {} }));
vi.mock("./api-token.js", () => ({ apiTokenService: {} }));
vi.mock("../lib/storage/index.js", () => ({ storage: {} }));
import { ReviewService, threadAppliesToSnapshot } from "./review.js";
const service = new ReviewService();
const input = {
  organizationId: "org",
  actorId: "user",
  actorType: "user" as const,
  reviewId: "review",
  snapshotId: "snapshot",
  scope: "line" as const,
  guideChapterId: "chapter",
  body: "Review this code",
  anchor: {
    snapshotId: "snapshot",
    filePath: "src/a.ts",
    side: "head",
    startLine: 10,
    endLine: 12,
    selectedText: "client text",
  },
};
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocks.review.mockResolvedValue({
    id: "review",
    attachedSessionId: "session",
    snapshots: [{ id: "snapshot", files: [{ path: "src/a.ts" }] }],
    guides: [{ snapshotId: "snapshot", content: { chapters: [{ id: "chapter" }] } }],
  });
  mocks.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "thread", ...data }),
  );
});
describe("Guide code comments", () => {
  it.each([true, false])(
    "verifies selected source and uses diff eligibility %s",
    async (inDiff) => {
      const excerpt = vi
        .spyOn(service, "codeExcerpt")
        .mockResolvedValue({
          snapshotId: "snapshot",
          path: inDiff ? "src/a.ts" : "src/context.ts",
          startLine: 10,
          endLine: 12,
          content: "actual\nsnapshot\ncode",
          addedLines: [],
          inDiff,
        });
      const thread = await service.createThread({
        ...input,
        anchor: { ...input.anchor, filePath: inDiff ? "src/a.ts" : "src/context.ts" },
      });
      expect(mocks.access).toHaveBeenCalledWith("session", "user", "org");
      expect(excerpt).toHaveBeenCalledWith(
        expect.objectContaining({ snapshotId: "snapshot", startLine: 10, endLine: 12 }),
      );
      expect(thread).toMatchObject({
        scope: inDiff ? "line" : "guide_explanation",
        anchor: { selectedText: "actual\nsnapshot\ncode" },
      });
      expect(threadAppliesToSnapshot(thread, "snapshot")).toBe(inDiff);
      expect(mocks.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "review_thread_created", payload: { thread } }),
      );
    },
  );
  it("rejects unrelated Guide chapters before reading or saving code", async () => {
    const excerpt = vi.spyOn(service, "codeExcerpt");
    await expect(service.createThread({ ...input, guideChapterId: "unknown" })).rejects.toThrow(
      "does not belong",
    );
    expect(excerpt).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("preserves private-session authorization", async () => {
    mocks.access.mockRejectedValueOnce(new Error("Access denied"));
    await expect(service.createThread(input)).rejects.toThrow("Access denied");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
