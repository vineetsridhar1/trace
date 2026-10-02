import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  transactionOptions: {
    // Prisma's two-second default is too short for brief pool contention.
    // This is a guardrail; high-volume paths should avoid interactive
    // transactions instead of relying on a larger acquisition window.
    maxWait: 10_000,
  },
});
