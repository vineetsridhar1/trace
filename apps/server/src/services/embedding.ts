/**
 * Embedding Service — manages vector embeddings for semantic search.
 *
 * Uses OpenAI's text-embedding-3-small model to generate 1536-dimensional
 * embeddings stored via pgvector. Provides upsert, delete, and similarity
 * search operations using cosine distance.
 */

import { prisma } from "../lib/db.js";
import { OpenAIAdapter } from "../lib/llm/openai.js";

const EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_SIMILARITY_THRESHOLD = 0.7;
const DEFAULT_LIMIT = 10;

// Lazy-initialized OpenAI adapter for embeddings
let openaiAdapter: OpenAIAdapter | null = null;

function getOpenAIAdapter(): OpenAIAdapter | null {
  if (openaiAdapter) return openaiAdapter;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  openaiAdapter = new OpenAIAdapter(apiKey);
  return openaiAdapter;
}

export interface EmbeddingUpsertInput {
  organizationId: string;
  entityType: string;
  entityId: string;
  text: string;
}

export interface SimilarityResult {
  entityType: string;
  entityId: string;
  similarity: number;
}

export interface FindSimilarInput {
  organizationId: string;
  text: string;
  entityTypes?: string[];
  limit?: number;
  threshold?: number;
  excludeIds?: string[];
}

export class EmbeddingService {
  /** Check if the embedding service is available (OpenAI API key configured). */
  isAvailable(): boolean {
    return getOpenAIAdapter() !== null;
  }

  /** Generate embedding for a single entity and upsert it into the store. */
  async upsert(input: EmbeddingUpsertInput): Promise<void> {
    const adapter = getOpenAIAdapter();
    if (!adapter) return;

    const response = await adapter.embed({
      model: EMBEDDING_MODEL,
      texts: [input.text],
    });

    const vector = response.embeddings[0];
    if (!vector) return;

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

  /** Batch upsert embeddings for multiple entities. */
  async upsertBatch(inputs: EmbeddingUpsertInput[]): Promise<void> {
    const adapter = getOpenAIAdapter();
    if (!adapter || inputs.length === 0) return;

    // OpenAI supports batches of up to 2048 texts
    const batchSize = 2048;
    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize);
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

  /** Delete embedding for an entity. */
  async delete(entityType: string, entityId: string): Promise<void> {
    await prisma.embedding.deleteMany({
      where: { entityType, entityId },
    });
  }

  /** Find similar entities by vector cosine similarity. */
  async findSimilar(input: FindSimilarInput): Promise<SimilarityResult[]> {
    const adapter = getOpenAIAdapter();
    if (!adapter) return [];

    const response = await adapter.embed({
      model: EMBEDDING_MODEL,
      texts: [input.text],
    });

    const vector = response.embeddings[0];
    if (!vector) return [];

    const vectorStr = `[${vector.join(",")}]`;
    const threshold = input.threshold ?? DEFAULT_SIMILARITY_THRESHOLD;
    const limit = input.limit ?? DEFAULT_LIMIT;
    const entityTypes = input.entityTypes ?? [];
    const excludeIds = input.excludeIds ?? [];

    let query = `
      SELECT "entityType", "entityId",
             1 - ("vector" <=> $1::vector) as similarity
      FROM "Embedding"
      WHERE "organizationId" = $2
        AND 1 - ("vector" <=> $1::vector) > $3
    `;

    const params: unknown[] = [vectorStr, input.organizationId, threshold];

    if (entityTypes.length > 0) {
      params.push(entityTypes);
      query += ` AND "entityType" = ANY($${params.length})`;
    }

    if (excludeIds.length > 0) {
      params.push(excludeIds);
      query += ` AND "entityId" != ALL($${params.length})`;
    }

    query += ` ORDER BY "vector" <=> $1::vector LIMIT $${params.length + 1}`;
    params.push(limit);

    interface RawSimilarityRow {
      entityType: string;
      entityId: string;
      similarity: number;
    }

    const results = await prisma.$queryRawUnsafe<RawSimilarityRow[]>(query, ...params);

    return results.map((r: RawSimilarityRow) => ({
      entityType: r.entityType,
      entityId: r.entityId,
      similarity: Number(r.similarity),
    }));
  }

  /** Compute similarity between two texts via their embeddings. */
  async computeSimilarity(textA: string, textB: string): Promise<number | null> {
    const adapter = getOpenAIAdapter();
    if (!adapter) return null;

    const response = await adapter.embed({
      model: EMBEDDING_MODEL,
      texts: [textA, textB],
    });

    const vecA = response.embeddings[0];
    const vecB = response.embeddings[1];
    if (!vecA || !vecB) return null;

    return cosineSimilarity(vecA, vecB);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export const embeddingService = new EmbeddingService();
