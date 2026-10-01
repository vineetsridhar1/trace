import { beforeEach, describe, expect, it, vi } from "vitest";
import { sourceExcerpt, validateExcerptRange } from "./review-excerpt.js";

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  access: vi.fn(),
  readFile: vi.fn(),
  getObject: vi.fn(),
  token: vi.fn(),
}));
vi.mock("../lib/db.js", () => ({ prisma: { reviewSnapshot: { findFirst: mocks.snapshot } } }));
vi.mock("./access.js", () => ({ assertSessionAccess: mocks.access }));
vi.mock("../lib/storage/index.js", () => ({ storage: { getObject: mocks.getObject } }));
vi.mock("./api-token.js", () => ({ apiTokenService: { getDecryptedTokens: mocks.token } }));
vi.mock("./event.js", () => ({ eventService: {} }));
vi.mock("./session.js", () => ({ sessionService: {} }));
import { ReviewService } from "./review.js";

const service = new ReviewService({
  readFileAtCommit: mocks.readFile,
  resolvePullRequest: vi.fn(),
  submitReview: vi.fn(),
});
const input = {
  organizationId: "org",
  actorId: "user",
  actorType: "user" as const,
  snapshotId: "snapshot",
  filePath: "src/a.ts",
  startLine: 2,
  endLine: 3,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.snapshot.mockResolvedValue({
    id: "snapshot",
    headSha: "head-sha",
    patchStorageKey: "patch",
    review: {
      attachedSessionId: "session",
      pullRequestUrl: "https://github.com/acme/widgets/pull/42",
    },
  });
  mocks.token.mockResolvedValue({ github: "token" });
  mocks.getObject.mockResolvedValue(
    Buffer.from(
      JSON.stringify({
        files: [
          { path: "src/a.ts", patch: "@@ -1,3 +1,4 @@\n context\n+added\n context2\n context3" },
        ],
      }),
    ),
  );
});

describe("Review code excerpts", () => {
  it("serves exactly the requested range from the snapshot patch", async () => {
    expect(await service.codeExcerpt(input)).toMatchObject({
      content: "added\ncontext2",
      startLine: 2,
      endLine: 3,
      addedLines: [2],
    });
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.access).toHaveBeenCalledWith("session", "user", "org");
    expect(mocks.snapshot).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "snapshot", review: { organizationId: "org" } } }),
    );
  });

  it("reads context outside the diff at the snapshot SHA, not a branch", async () => {
    mocks.readFile.mockResolvedValue("before\none\ntwo\nafter\n");
    expect(await service.codeExcerpt({ ...input, filePath: "src/context.ts" })).toMatchObject({
      content: "one\ntwo",
      addedLines: [],
    });
    expect(mocks.readFile).toHaveBeenCalledWith(
      "https://github.com/acme/widgets/pull/42",
      "head-sha",
      "src/context.ts",
      "token",
    );
  });

  it("loads source when the requested range crosses a patch gap", async () => {
    mocks.readFile.mockResolvedValue("context\nadded\ncontext2\ncontext3\nbeyond");
    expect(await service.codeExcerpt({ ...input, endLine: 5 })).toMatchObject({
      content: "added\ncontext2\ncontext3\nbeyond",
      addedLines: [2],
    });
  });

  it("clamps an end-line overshoot and reports the actual displayed range", async () => {
    mocks.readFile.mockResolvedValue("context\nadded\ncontext2\n");
    expect(await service.codeExcerpt({ ...input, endLine: 11 })).toMatchObject({
      startLine: 2,
      endLine: 3,
      content: "added\ncontext2",
    });
    expect(sourceExcerpt("one\ntwo\n", 1, 3)).toBe("one\ntwo");
  });

  it("denies private-session access before reading code", async () => {
    mocks.access.mockRejectedValue(new Error("Access denied"));
    await expect(service.codeExcerpt(input)).rejects.toThrow("Access denied");
    expect(mocks.getObject).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("rejects invalid, oversized, or traversal ranges", () => {
    for (const [start, end] of [
      [0, 4],
      [3, 2],
      [1, 81],
      [1.5, 5],
    ]) {
      expect(() => validateExcerptRange("src/a.ts", start!, end!)).toThrow();
    }
    expect(() => validateExcerptRange("../secret", 1, 2)).toThrow();
    expect(() => validateExcerptRange(String.raw`app/\[id\]/route.ts`, 1, 80)).not.toThrow();
  });

  it("rejects nonexistent lines and binary source instead of substituting other code", () => {
    expect(() => sourceExcerpt("one\ntwo\n", 3, 4)).toThrow("beyond");
    expect(() => sourceExcerpt("\0binary", 1, 1)).toThrow("binary");
    expect(sourceExcerpt("one\r\ntwo\r\n", 2, 2)).toBe("two");
  });
});
