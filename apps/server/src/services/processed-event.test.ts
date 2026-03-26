import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import { ProcessedEventService } from "./processed-event.js";

const prismaMock = prisma as any;

describe("ProcessedEventService", () => {
  let service: ProcessedEventService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProcessedEventService();
  });

  it("returns true when event has been processed", async () => {
    prismaMock.processedAgentEvent.findUnique.mockResolvedValueOnce({
      consumerName: "router",
      eventId: "evt-1",
      organizationId: "org-1",
      processedAt: new Date(),
    });

    const result = await service.isProcessed("router", "evt-1");
    expect(result).toBe(true);
  });

  it("returns false when event has not been processed", async () => {
    prismaMock.processedAgentEvent.findUnique.mockResolvedValueOnce(null);

    const result = await service.isProcessed("router", "evt-2");
    expect(result).toBe(false);
  });

  it("marks an event as processed", async () => {
    const record = {
      consumerName: "router",
      eventId: "evt-1",
      organizationId: "org-1",
      resultHash: "abc123",
      processedAt: new Date(),
    };
    prismaMock.processedAgentEvent.upsert.mockResolvedValueOnce(record);

    const result = await service.markProcessed({
      consumerName: "router",
      eventId: "evt-1",
      organizationId: "org-1",
      resultHash: "abc123",
    });

    expect(result).toEqual(record);
    expect(prismaMock.processedAgentEvent.upsert).toHaveBeenCalledWith({
      where: {
        consumerName_eventId: { consumerName: "router", eventId: "evt-1" },
      },
      create: {
        consumerName: "router",
        eventId: "evt-1",
        organizationId: "org-1",
        resultHash: "abc123",
      },
      update: {
        resultHash: "abc123",
      },
    });
  });

  it("gets processed events for an org", async () => {
    prismaMock.processedAgentEvent.findMany.mockResolvedValueOnce([]);

    await service.getProcessedEvents({
      organizationId: "org-1",
      consumerName: "router",
      limit: 50,
    });

    expect(prismaMock.processedAgentEvent.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        consumerName: "router",
      },
      orderBy: { processedAt: "desc" },
      take: 50,
    });
  });

  it("cleans up processed events older than the max age", async () => {
    prismaMock.processedAgentEvent.deleteMany.mockResolvedValueOnce({ count: 3 });

    const result = await service.cleanupOldRecords(7 * 24 * 60 * 60 * 1000);

    expect(result).toBe(3);
    expect(prismaMock.processedAgentEvent.deleteMany).toHaveBeenCalledWith({
      where: {
        processedAt: { lt: expect.any(Date) },
      },
    });
  });
});
