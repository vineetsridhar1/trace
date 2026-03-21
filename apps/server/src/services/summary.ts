/**
 * Summary Service — manages AI-generated rolling summaries for long-lived entities.
 *
 * Entity summaries are the compressed history that the planner reads.
 * They're maintained by a background worker and stored in the EntitySummary table.
 */

import type { EntitySummary, EntitySummaryType, ScopeType } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { generateSummary, type SummaryEvent } from "../agent/summary-generator.js";
import { costTrackingService } from "./cost-tracking.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of new events before a summary needs refreshing. */
const EVENT_FRESHNESS_THRESHOLD = 20;

/** Time in ms before a summary is considered stale (30 minutes). */
const TIME_FRESHNESS_THRESHOLD_MS = 30 * 60 * 1000;

/** Max entities to refresh per cycle to avoid overwhelming the LLM. */
const MAX_REFRESH_BATCH_SIZE = 10;

/** Max events to include in a single summary generation call. */
const MAX_EVENTS_PER_GENERATION = 100;

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface GetLatestInput {
  organizationId: string;
  entityType: ScopeType;
  entityId: string;
}

export interface UpsertInput {
  organizationId: string;
  entityType: ScopeType;
  entityId: string;
  summaryType?: EntitySummaryType;
  content: string;
  startEventId?: string;
  endEventId?: string;
  eventCount: number;
}

export interface IsFreshInput {
  summary: EntitySummary | null;
  currentEventCount: number;
  now?: Date;
}

export interface CountEventsSinceInput {
  organizationId: string;
  entityType: ScopeType;
  entityId: string;
  since: Date;
}

export interface StaleEntity {
  organizationId: string;
  entityType: ScopeType;
  entityId: string;
  existingSummary: EntitySummary | null;
  newEventCount: number;
}

export interface RefreshSummaryInput {
  organizationId: string;
  entityType: ScopeType;
  entityId: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SummaryService {
  /**
   * Fetch the most recent rolling summary for an entity.
   */
  async getLatest(input: GetLatestInput): Promise<EntitySummary | null> {
    return prisma.entitySummary.findUnique({
      where: {
        organizationId_entityType_entityId_summaryType: {
          organizationId: input.organizationId,
          entityType: input.entityType,
          entityId: input.entityId,
          summaryType: "rolling",
        },
      },
    });
  }

  /**
   * Create or update a summary record.
   */
  async upsert(input: UpsertInput): Promise<EntitySummary> {
    const summaryType = input.summaryType ?? "rolling";
    const where = {
      organizationId_entityType_entityId_summaryType: {
        organizationId: input.organizationId,
        entityType: input.entityType,
        entityId: input.entityId,
        summaryType,
      },
    };

    return prisma.entitySummary.upsert({
      where,
      create: {
        organizationId: input.organizationId,
        entityType: input.entityType,
        entityId: input.entityId,
        summaryType,
        content: input.content,
        startEventId: input.startEventId,
        endEventId: input.endEventId,
        eventCount: input.eventCount,
      },
      update: {
        content: input.content,
        startEventId: input.startEventId,
        endEventId: input.endEventId,
        eventCount: input.eventCount,
      },
    });
  }

  /**
   * Check if a summary is still fresh (doesn't need refreshing).
   *
   * A summary is fresh when:
   * - It exists, AND
   * - Fewer than 20 new events have occurred, AND
   * - Less than 30 minutes have passed since the last update.
   */
  isFresh(input: IsFreshInput): boolean {
    if (!input.summary) return false;

    const eventDelta = input.currentEventCount - input.summary.eventCount;
    if (eventDelta >= EVENT_FRESHNESS_THRESHOLD) return false;

    const now = input.now ?? new Date();
    const elapsed = now.getTime() - input.summary.updatedAt.getTime();
    if (elapsed >= TIME_FRESHNESS_THRESHOLD_MS) return false;

    return true;
  }

  /**
   * Count events that occurred after a given timestamp for an entity.
   */
  async countEventsSince(input: CountEventsSinceInput): Promise<number> {
    return prisma.event.count({
      where: {
        organizationId: input.organizationId,
        scopeType: input.entityType,
        scopeId: input.entityId,
        timestamp: { gt: input.since },
      },
    });
  }

  /**
   * Find entities across all orgs that need a summary refresh.
   *
   * Two categories:
   * 1. Existing summaries that are stale (event threshold or time threshold exceeded).
   * 2. Active entities with events but no summary at all.
   *
   * Returns at most MAX_REFRESH_BATCH_SIZE entities per call.
   */
  async findStaleEntities(): Promise<StaleEntity[]> {
    const stale: StaleEntity[] = [];

    // 1. Check existing rolling summaries for staleness
    const existingSummaries = await prisma.entitySummary.findMany({
      where: { summaryType: "rolling" },
      orderBy: { updatedAt: "asc" }, // oldest first = most likely stale
      take: MAX_REFRESH_BATCH_SIZE * 2, // fetch extra to account for fresh ones
    });

    for (const summary of existingSummaries) {
      if (stale.length >= MAX_REFRESH_BATCH_SIZE) break;

      const newEventCount = await this.countEventsSince({
        organizationId: summary.organizationId,
        entityType: summary.entityType,
        entityId: summary.entityId,
        since: summary.updatedAt,
      });

      if (!this.isFresh({ summary, currentEventCount: summary.eventCount + newEventCount })) {
        stale.push({
          organizationId: summary.organizationId,
          entityType: summary.entityType,
          entityId: summary.entityId,
          existingSummary: summary,
          newEventCount,
        });
      }
    }

    // 2. Find active scopes with no summary at all (recent events, no EntitySummary row).
    // Only look if we have room in the batch.
    if (stale.length < MAX_REFRESH_BATCH_SIZE) {
      const remaining = MAX_REFRESH_BATCH_SIZE - stale.length;

      // Find distinct scopes with recent events (last 24h) that don't have a summary
      const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const scopesWithEvents = await prisma.event.groupBy({
        by: ["organizationId", "scopeType", "scopeId"],
        where: {
          timestamp: { gt: recentCutoff },
          // Only summarizable scope types
          scopeType: { in: ["channel", "chat", "ticket", "session"] },
        },
        _count: { id: true },
        having: {
          id: { _count: { gte: EVENT_FRESHNESS_THRESHOLD } },
        },
        orderBy: { _count: { id: "desc" } },
        take: remaining * 3, // fetch extra to filter
      });

      for (const scope of scopesWithEvents) {
        if (stale.length >= MAX_REFRESH_BATCH_SIZE) break;

        // Check if already in our stale list
        if (
          stale.some(
            (s) =>
              s.organizationId === scope.organizationId &&
              s.entityType === scope.scopeType &&
              s.entityId === scope.scopeId,
          )
        ) {
          continue;
        }

        // Check if summary already exists
        const existing = await prisma.entitySummary.findUnique({
          where: {
            organizationId_entityType_entityId_summaryType: {
              organizationId: scope.organizationId,
              entityType: scope.scopeType,
              entityId: scope.scopeId,
              summaryType: "rolling",
            },
          },
        });

        if (!existing) {
          stale.push({
            organizationId: scope.organizationId,
            entityType: scope.scopeType,
            entityId: scope.scopeId,
            existingSummary: null,
            newEventCount: scope._count.id,
          });
        }
      }
    }

    return stale;
  }

  /**
   * Generate and persist a fresh summary for an entity.
   *
   * Orchestrates: fetch existing → get new events → call LLM → record cost → upsert.
   */
  async refreshSummary(input: RefreshSummaryInput): Promise<EntitySummary> {
    const existing = await this.getLatest(input);

    // Fetch events — either new events since last summary, or all recent events
    const since = existing?.updatedAt ?? new Date(0);
    const events = await prisma.event.findMany({
      where: {
        organizationId: input.organizationId,
        scopeType: input.entityType,
        scopeId: input.entityId,
        timestamp: { gt: since },
      },
      orderBy: { timestamp: "asc" },
      take: MAX_EVENTS_PER_GENERATION,
    });

    if (events.length === 0 && existing) {
      // No new events — just touch the updatedAt to reset the time threshold
      return prisma.entitySummary.update({
        where: {
          organizationId_entityType_entityId_summaryType: {
            organizationId: input.organizationId,
            entityType: input.entityType,
            entityId: input.entityId,
            summaryType: "rolling",
          },
        },
        data: { updatedAt: new Date() },
      });
    }

    if (events.length === 0) {
      // No events at all and no existing summary — nothing to do
      throw new Error(
        `No events found for ${input.entityType}:${input.entityId} in org ${input.organizationId}`,
      );
    }

    // Format events for the LLM
    const summaryEvents: SummaryEvent[] = events.map((e) => ({
      eventType: e.eventType,
      actorType: e.actorType,
      actorId: e.actorId,
      payload: e.payload as Record<string, unknown>,
      timestamp: e.timestamp.toISOString(),
    }));

    // Call the LLM
    const result = await generateSummary({
      entityType: input.entityType,
      entityId: input.entityId,
      events: summaryEvents,
      previousSummary: existing?.content,
    });

    // Record cost
    const estimatedCostCents = estimateCost(result.usage.inputTokens, result.usage.outputTokens);
    await costTrackingService.recordCost({
      organizationId: input.organizationId,
      modelTier: "tier2", // Haiku is billed as tier2 for cost tracking
      costCents: estimatedCostCents,
      isSummary: true,
    });

    // Compute total event count
    const totalEventCount = (existing?.eventCount ?? 0) + events.length;
    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];

    // Upsert the summary
    return this.upsert({
      organizationId: input.organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
      content: result.content,
      startEventId: existing?.startEventId ?? firstEvent.id,
      endEventId: lastEvent.id,
      eventCount: totalEventCount,
    });
  }
}

/**
 * Estimate cost in cents for a Haiku-class model call.
 * Haiku pricing: ~$0.25/MTok input, ~$1.25/MTok output (approximate).
 */
function estimateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * 25; // $0.25 per MTok = 25 cents per MTok
  const outputCost = (outputTokens / 1_000_000) * 125; // $1.25 per MTok = 125 cents per MTok
  return Math.round((inputCost + outputCost) * 100) / 100; // round to 2 decimal places
}

export const summaryService = new SummaryService();
