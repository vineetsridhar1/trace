import { prisma } from "../lib/db.js";

export class ProcessedEventService {
  /**
   * Check if an event has already been processed by a given consumer.
   */
  async isProcessed(consumerName: string, eventId: string): Promise<boolean> {
    const record = await prisma.processedAgentEvent.findUnique({
      where: {
        consumerName_eventId: { consumerName, eventId },
      },
    });
    return record !== null;
  }

  /**
   * Mark an event as processed by a consumer.
   * Uses upsert to handle at-least-once delivery gracefully.
   */
  async markProcessed(input: {
    consumerName: string;
    eventId: string;
    organizationId: string;
    resultHash?: string;
  }) {
    return prisma.processedAgentEvent.upsert({
      where: {
        consumerName_eventId: {
          consumerName: input.consumerName,
          eventId: input.eventId,
        },
      },
      create: {
        consumerName: input.consumerName,
        eventId: input.eventId,
        organizationId: input.organizationId,
        resultHash: input.resultHash,
      },
      update: {
        resultHash: input.resultHash,
      },
    });
  }

  /**
   * Delete processed event records older than the given age.
   * Returns the count of deleted records.
   *
   * Ticket: #19 — events older than 7 days are safe to reprocess if replayed.
   */
  async cleanupOldRecords(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const result = await prisma.processedAgentEvent.deleteMany({
      where: {
        processedAt: { lt: cutoff },
      },
    });
    return result.count;
  }

  /**
   * Get all processed events for a consumer within an org, ordered by processedAt.
   */
  async getProcessedEvents(input: {
    organizationId: string;
    consumerName?: string;
    limit?: number;
  }) {
    return prisma.processedAgentEvent.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.consumerName ? { consumerName: input.consumerName } : {}),
      },
      orderBy: { processedAt: "desc" },
      take: input.limit ?? 100,
    });
  }
}

export const processedEventService = new ProcessedEventService();
