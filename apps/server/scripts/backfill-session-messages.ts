import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db.js";
import { sessionMessageCreateDataFromEvent } from "../src/services/session-message.js";

const parsedBatchSize = Number(process.env.SESSION_MESSAGE_BACKFILL_BATCH_SIZE ?? "500");
const batchSize = Number.isInteger(parsedBatchSize)
  ? Math.max(1, Math.min(parsedBatchSize, 1_000))
  : 500;
const BACKFILL_NAME = "session-messages-v1";

type Cursor = { timestamp: Date; id: string };

function afterCursor(cursor: Cursor | undefined): Prisma.EventWhereInput | undefined {
  if (!cursor) return undefined;
  return {
    OR: [
      { timestamp: { gt: cursor.timestamp } },
      { AND: [{ timestamp: cursor.timestamp }, { id: { gt: cursor.id } }] },
    ],
  };
}

async function main(): Promise<void> {
  const savedCursor = await prisma.sessionMessageBackfillCursor.findUnique({
    where: { name: BACKFILL_NAME },
  });
  let cursor: Cursor | undefined = savedCursor
    ? { timestamp: savedCursor.timestamp, id: savedCursor.eventId }
    : undefined;
  let scanned = 0;
  let batches = 0;

  while (true) {
    const cursorWhere = afterCursor(cursor);
    const events = await prisma.event.findMany({
      where: {
        scopeType: "session",
        eventType: { in: ["session_started", "message_sent", "session_output"] },
        ...(cursorWhere ? { AND: [cursorWhere] } : {}),
      },
      orderBy: [{ timestamp: "asc" }, { id: "asc" }],
      take: batchSize,
    });
    if (events.length === 0) break;

    const sessionIds = [...new Set(events.map((event) => event.scopeId))];
    const sessions = await prisma.session.findMany({
      where: { id: { in: sessionIds } },
      select: { id: true },
    });
    const existingSessionIds = new Set(sessions.map((session) => session.id));
    const messages = events.flatMap((event) => {
      if (!existingSessionIds.has(event.scopeId)) return [];
      const message = sessionMessageCreateDataFromEvent(event);
      return message ? [message] : [];
    });
    const last = events.at(-1)!;
    await prisma.$transaction(async (tx) => {
      if (messages.length > 0) {
        await tx.sessionMessage.createMany({ data: messages, skipDuplicates: true });
      }
      await tx.sessionMessageBackfillCursor.upsert({
        where: { name: BACKFILL_NAME },
        create: { name: BACKFILL_NAME, timestamp: last.timestamp, eventId: last.id },
        update: { timestamp: last.timestamp, eventId: last.id },
      });
    });

    cursor = { timestamp: last.timestamp, id: last.id };
    scanned += events.length;
    batches += 1;
    console.info(`session-message backfill: ${scanned} events scanned (${batches} batches)`);
  }

  console.info(`session-message backfill complete: ${scanned} events scanned`);
}

main()
  .catch((error: unknown) => {
    console.error("session-message backfill failed", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
