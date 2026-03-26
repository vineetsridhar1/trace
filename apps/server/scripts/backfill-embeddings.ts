/**
 * Backfill script — generates embeddings for all existing tickets and sessions.
 *
 * Usage:
 *   npx tsx scripts/backfill-embeddings.ts
 *
 * Requires OPENAI_API_KEY and DATABASE_URL environment variables.
 */

import { PrismaClient } from "@prisma/client";
import { OpenAIAdapter } from "../src/lib/llm/openai.js";

const EMBEDDING_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 100; // DB fetch batch
const EMBED_BATCH_SIZE = 2048; // OpenAI max batch

const prisma = new PrismaClient();

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is required");
    process.exit(1);
  }

  const adapter = new OpenAIAdapter(apiKey);

  console.log("Starting embedding backfill...");

  await backfillTickets(adapter);
  await backfillSessions(adapter);

  console.log("Backfill complete.");
}

async function backfillTickets(adapter: OpenAIAdapter) {
  let cursor: string | undefined;
  let total = 0;

  console.log("Backfilling ticket embeddings...");

  while (true) {
    const tickets = await prisma.ticket.findMany({
      take: BATCH_SIZE,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { id: "asc" },
      select: {
        id: true,
        organizationId: true,
        title: true,
        description: true,
        labels: true,
      },
    });

    if (tickets.length === 0) break;

    const inputs = tickets.map((t) => ({
      organizationId: t.organizationId,
      entityType: "ticket" as const,
      entityId: t.id,
      text: [t.title, t.description, ...t.labels].filter(Boolean).join(" "),
    }));

    await upsertBatch(adapter, inputs);

    total += tickets.length;
    cursor = tickets[tickets.length - 1].id;
    console.log(`  Processed ${total} tickets...`);
  }

  console.log(`  Done: ${total} tickets embedded.`);
}

async function backfillSessions(adapter: OpenAIAdapter) {
  let cursor: string | undefined;
  let total = 0;

  console.log("Backfilling session embeddings...");

  while (true) {
    const sessions = await prisma.session.findMany({
      take: BATCH_SIZE,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { id: "asc" },
      select: {
        id: true,
        organizationId: true,
        name: true,
      },
    });

    if (sessions.length === 0) break;

    const inputs = sessions.map((s) => ({
      organizationId: s.organizationId,
      entityType: "session" as const,
      entityId: s.id,
      text: s.name,
    }));

    await upsertBatch(adapter, inputs);

    total += sessions.length;
    cursor = sessions[sessions.length - 1].id;
    console.log(`  Processed ${total} sessions...`);
  }

  console.log(`  Done: ${total} sessions embedded.`);
}

async function upsertBatch(
  adapter: OpenAIAdapter,
  inputs: Array<{
    organizationId: string;
    entityType: string;
    entityId: string;
    text: string;
  }>,
) {
  for (let i = 0; i < inputs.length; i += EMBED_BATCH_SIZE) {
    const batch = inputs.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map((inp) => inp.text);

    const response = await adapter.embed({
      model: EMBEDDING_MODEL,
      texts,
    });

    for (let j = 0; j < batch.length; j++) {
      const input = batch[j];
      const vector = response.embeddings[j];
      if (!vector) continue;

      const vectorStr = `[${vector.join(",")}]`;

      await prisma.$executeRawUnsafe(
        `INSERT INTO "Embedding" ("id", "organizationId", "entityType", "entityId", "content", "vector", "model", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::vector, $6, NOW(), NOW())
         ON CONFLICT ("entityType", "entityId")
         DO UPDATE SET "content" = $4, "vector" = $5::vector, "model" = $6, "updatedAt" = NOW()`,
        input.organizationId,
        input.entityType,
        input.entityId,
        input.text,
        vectorStr,
        EMBEDDING_MODEL,
      );
    }
  }
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
