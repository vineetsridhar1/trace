import { prisma } from "../lib/db.js";
import { storage } from "../lib/storage/index.js";

const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;

export async function reconcilePendingStorageObjectDeletions(limit = 25): Promise<number> {
  const pending = await prisma.pendingStorageObjectDeletion.findMany({
    where: { nextAttemptAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  for (const object of pending) {
    try {
      await storage.deleteObject(object.key);
      await prisma.pendingStorageObjectDeletion.deleteMany({ where: { key: object.key } });
    } catch (error) {
      const attempts = object.attempts + 1;
      await prisma.pendingStorageObjectDeletion.updateMany({
        where: { key: object.key, attempts: object.attempts },
        data: {
          attempts,
          lastError: error instanceof Error ? error.message.slice(0, 4000) : String(error),
          nextAttemptAt: new Date(
            Date.now() + Math.min(2 ** attempts * 15_000, MAX_RETRY_DELAY_MS),
          ),
        },
      });
    }
  }

  return pending.length;
}
