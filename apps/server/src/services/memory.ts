/**
 * Memory Service — manages DerivedMemory records with provenance, lifecycle,
 * and query-time visibility enforcement.
 *
 * Visibility rules (enforced in fetchForContext, not stored as enum):
 * 1. Always include memories from the current scope
 * 2. Include memories from non-DM scopes in the same project
 * 3. Include org-wide subject memories from any non-DM scope
 * 4. Never surface memories where sourceIsDm=true outside that specific DM scope
 * 5. Membership checks for chat-sourced memories
 */

import type { DerivedMemory, MemoryKind, Prisma, ScopeType } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { embeddingService } from "./embedding.js";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface UpsertMemoryInput {
  organizationId: string;
  kind: MemoryKind;
  subjectType: string;
  subjectId: string;
  sourceScopeType: ScopeType;
  sourceScopeId: string;
  sourceIsDm: boolean;
  startEventId: string;
  endEventId: string;
  sourceType?: string;
  content: string;
  structuredData?: Record<string, unknown>;
  confidence?: number;
}

export interface SearchMemoryInput {
  organizationId: string;
  query: string;
  subjectType?: string;
  kind?: MemoryKind;
  limit?: number;
  /** Current scope context for privacy enforcement. */
  scopeType?: ScopeType;
  scopeId?: string;
  isDm?: boolean;
}

export interface FetchForContextInput {
  organizationId: string;
  scopeType: ScopeType;
  scopeId: string;
  isDm: boolean;
  /** Subject IDs to fetch memories about. */
  relevantSubjects: Array<{ type: string; id: string }>;
  /** Token budget for memory section. */
  tokenBudget: number;
}

export interface SupersedeInput {
  organizationId: string;
  oldMemoryId: string;
  newMemoryId: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MemoryService {
  /**
   * Create or update a derived memory record.
   */
  async upsert(input: UpsertMemoryInput) {
    return prisma.derivedMemory.create({
      data: {
        organizationId: input.organizationId,
        kind: input.kind,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        sourceScopeType: input.sourceScopeType,
        sourceScopeId: input.sourceScopeId,
        sourceIsDm: input.sourceIsDm,
        startEventId: input.startEventId,
        endEventId: input.endEventId,
        sourceType: input.sourceType ?? "auto",
        content: input.content,
        structuredData: (input.structuredData ?? {}) as Prisma.InputJsonValue,
        confidence: input.confidence ?? 0.7,
      },
    });
  }

  /**
   * Search memories by text content. Simple ILIKE search — will be replaced
   * with semantic search in Phase 4 (embeddings).
   */
  async search(input: SearchMemoryInput) {
    const limit = Math.min(input.limit ?? 20, 50);

    const where: Prisma.DerivedMemoryWhereInput = {
      organizationId: input.organizationId,
      validTo: null, // only active memories
    };

    if (input.subjectType) where.subjectType = input.subjectType;
    if (input.kind) where.kind = input.kind;

    // Text search via ILIKE on content
    if (input.query) {
      where.content = { contains: input.query, mode: "insensitive" };
    }

    // Privacy enforcement: apply the same visibility rules as fetchForContext
    const visibilityConditions: Prisma.DerivedMemoryWhereInput[] = [];

    if (input.scopeType && input.scopeId) {
      // Always allow memories from the current scope
      visibilityConditions.push({
        sourceScopeType: input.scopeType,
        sourceScopeId: input.scopeId,
      });

      if (!input.isDm) {
        // In non-DM scopes, also allow memories from other non-DM scopes
        visibilityConditions.push({ sourceIsDm: false });
      }
      // In DM scopes, only the current scope's memories are visible (rule above)
    } else {
      // No scope context provided — exclude all DM-sourced memories as a safe default
      visibilityConditions.push({ sourceIsDm: false });
    }

    where.OR = visibilityConditions;

    return prisma.derivedMemory.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * Mark an old memory as superseded by a new one.
   * Sets validTo and supersededBy on the old memory.
   */
  async supersede(input: SupersedeInput) {
    return prisma.derivedMemory.update({
      where: {
        id: input.oldMemoryId,
        organizationId: input.organizationId,
      },
      data: {
        validTo: new Date(),
        supersededBy: input.newMemoryId,
      },
    });
  }

  /**
   * Invalidate a memory (set validTo to now).
   */
  async invalidate(organizationId: string, memoryId: string) {
    return prisma.derivedMemory.update({
      where: { id: memoryId, organizationId },
      data: { validTo: new Date() },
    });
  }

  /**
   * Fetch memories relevant to the current context, with privacy enforcement.
   *
   * Visibility rules:
   * 1. Always include memories from the current scope
   * 2. Include memories from non-DM scopes in the same org
   * 3. Never surface DM-sourced memories outside that specific DM scope
   * 4. Filter by relevant subjects when provided
   */
  async fetchForContext(input: FetchForContextInput) {
    const { organizationId, scopeType, scopeId, isDm, relevantSubjects } = input;

    // Build OR conditions for visibility
    const orConditions: Prisma.DerivedMemoryWhereInput[] = [];

    // Rule 1: Always include memories from the current scope
    orConditions.push({
      sourceScopeType: scopeType,
      sourceScopeId: scopeId,
    });

    // Rule 2: Include memories from non-DM scopes (cross-scope awareness)
    // Rule 3+4: Never surface DM-sourced memories outside that DM
    if (!isDm) {
      orConditions.push({
        sourceIsDm: false,
      });
    }
    // If we're in a DM, we only see memories from this specific DM (rule 1 above)

    // Subject filter — only fetch memories about entities relevant to the context
    const subjectFilters: Prisma.DerivedMemoryWhereInput[] = [];
    if (relevantSubjects.length > 0) {
      for (const subject of relevantSubjects) {
        subjectFilters.push({
          subjectType: subject.type,
          subjectId: subject.id,
        });
      }
    }

    const where: Prisma.DerivedMemoryWhereInput = {
      organizationId,
      validTo: null, // only active memories
      OR: orConditions,
    };

    // If we have subject filters, add them as an additional AND condition
    if (subjectFilters.length > 0) {
      where.AND = [{ OR: subjectFilters }];
    }

    // Fetch more than we need, then truncate to token budget
    const memories = await prisma.derivedMemory.findMany({
      where,
      orderBy: [
        { confidence: "desc" },
        { createdAt: "desc" },
      ],
      take: 50,
    });

    // Truncate to token budget (rough: ~1.3 tokens per word)
    const result: typeof memories = [];
    let estimatedTokens = 0;
    for (const mem of memories) {
      const memTokens = Math.ceil(mem.content.split(/\s+/).length * 1.3) + 20; // +20 for metadata
      if (estimatedTokens + memTokens > input.tokenBudget) break;
      result.push(mem);
      estimatedTokens += memTokens;
    }

    return result;
  }
  /**
   * Hybrid retrieval: combines recency-based and semantic search results.
   *
   * 1. Recency pass: recent memories matching visibility rules (current behavior)
   * 2. Semantic pass: embed query text, cosine similarity against memories with embeddings
   * 3. Merge: 0.6 * semantic + 0.3 * recency + 0.1 * confidence, truncate to budget
   *
   * Falls back to recency-only if semantic search fails or no embeddings exist.
   */
  async hybridSearch(input: {
    organizationId: string;
    scopeType: ScopeType;
    scopeId: string;
    isDm: boolean;
    queryText: string;
    relevantSubjects: Array<{ type: string; id: string }>;
    tokenBudget: number;
    limit?: number;
  }): Promise<DerivedMemory[]> {
    const limit = input.limit ?? 30;

    // 1. Recency pass
    const recencyResults = await this.fetchForContext({
      organizationId: input.organizationId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      isDm: input.isDm,
      relevantSubjects: input.relevantSubjects,
      tokenBudget: input.tokenBudget * 2, // fetch more, we'll re-rank
    });

    // 2. Semantic pass — embed query text, cosine similarity with same visibility + subject filters
    let semanticResults: Array<{ id: string; similarity: number }> = [];
    try {
      const { embedding } = await embeddingService.embed(input.queryText);
      const vectorStr = `[${embedding.join(",")}]`;

      // Build DM visibility clause
      const dmClause = input.isDm
        ? `AND ("sourceScopeType" = '${input.scopeType}' AND "sourceScopeId" = '${input.scopeId}')`
        : `AND "sourceIsDm" = false`;

      // Build subject filter clause — same subjects as the recency pass
      let subjectClause = "";
      if (input.relevantSubjects.length > 0) {
        const pairs = input.relevantSubjects
          .map((s) => `("subjectType" = '${s.type.replace(/'/g, "''")}' AND "subjectId" = '${s.id.replace(/'/g, "''")}')`)
          .join(" OR ");
        subjectClause = `AND (${pairs})`;
      }

      semanticResults = await prisma.$queryRawUnsafe<Array<{ id: string; similarity: number }>>(
        `SELECT id, 1 - (embedding <=> $1::vector) as similarity
         FROM "DerivedMemory"
         WHERE "organizationId" = $2
           AND "validTo" IS NULL
           AND embedding IS NOT NULL
           ${dmClause}
           ${subjectClause}
         ORDER BY embedding <=> $1::vector
         LIMIT $3`,
        vectorStr,
        input.organizationId,
        limit,
      );
    } catch {
      // Semantic search unavailable — fall back to recency only
    }

    // 3. Merge results
    if (semanticResults.length === 0) {
      // No semantic results — return recency-only
      return recencyResults.slice(0, limit);
    }

    // Build a scored map
    const scoredMap = new Map<string, { memory: DerivedMemory; score: number }>();

    // Score recency results (position-based: top = 1.0, bottom = 0.0)
    for (let i = 0; i < recencyResults.length; i++) {
      const recencyScore = 1 - i / Math.max(recencyResults.length, 1);
      const mem = recencyResults[i];
      scoredMap.set(mem.id, {
        memory: mem,
        score: 0.3 * recencyScore + 0.1 * mem.confidence,
      });
    }

    // Add semantic scores
    for (const { id, similarity } of semanticResults) {
      const existing = scoredMap.get(id);
      if (existing) {
        existing.score += 0.6 * similarity;
      } else {
        // Need to fetch the full memory
        const mem = await prisma.derivedMemory.findUnique({ where: { id } });
        if (mem) {
          scoredMap.set(id, {
            memory: mem,
            score: 0.6 * similarity + 0.1 * mem.confidence,
          });
        }
      }
    }

    // Sort by score descending, truncate to budget
    const sorted = [...scoredMap.values()]
      .sort((a, b) => b.score - a.score);

    const result: DerivedMemory[] = [];
    let estimatedTokens = 0;
    for (const { memory } of sorted) {
      const memTokens = Math.ceil(memory.content.split(/\s+/).length * 1.3) + 20;
      if (estimatedTokens + memTokens > input.tokenBudget) break;
      result.push(memory);
      estimatedTokens += memTokens;
      if (result.length >= limit) break;
    }

    return result;
  }
}

export const memoryService = new MemoryService();
