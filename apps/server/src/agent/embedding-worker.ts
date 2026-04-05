/**
 * Embedding Worker — background loop that populates vector embeddings
 * for DerivedMemory and EntitySummary records.
 *
 * Polls for records with null embeddings and batch-embeds them via the
 * embedding service. Only embeds content fields — NOT raw events.
 *
 * The embeddings enable semantic search in Phase 4C (hybrid retrieval).
 */

import { prisma } from "../lib/db.js";
import { EmbeddingUnavailableError, embeddingService } from "../services/embedding.js";
import { createAgentLogger } from "./logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 300_000; // 5 minutes
const BATCH_SIZE = 50;

const { log, logError } = createAgentLogger("embedding-worker");

// ---------------------------------------------------------------------------
// Embedding logic
// ---------------------------------------------------------------------------

async function embedDerivedMemories(): Promise<number> {
  // Find memories without embeddings using raw SQL since Prisma can't filter on Unsupported types
  const unembedded = await prisma.$queryRaw<Array<{ id: string; content: string }>>`
    SELECT id, content FROM "DerivedMemory"
    WHERE embedding IS NULL AND "validTo" IS NULL
    ORDER BY "createdAt" DESC
    LIMIT ${BATCH_SIZE}
  `;

  if (unembedded.length === 0) return 0;

  const texts = unembedded.map((m) => m.content);
  const result = await embeddingService.embedBatch(texts);

  // Update each record with its embedding
  for (let i = 0; i < unembedded.length; i++) {
    const embedding = result.embeddings[i];
    const vectorStr = `[${embedding.join(",")}]`;
    await prisma.$executeRaw`
      UPDATE "DerivedMemory"
      SET embedding = ${vectorStr}::vector
      WHERE id = ${unembedded[i].id}
    `;
  }

  return unembedded.length;
}

async function embedEntitySummaries(): Promise<number> {
  const unembedded = await prisma.$queryRaw<Array<{ id: string; content: string }>>`
    SELECT id, content FROM "EntitySummary"
    WHERE embedding IS NULL AND content != ''
    ORDER BY "updatedAt" DESC
    LIMIT ${BATCH_SIZE}
  `;

  if (unembedded.length === 0) return 0;

  const texts = unembedded.map((s) => s.content);
  const result = await embeddingService.embedBatch(texts);

  for (let i = 0; i < unembedded.length; i++) {
    const embedding = result.embeddings[i];
    const vectorStr = `[${embedding.join(",")}]`;
    await prisma.$executeRaw`
      UPDATE "EntitySummary"
      SET embedding = ${vectorStr}::vector
      WHERE id = ${unembedded[i].id}
    `;
  }

  return unembedded.length;
}

/** Check if pgvector extension and embedding columns are available. */
let pgvectorAvailable: boolean | null = null;
let embeddingConfigLogged = false;

async function checkPgvectorAvailable(): Promise<boolean> {
  if (pgvectorAvailable !== null) return pgvectorAvailable;
  try {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.columns
      WHERE column_name = 'embedding'
        AND table_name IN ('DerivedMemory', 'EntitySummary')
    `;
    pgvectorAvailable = result.length === 2;
    if (!pgvectorAvailable) {
      log("pgvector embedding columns not found — embedding worker will be idle until migration is applied");
    }
    return pgvectorAvailable;
  } catch {
    pgvectorAvailable = false;
    log("pgvector check failed — embedding worker will be idle");
    return false;
  }
}

async function runEmbeddingCycle(): Promise<void> {
  try {
    if (!embeddingService.isConfigured()) {
      if (!embeddingConfigLogged) {
        log("embedding API key not configured — embedding worker will remain idle");
        embeddingConfigLogged = true;
      }
      return;
    }

    // Skip if pgvector isn't set up yet
    if (!(await checkPgvectorAvailable())) return;

    const memoriesEmbedded = await embedDerivedMemories();
    const summariesEmbedded = await embedEntitySummaries();

    if (memoriesEmbedded > 0 || summariesEmbedded > 0) {
      log("embedding cycle complete", {
        memoriesEmbedded,
        summariesEmbedded,
      });
    }
  } catch (err) {
    if (err instanceof EmbeddingUnavailableError) {
      if (!embeddingConfigLogged) {
        log("embedding API key not configured — embedding worker will remain idle");
        embeddingConfigLogged = true;
      }
      return;
    }
    logError("embedding cycle failed", err);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startEmbeddingWorker(): void {
  pollTimer = setInterval(() => {
    runEmbeddingCycle().catch((err) => logError("embedding cycle unhandled", err));
  }, POLL_INTERVAL_MS);
  log("embedding worker started");
}

export function stopEmbeddingWorker(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  log("embedding worker stopped");
}

export const __testOnly__ = {
  checkPgvectorAvailable,
  runEmbeddingCycle,
};
