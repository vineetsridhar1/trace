import { Prisma, type EventType, type ScopeType } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { memoryService } from "../services/memory.js";
import { summaryService } from "../services/summary.js";
import { costTrackingService } from "../services/cost-tracking.js";
import {
  extractMemories,
  EXTRACTABLE_EVENT_TYPES,
  type ExtractionEvent,
} from "./memory-extractor-prompt.js";
import { refreshSummary } from "./summary-worker.js";
import { estimateCostCents } from "./cost-utils.js";

const EVENTS_PER_EXTRACTION = 50;
const EXTRACTION_MODEL = process.env.AGENT_MEMORY_MODEL ?? "claude-haiku-4-5-20251001";

type CliOptions = {
  organizationId?: string;
  scopeType?: ScopeType;
  scopeId?: string;
  since?: Date;
  limitScopes?: number;
  memories: boolean;
  summaries: boolean;
  dryRun: boolean;
};

type ScopeRow = {
  organizationId: string;
  scopeType: ScopeType;
  scopeId: string;
  eventCount: number;
  lastEventTimestamp: Date;
};

type BackfillScope = ScopeRow & {
  memories: boolean;
  summaries: boolean;
};

type ExtractionCursor = {
  timestamp: string;
  eventId: string;
};

type MemoryBackfillStats = {
  batches: number;
  eventsProcessed: number;
  memoriesWritten: number;
};

type SummaryBackfillStats = {
  refreshes: number;
  finalEventCount: number;
};

function printUsage(): void {
  console.log(`Usage:
  pnpm --filter @trace/server backfill:ambient-memory [options]

Options:
  --org <id>               Backfill one organization
  --scope-type <type>      Limit to one scope type (channel|chat|session|ticket|system)
  --scope-id <id>          Limit to one scope id (requires --scope-type)
  --since <iso8601>        Only select scopes with activity at or after this timestamp
  --limit-scopes <n>       Stop after N scopes
  --memories-only          Only backfill derived memories
  --summaries-only         Only backfill rolling summaries
  --dry-run                Report pending work without writing or calling the LLM
  --help                   Show this help
`);
}

function parseScopeType(raw: string): ScopeType {
  const value = raw as ScopeType;
  if (["channel", "chat", "session", "ticket", "system"].includes(value)) {
    return value;
  }
  throw new Error(`invalid --scope-type: ${raw}`);
}

function parseArgs(argv: string[]): CliOptions {
  let organizationId: string | undefined;
  let scopeType: ScopeType | undefined;
  let scopeId: string | undefined;
  let since: Date | undefined;
  let limitScopes: number | undefined;
  let memoriesOnly = false;
  let summariesOnly = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--org" && argv[i + 1]) {
      organizationId = argv[++i];
      continue;
    }
    if (arg === "--scope-type" && argv[i + 1]) {
      scopeType = parseScopeType(argv[++i]);
      continue;
    }
    if (arg === "--scope-id" && argv[i + 1]) {
      scopeId = argv[++i];
      continue;
    }
    if (arg === "--since" && argv[i + 1]) {
      since = new Date(argv[++i]);
      if (Number.isNaN(since.getTime())) {
        throw new Error("invalid --since value");
      }
      continue;
    }
    if (arg === "--limit-scopes" && argv[i + 1]) {
      limitScopes = parseInt(argv[++i], 10);
      if (!Number.isFinite(limitScopes) || limitScopes <= 0) {
        throw new Error("invalid --limit-scopes value");
      }
      continue;
    }
    if (arg === "--memories-only") {
      memoriesOnly = true;
      continue;
    }
    if (arg === "--summaries-only") {
      summariesOnly = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  if (scopeId && !scopeType) {
    throw new Error("--scope-id requires --scope-type");
  }
  if (memoriesOnly && summariesOnly) {
    throw new Error("choose at most one of --memories-only or --summaries-only");
  }

  return {
    organizationId,
    scopeType,
    scopeId,
    since,
    limitScopes,
    memories: !summariesOnly,
    summaries: !memoriesOnly,
    dryRun,
  };
}

function buildScopeWhere(options: CliOptions, eventTypes?: string[]): Prisma.Sql {
  const filters: Prisma.Sql[] = [Prisma.sql`TRUE`];

  if (options.organizationId) {
    filters.push(Prisma.sql`e."organizationId" = ${options.organizationId}`);
  }
  if (options.scopeType) {
    filters.push(Prisma.sql`e."scopeType" = ${options.scopeType}`);
  }
  if (options.scopeId) {
    filters.push(Prisma.sql`e."scopeId" = ${options.scopeId}`);
  }
  if (options.since) {
    filters.push(Prisma.sql`e."timestamp" >= ${options.since}`);
  }
  if (eventTypes && eventTypes.length > 0) {
    filters.push(Prisma.sql`e."eventType" IN (${Prisma.join(eventTypes)})`);
  }

  return Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}`;
}

async function discoverScopes(options: CliOptions, eventTypes?: string[]): Promise<ScopeRow[]> {
  const rows = await prisma.$queryRaw<ScopeRow[]>(Prisma.sql`
    SELECT
      e."organizationId",
      e."scopeType",
      e."scopeId",
      COUNT(*)::integer AS "eventCount",
      MAX(e."timestamp") AS "lastEventTimestamp"
    FROM "Event" e
    ${buildScopeWhere(options, eventTypes)}
    GROUP BY e."organizationId", e."scopeType", e."scopeId"
    ORDER BY MAX(e."timestamp") DESC
  `);

  return rows;
}

async function loadBackfillScopes(options: CliOptions): Promise<BackfillScope[]> {
  const scopeMap = new Map<string, BackfillScope>();

  const attachRows = (rows: ScopeRow[], key: "memories" | "summaries") => {
    for (const row of rows) {
      const scopeKey = `${row.organizationId}:${row.scopeType}:${row.scopeId}`;
      const existing = scopeMap.get(scopeKey);
      if (existing) {
        existing[key] = true;
        existing.eventCount = Math.max(existing.eventCount, row.eventCount);
        if (row.lastEventTimestamp > existing.lastEventTimestamp) {
          existing.lastEventTimestamp = row.lastEventTimestamp;
        }
        continue;
      }

      scopeMap.set(scopeKey, {
        ...row,
        memories: key === "memories",
        summaries: key === "summaries",
      });
    }
  };

  if (options.memories) {
    attachRows(await discoverScopes(options, [...EXTRACTABLE_EVENT_TYPES]), "memories");
  }

  if (options.summaries) {
    attachRows(await discoverScopes(options), "summaries");
  }

  const scopes = [...scopeMap.values()].sort(
    (a, b) => b.lastEventTimestamp.getTime() - a.lastEventTimestamp.getTime(),
  );

  return typeof options.limitScopes === "number" ? scopes.slice(0, options.limitScopes) : scopes;
}

function buildMemoryEventWhere(input: {
  organizationId: string;
  scopeType: ScopeType;
  scopeId: string;
  cursor: ExtractionCursor | null;
  since?: Date;
}): Prisma.EventWhereInput {
  const whereClause: Prisma.EventWhereInput = {
    organizationId: input.organizationId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    eventType: { in: [...EXTRACTABLE_EVENT_TYPES] as EventType[] },
  };

  const andClauses: Prisma.EventWhereInput[] = [];

  if (input.cursor) {
    const cursorTimestamp = new Date(input.cursor.timestamp);
    andClauses.push({
      OR: [
        { timestamp: { gt: cursorTimestamp } },
        {
          timestamp: cursorTimestamp,
          id: { gt: input.cursor.eventId },
        },
      ],
    });
  }

  if (input.since) {
    andClauses.push({ timestamp: { gte: input.since } });
  }

  if (andClauses.length > 0) {
    whereClause.AND = andClauses;
  }

  return whereClause;
}

async function loadMemoryCursor(
  organizationId: string,
  scopeType: ScopeType,
  scopeId: string,
): Promise<ExtractionCursor | null> {
  const cursor = await prisma.memoryExtractionCursor.findUnique({
    where: {
      organizationId_scopeType_scopeId: {
        organizationId,
        scopeType,
        scopeId,
      },
    },
    select: {
      lastEventId: true,
      lastEventTimestamp: true,
    },
  });

  if (!cursor) return null;
  return {
    timestamp: cursor.lastEventTimestamp.toISOString(),
    eventId: cursor.lastEventId,
  };
}

async function saveMemoryCursor(
  organizationId: string,
  scopeType: ScopeType,
  scopeId: string,
  cursor: ExtractionCursor,
): Promise<void> {
  await prisma.memoryExtractionCursor.upsert({
    where: {
      organizationId_scopeType_scopeId: {
        organizationId,
        scopeType,
        scopeId,
      },
    },
    create: {
      organizationId,
      scopeType,
      scopeId,
      lastEventId: cursor.eventId,
      lastEventTimestamp: new Date(cursor.timestamp),
    },
    update: {
      lastEventId: cursor.eventId,
      lastEventTimestamp: new Date(cursor.timestamp),
    },
  });
}

const chatDmCache = new Map<string, boolean>();

async function isDmScope(scopeType: ScopeType, scopeId: string): Promise<boolean> {
  if (scopeType !== "chat") return false;

  const cached = chatDmCache.get(scopeId);
  if (typeof cached === "boolean") return cached;

  const chat = await prisma.chat.findUnique({
    where: { id: scopeId },
    select: { type: true },
  });
  const isDm = chat?.type === "dm";
  chatDmCache.set(scopeId, isDm);
  return isDm;
}

async function backfillMemoriesForScope(
  scope: BackfillScope,
  options: CliOptions,
): Promise<MemoryBackfillStats> {
  const stats: MemoryBackfillStats = {
    batches: 0,
    eventsProcessed: 0,
    memoriesWritten: 0,
  };

  if (options.dryRun) {
    const pendingEventCount = await prisma.event.count({
      where: buildMemoryEventWhere({
        organizationId: scope.organizationId,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        cursor: await loadMemoryCursor(scope.organizationId, scope.scopeType, scope.scopeId),
        since: options.since,
      }),
    });
    stats.eventsProcessed = pendingEventCount;
    stats.batches = Math.ceil(pendingEventCount / EVENTS_PER_EXTRACTION);
    return stats;
  }

  const sourceIsDm = await isDmScope(scope.scopeType, scope.scopeId);

  while (true) {
    const cursor = await loadMemoryCursor(scope.organizationId, scope.scopeType, scope.scopeId);
    const events = await prisma.event.findMany({
      where: buildMemoryEventWhere({
        organizationId: scope.organizationId,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        cursor,
        since: options.since,
      }),
      orderBy: [{ timestamp: "asc" }, { id: "asc" }],
      take: EVENTS_PER_EXTRACTION,
    });

    if (events.length === 0) {
      return stats;
    }

    const extractionEvents: ExtractionEvent[] = events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      actorType: event.actorType,
      actorId: event.actorId,
      payload: event.payload as Record<string, unknown>,
      timestamp: event.timestamp.toISOString(),
    }));

    const extraction = await extractMemories(extractionEvents, {
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
    });

    const startEventId = events[0].id;
    const endEventId = events[events.length - 1].id;

    for (const memory of extraction.memories) {
      await memoryService.upsert({
        organizationId: scope.organizationId,
        kind: memory.kind,
        subjectType: memory.subjectType,
        subjectId: memory.subjectId,
        sourceScopeType: scope.scopeType,
        sourceScopeId: scope.scopeId,
        sourceIsDm,
        startEventId,
        endEventId,
        sourceType: "auto",
        content: memory.content,
        structuredData: memory.structuredData,
        confidence: memory.confidence,
      });
    }

    const newestProcessed = events[events.length - 1];
    await saveMemoryCursor(scope.organizationId, scope.scopeType, scope.scopeId, {
      timestamp: newestProcessed.timestamp.toISOString(),
      eventId: newestProcessed.id,
    });

    if (extraction.inputTokens > 0 || extraction.outputTokens > 0) {
      const costCents = estimateCostCents(
        EXTRACTION_MODEL,
        extraction.inputTokens,
        extraction.outputTokens,
      );
      await costTrackingService.recordCost({
        organizationId: scope.organizationId,
        modelTier: "tier2",
        costCents,
        isSummary: false,
      });
    }

    stats.batches += 1;
    stats.eventsProcessed += events.length;
    stats.memoriesWritten += extraction.memories.length;
  }
}

async function backfillSummariesForScope(
  scope: BackfillScope,
  options: CliOptions,
): Promise<SummaryBackfillStats> {
  const stats: SummaryBackfillStats = {
    refreshes: 0,
    finalEventCount: 0,
  };

  if (options.dryRun) {
    const existing = await summaryService.getLatest({
      organizationId: scope.organizationId,
      entityType: scope.scopeType,
      entityId: scope.scopeId,
    });
    stats.finalEventCount = await summaryService.countEventsSince({
      organizationId: scope.organizationId,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      afterEventId: existing?.endEventId ?? undefined,
    });
    return stats;
  }

  let previousEndEventId: string | null = null;
  while (true) {
    const before = await summaryService.getLatest({
      organizationId: scope.organizationId,
      entityType: scope.scopeType,
      entityId: scope.scopeId,
    });

    const result = await refreshSummary(scope.organizationId, scope.scopeType, scope.scopeId);
    if (!result) {
      const current = await summaryService.getLatest({
        organizationId: scope.organizationId,
        entityType: scope.scopeType,
        entityId: scope.scopeId,
      });
      stats.finalEventCount = current?.eventCount ?? before?.eventCount ?? 0;
      return stats;
    }

    const after = await summaryService.getLatest({
      organizationId: scope.organizationId,
      entityType: scope.scopeType,
      entityId: scope.scopeId,
    });
    if (!after) {
      throw new Error(
        `summary refresh returned success but no summary exists for ${scope.scopeType}:${scope.scopeId}`,
      );
    }
    if (after.endEventId === previousEndEventId) {
      throw new Error(
        `summary backfill stalled for ${scope.scopeType}:${scope.scopeId} at ${after.endEventId}`,
      );
    }

    previousEndEventId = after.endEventId ?? null;
    stats.refreshes += 1;
    stats.finalEventCount = after.eventCount;
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (
    (options.memories || options.summaries) &&
    !process.env.ANTHROPIC_API_KEY &&
    !options.dryRun
  ) {
    throw new Error("ANTHROPIC_API_KEY is required for backfill runs");
  }

  const scopes = await loadBackfillScopes(options);
  if (scopes.length === 0) {
    console.log("No matching scopes found.");
    return;
  }

  console.log(
    `Backfilling ${scopes.length} scope(s) ` +
      `(memories=${options.memories}, summaries=${options.summaries}, dryRun=${options.dryRun})`,
  );

  let memoryScopesProcessed = 0;
  let summaryScopesProcessed = 0;
  let memoryEventsProcessed = 0;
  let memoriesWritten = 0;
  let summaryRefreshes = 0;

  for (let i = 0; i < scopes.length; i++) {
    const scope = scopes[i];
    console.log(
      `[${i + 1}/${scopes.length}] ${scope.organizationId} ${scope.scopeType}:${scope.scopeId} ` +
        `(memories=${scope.memories}, summaries=${scope.summaries})`,
    );

    if (scope.memories) {
      const stats = await backfillMemoriesForScope(scope, options);
      memoryScopesProcessed += 1;
      memoryEventsProcessed += stats.eventsProcessed;
      memoriesWritten += stats.memoriesWritten;
      console.log(
        `  memories: batches=${stats.batches} events=${stats.eventsProcessed} written=${stats.memoriesWritten}`,
      );
    }

    if (scope.summaries) {
      const stats = await backfillSummariesForScope(scope, options);
      summaryScopesProcessed += 1;
      summaryRefreshes += stats.refreshes;
      console.log(
        `  summaries: refreshes=${stats.refreshes} finalEventCount=${stats.finalEventCount}`,
      );
    }
  }

  console.log("Backfill complete.");
  console.log(
    JSON.stringify(
      {
        memoryScopesProcessed,
        summaryScopesProcessed,
        memoryEventsProcessed,
        memoriesWritten,
        summaryRefreshes,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
