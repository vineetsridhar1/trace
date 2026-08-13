import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

const { deleteObject } = vi.hoisted(() => ({ deleteObject: vi.fn() }));
vi.mock("../lib/storage/index.js", () => ({ storage: { deleteObject } }));

import { prisma } from "../lib/db.js";
import { reconcilePendingStorageObjectDeletions } from "./storage-object-deletion.js";

const prismaMock = prisma as unknown as {
  pendingStorageObjectDeletion: {
    findMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
};

describe("reconcilePendingStorageObjectDeletions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes queued objects and their completed queue rows", async () => {
    prismaMock.pendingStorageObjectDeletion.findMany.mockResolvedValue([
      { key: "uploads/legacy.png", attempts: 0, createdAt: new Date() },
    ]);
    deleteObject.mockResolvedValue(undefined);

    await expect(reconcilePendingStorageObjectDeletions()).resolves.toBe(1);

    expect(deleteObject).toHaveBeenCalledWith("uploads/legacy.png");
    expect(prismaMock.pendingStorageObjectDeletion.deleteMany).toHaveBeenCalledWith({
      where: { key: "uploads/legacy.png" },
    });
  });

  it("backs off failed deletions without losing the storage key", async () => {
    prismaMock.pendingStorageObjectDeletion.findMany.mockResolvedValue([
      { key: "uploads/legacy.png", attempts: 1, createdAt: new Date() },
    ]);
    deleteObject.mockRejectedValue(new Error("storage unavailable"));

    await expect(reconcilePendingStorageObjectDeletions()).resolves.toBe(1);

    expect(prismaMock.pendingStorageObjectDeletion.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.pendingStorageObjectDeletion.updateMany).toHaveBeenCalledWith({
      where: { key: "uploads/legacy.png", attempts: 1 },
      data: expect.objectContaining({
        attempts: 2,
        lastError: "storage unavailable",
        nextAttemptAt: expect.any(Date),
      }),
    });
  });
});
