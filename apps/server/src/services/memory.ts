/**
 * Memory Service — manages DerivedMemory records with provenance, lifecycle,
 * and query-time visibility enforcement.
 *
 * Visibility rules:
 * 1. Always include memories from the current scope
 * 2. Never surface DM memories outside that specific DM
 * 3. Allow non-chat memories across scopes when they share a project
 * 4. Allow org-shared subjects (user/project/repo/team) from non-chat, non-DM scopes
 * 5. Keep chat-sourced memories scoped to the originating chat unless we have
 *    a stronger membership model for broader reuse
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

type ScopeMetadata = {
  type: ScopeType;
  id: string;
  isDm: boolean;
  projectIds: string[];
};

type VisibilityContext = {
  scopeType: ScopeType;
  scopeId: string;
  isDm: boolean;
};

const ORG_SHARED_SUBJECT_TYPES = new Set(["user", "project", "repo", "team"]);
const RECENCY_CANDIDATE_LIMIT = 200;
const SEMANTIC_CANDIDATE_MULTIPLIER = 4;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MemoryService {
  /**
   * Create a derived memory record.
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
   * Search memories by text content.
   */
  async search(input: SearchMemoryInput) {
    const limit = Math.min(input.limit ?? 20, 50);
    const candidates = await this.queryCandidateMemories({
      organizationId: input.organizationId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      isDm: input.isDm ?? false,
      subjectType: input.subjectType,
      kind: input.kind,
      contentQuery: input.query,
      candidateLimit: Math.max(limit * 4, 50),
    });

    const visible = input.scopeType && input.scopeId
      ? await this.filterVisibleMemories(candidates, {
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          isDm: input.isDm ?? false,
        })
      : this.filterSafeOrgWideMemories(candidates);

    return visible.slice(0, limit);
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
   */
  async fetchForContext(input: FetchForContextInput) {
    const candidates = await this.queryCandidateMemories({
      organizationId: input.organizationId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      isDm: input.isDm,
      relevantSubjects: input.relevantSubjects,
      candidateLimit: RECENCY_CANDIDATE_LIMIT,
    });

    const visible = await this.filterVisibleMemories(candidates, input);
    return truncateMemoriesToBudget(visible, input.tokenBudget);
  }

  /**
   * Hybrid retrieval: combines recency-based and semantic search results.
   *
   * Falls back to recency-only if semantic search fails or embeddings are unavailable.
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

    const recencyResults = await this.fetchForContext({
      organizationId: input.organizationId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      isDm: input.isDm,
      relevantSubjects: input.relevantSubjects,
      tokenBudget: input.tokenBudget * 2,
    });

    if (!input.queryText.trim() || !embeddingService.isConfigured()) {
      return recencyResults.slice(0, limit);
    }

    try {
      const { embedding } = await embeddingService.embed(input.queryText);
      const vectorStr = `[${embedding.join(",")}]`;
      const semanticRows = await prisma.$queryRawUnsafe<Array<{ id: string; similarity: number }>>(
        this.buildSemanticSearchSql(input, vectorStr),
      );

      if (semanticRows.length === 0) {
        return recencyResults.slice(0, limit);
      }

      const semanticMemories = await prisma.derivedMemory.findMany({
        where: {
          id: { in: semanticRows.map((row) => row.id) },
        },
      });
      const visibleSemanticMemories = await this.filterVisibleMemories(semanticMemories, input);
      const semanticSimilarityById = new Map(
        semanticRows.map((row) => [row.id, row.similarity] as const),
      );

      if (visibleSemanticMemories.length === 0) {
        return recencyResults.slice(0, limit);
      }

      const scoredMap = new Map<string, { memory: DerivedMemory; score: number }>();

      for (let i = 0; i < recencyResults.length; i++) {
        const recencyScore = 1 - i / Math.max(recencyResults.length, 1);
        const mem = recencyResults[i];
        scoredMap.set(mem.id, {
          memory: mem,
          score: 0.3 * recencyScore + 0.1 * mem.confidence,
        });
      }

      for (const memory of visibleSemanticMemories) {
        const similarity = semanticSimilarityById.get(memory.id);
        if (similarity == null) continue;

        const existing = scoredMap.get(memory.id);
        if (existing) {
          existing.score += 0.6 * similarity;
        } else {
          scoredMap.set(memory.id, {
            memory,
            score: 0.6 * similarity + 0.1 * memory.confidence,
          });
        }
      }

      const ranked = [...scoredMap.values()]
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.memory);

      return truncateMemoriesToBudget(ranked, input.tokenBudget).slice(0, limit);
    } catch {
      return recencyResults.slice(0, limit);
    }
  }

  private async queryCandidateMemories(input: {
    organizationId: string;
    scopeType?: ScopeType;
    scopeId?: string;
    isDm?: boolean;
    relevantSubjects?: Array<{ type: string; id: string }>;
    subjectType?: string;
    kind?: MemoryKind;
    contentQuery?: string;
    candidateLimit: number;
  }): Promise<DerivedMemory[]> {
    const where: Prisma.DerivedMemoryWhereInput = {
      organizationId: input.organizationId,
      validTo: null,
    };

    if (input.scopeType && input.scopeId) {
      where.OR = input.isDm
        ? [{ sourceScopeType: input.scopeType, sourceScopeId: input.scopeId }]
        : [
            { sourceScopeType: input.scopeType, sourceScopeId: input.scopeId },
            { sourceIsDm: false },
          ];
    } else {
      where.sourceIsDm = false;
    }

    if (input.subjectType) where.subjectType = input.subjectType;
    if (input.kind) where.kind = input.kind;
    if (input.contentQuery) {
      where.content = { contains: input.contentQuery, mode: "insensitive" };
    }
    if (input.relevantSubjects && input.relevantSubjects.length > 0) {
      where.AND = [
        {
          OR: input.relevantSubjects.map((subject) => ({
            subjectType: subject.type,
            subjectId: subject.id,
          })),
        },
      ];
    }

    return prisma.derivedMemory.findMany({
      where,
      orderBy: [
        { confidence: "desc" },
        { createdAt: "desc" },
      ],
      take: input.candidateLimit,
    });
  }

  private async filterVisibleMemories(
    memories: DerivedMemory[],
    context: VisibilityContext,
  ): Promise<DerivedMemory[]> {
    if (memories.length === 0) return [];

    const metadataByScope = await this.loadScopeMetadata([
      { scopeType: context.scopeType, scopeId: context.scopeId },
      ...memories.map((memory) => ({
        scopeType: memory.sourceScopeType,
        scopeId: memory.sourceScopeId,
      })),
    ]);

    const currentScope = metadataByScope.get(scopeKey(context.scopeType, context.scopeId)) ?? {
      type: context.scopeType,
      id: context.scopeId,
      isDm: context.isDm,
      projectIds: [],
    };

    return memories.filter((memory) => {
      const sourceScope = metadataByScope.get(
        scopeKey(memory.sourceScopeType, memory.sourceScopeId),
      );
      return isMemoryVisibleInContext(memory, currentScope, sourceScope);
    });
  }

  private filterSafeOrgWideMemories(memories: DerivedMemory[]): DerivedMemory[] {
    return memories.filter((memory) =>
      !memory.sourceIsDm &&
      memory.sourceScopeType !== "chat" &&
      ORG_SHARED_SUBJECT_TYPES.has(memory.subjectType),
    );
  }

  private async loadScopeMetadata(
    refs: Array<{ scopeType: ScopeType; scopeId: string }>,
  ): Promise<Map<string, ScopeMetadata>> {
    const metadata = new Map<string, ScopeMetadata>();
    const idsByType = new Map<ScopeType, Set<string>>();

    for (const ref of refs) {
      const ids = idsByType.get(ref.scopeType) ?? new Set<string>();
      ids.add(ref.scopeId);
      idsByType.set(ref.scopeType, ids);
    }

    const chatIds = [...(idsByType.get("chat") ?? new Set<string>())];
    const channelIds = [...(idsByType.get("channel") ?? new Set<string>())];
    const sessionIds = [...(idsByType.get("session") ?? new Set<string>())];
    const ticketIds = [...(idsByType.get("ticket") ?? new Set<string>())];
    const systemIds = [...(idsByType.get("system") ?? new Set<string>())];

    const [
      chats,
      channels,
      sessions,
      tickets,
    ] = await Promise.all([
      chatIds.length > 0
        ? prisma.chat.findMany({
            where: { id: { in: chatIds } },
            select: { id: true, type: true },
          })
        : Promise.resolve([]),
      channelIds.length > 0
        ? prisma.channel.findMany({
            where: { id: { in: channelIds } },
            select: { id: true, projects: { select: { projectId: true } } },
          })
        : Promise.resolve([]),
      sessionIds.length > 0
        ? prisma.session.findMany({
            where: { id: { in: sessionIds } },
            select: { id: true, projects: { select: { projectId: true } } },
          })
        : Promise.resolve([]),
      ticketIds.length > 0
        ? prisma.ticket.findMany({
            where: { id: { in: ticketIds } },
            select: { id: true, projects: { select: { projectId: true } } },
          })
        : Promise.resolve([]),
    ]);

    for (const chat of chats) {
      metadata.set(scopeKey("chat", chat.id), {
        type: "chat",
        id: chat.id,
        isDm: chat.type === "dm",
        projectIds: [],
      });
    }

    for (const channel of channels) {
      metadata.set(scopeKey("channel", channel.id), {
        type: "channel",
        id: channel.id,
        isDm: false,
        projectIds: channel.projects.map((project) => project.projectId),
      });
    }

    for (const session of sessions) {
      metadata.set(scopeKey("session", session.id), {
        type: "session",
        id: session.id,
        isDm: false,
        projectIds: session.projects.map((project) => project.projectId),
      });
    }

    for (const ticket of tickets) {
      metadata.set(scopeKey("ticket", ticket.id), {
        type: "ticket",
        id: ticket.id,
        isDm: false,
        projectIds: ticket.projects.map((project) => project.projectId),
      });
    }

    for (const systemId of systemIds) {
      metadata.set(scopeKey("system", systemId), {
        type: "system",
        id: systemId,
        isDm: false,
        projectIds: [],
      });
    }

    return metadata;
  }

  private buildSemanticSearchSql(
    input: {
      organizationId: string;
      scopeType: ScopeType;
      scopeId: string;
      isDm: boolean;
      relevantSubjects: Array<{ type: string; id: string }>;
      limit?: number;
    },
    vectorStr: string,
  ): string {
    const semanticLimit = Math.max((input.limit ?? 30) * SEMANTIC_CANDIDATE_MULTIPLIER, 50);
    const scopeType = escapeSqlLiteral(input.scopeType);
    const scopeId = escapeSqlLiteral(input.scopeId);
    const organizationId = escapeSqlLiteral(input.organizationId);

    const visibilityClause = input.isDm
      ? `AND "sourceScopeType" = '${scopeType}' AND "sourceScopeId" = '${scopeId}'`
      : `AND (("sourceScopeType" = '${scopeType}' AND "sourceScopeId" = '${scopeId}') OR "sourceIsDm" = false)`;

    const subjectClause = input.relevantSubjects.length > 0
      ? `AND (${input.relevantSubjects
          .map((subject) =>
            `("subjectType" = '${escapeSqlLiteral(subject.type)}' AND "subjectId" = '${escapeSqlLiteral(subject.id)}')`,
          )
          .join(" OR ")})`
      : "";

    return `
      SELECT id, 1 - (embedding <=> '${escapeSqlLiteral(vectorStr)}'::vector) AS similarity
      FROM "DerivedMemory"
      WHERE "organizationId" = '${organizationId}'
        AND "validTo" IS NULL
        AND embedding IS NOT NULL
        ${visibilityClause}
        ${subjectClause}
      ORDER BY embedding <=> '${escapeSqlLiteral(vectorStr)}'::vector
      LIMIT ${semanticLimit}
    `;
  }
}

function scopeKey(scopeType: ScopeType, scopeId: string): string {
  return `${scopeType}:${scopeId}`;
}

function sharesProject(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a);
  return b.some((projectId) => set.has(projectId));
}

function isMemoryVisibleInContext(
  memory: DerivedMemory,
  currentScope: ScopeMetadata,
  sourceScope?: ScopeMetadata,
): boolean {
  if (
    memory.sourceScopeType === currentScope.type &&
    memory.sourceScopeId === currentScope.id
  ) {
    return true;
  }

  if (currentScope.isDm || memory.sourceIsDm || !sourceScope) {
    return false;
  }

  // Chat memories stay scoped to that chat unless we add a stronger
  // audience/membership model for safe cross-scope reuse.
  if (sourceScope.type === "chat") {
    return false;
  }

  if (sharesProject(currentScope.projectIds, sourceScope.projectIds)) {
    return true;
  }

  return ORG_SHARED_SUBJECT_TYPES.has(memory.subjectType);
}

function truncateMemoriesToBudget(
  memories: DerivedMemory[],
  tokenBudget: number,
): DerivedMemory[] {
  const result: DerivedMemory[] = [];
  let estimatedTokens = 0;

  for (const memory of memories) {
    const memoryTokens = Math.ceil(memory.content.split(/\s+/).length * 1.3) + 20;
    if (estimatedTokens + memoryTokens > tokenBudget) break;
    result.push(memory);
    estimatedTokens += memoryTokens;
  }

  return result;
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export const memoryService = new MemoryService();
