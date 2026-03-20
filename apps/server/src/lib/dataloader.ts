import DataLoader from "dataloader";
import { prisma } from "./db.js";

export function createUserLoader() {
  return new DataLoader<string, { id: string; name: string | null; avatarUrl: string | null } | null>(
    async (ids) => {
      const users = await prisma.user.findMany({
        where: { id: { in: [...ids] } },
        select: { id: true, name: true, avatarUrl: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));
      return ids.map((id) => userMap.get(id) ?? null);
    },
  );
}
