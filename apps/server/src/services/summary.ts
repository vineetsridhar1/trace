import type { SummaryType, Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GetLatestInput {
  organizationId: string;
  entityType: string;
  entityId: string;
  summaryType?: SummaryType;
}

export interface UpsertSummaryInput {
  organizationId: string;
  entityType: string;
  entityId: string;
  summaryType?: SummaryType;
  content: string;
  structuredData?: Record<string, unknown>;
  startEventId?: string;
  endEventId?: string;
  eventCount: number;
}

export interface FreshnessCheck {
  /** True if the summary is up-to-date enough for the current context. */
  fresh: boolean;
  /** Number of new events since the summary was last updated. */
  newEventCount: number;
  /** Minutes since the summary was last updated. */
  minutesSinceUpdate: number;
}

/** Default thresholds for staleness — matches ai-plan spec. */
const STALE_EVENT_THRESHOLD = 20;
const STALE_MINUTES_THRESHOLD = 30;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SummaryService {
  /**
   * Fetch the most recent summary for an entity.
   * Defaults to the rolling summary type.
   */
  async getLatest(input: GetLatestInput) {
    const summaryType = input.summaryType ?? "rolling";
    return prisma.entitySummary.findUnique({
      where: {
        organizationId_entityType_entityId_summaryType: {
          organizationId: input.organizationId,
          entityType: input.entityType,
          entityId: input.entityId,
          summaryType,
        },
      },
    });
  }

  /**
   * Create or update a summary for an entity.
   * Uses the unique constraint on (org, entityType, entityId, summaryType).
   */
  async upsert(input: UpsertSummaryInput) {
    const summaryType = input.summaryType ?? "rolling";
    const structuredData = (input.structuredData ?? {}) as Prisma.InputJsonValue;

    return prisma.entitySummary.upsert({
      where: {
        organizationId_entityType_entityId_summaryType: {
          organizationId: input.organizationId,
          entityType: input.entityType,
          entityId: input.entityId,
          summaryType,
        },
      },
      create: {
        organizationId: input.organizationId,
        entityType: input.entityType,
        entityId: input.entityId,
        summaryType,
        content: input.content,
        structuredData,
        startEventId: input.startEventId,
        endEventId: input.endEventId,
        eventCount: input.eventCount,
      },
      update: {
        content: input.content,
        structuredData,
        startEventId: input.startEventId,
        endEventId: input.endEventId,
        eventCount: input.eventCount,
      },
    });
  }

  /**
   * Check whether a summary is fresh enough or needs regeneration.
   *
   * A summary is stale when:
   * - 20+ new events have been produced since the last summary, OR
   * - 30+ minutes have elapsed since the last update
   *
   * @param currentEventCount - the total number of events in the scope right now
   */
  isFresh(
    summary: { eventCount: number; updatedAt: Date } | null,
    currentEventCount: number,
  ): FreshnessCheck {
    if (!summary) {
      return { fresh: false, newEventCount: currentEventCount, minutesSinceUpdate: Infinity };
    }

    const newEventCount = currentEventCount - summary.eventCount;
    const minutesSinceUpdate =
      (Date.now() - summary.updatedAt.getTime()) / 60_000;

    const fresh =
      newEventCount < STALE_EVENT_THRESHOLD &&
      minutesSinceUpdate < STALE_MINUTES_THRESHOLD;

    return { fresh, newEventCount, minutesSinceUpdate };
  }

  /**
   * Find all summaries that are stale by time across all orgs.
   * Event-count staleness is tracked via Redis counters in the summary worker.
   */
  async findStale(input: {
    minutesThreshold?: number;
    limit?: number;
  }) {
    const minutesThreshold = input.minutesThreshold ?? STALE_MINUTES_THRESHOLD;
    const limit = input.limit ?? 50;
    const cutoff = new Date(Date.now() - minutesThreshold * 60_000);

    // Find summaries that are stale by time.
    // Event-count staleness is checked at query time by the caller
    // because we need to compare against current scope event counts.
    return prisma.entitySummary.findMany({
      where: {
        summaryType: "rolling",
        updatedAt: { lt: cutoff },
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
    });
  }

  /**
   * Count events in a scope since the last summary was produced.
   */
  async countEventsSince(input: {
    organizationId: string;
    scopeType: string;
    scopeId: string;
    afterEventId?: string;
  }): Promise<number> {
    const where: Prisma.EventWhereInput = {
      organizationId: input.organizationId,
      scopeType: input.scopeType as Prisma.EventWhereInput["scopeType"],
      scopeId: input.scopeId,
    };

    if (input.afterEventId) {
      // Get the timestamp of the last summarized event to filter efficiently
      const lastEvent = await prisma.event.findUnique({
        where: { id: input.afterEventId },
        select: { timestamp: true },
      });
      if (lastEvent) {
        where.timestamp = { gt: lastEvent.timestamp };
      }
    }

    return prisma.event.count({ where });
  }

  /**
   * Fetch recent events for a scope, used as input for summary generation.
   */
  async getEventsForSummary(input: {
    organizationId: string;
    scopeType: string;
    scopeId: string;
    afterEventId?: string;
    limit?: number;
  }) {
    const limit = input.limit ?? 100;
    const where: Prisma.EventWhereInput = {
      organizationId: input.organizationId,
      scopeType: input.scopeType as Prisma.EventWhereInput["scopeType"],
      scopeId: input.scopeId,
    };

    if (input.afterEventId) {
      const lastEvent = await prisma.event.findUnique({
        where: { id: input.afterEventId },
        select: { timestamp: true },
      });
      if (lastEvent) {
        where.timestamp = { gt: lastEvent.timestamp };
      }
    }

    return prisma.event.findMany({
      where,
      orderBy: { timestamp: "asc" },
      take: limit,
    });
  }
}

export const summaryService = new SummaryService();
