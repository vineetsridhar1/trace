import { beforeEach, describe, expect, it, vi } from "vitest";
import { summaryService } from "./summary.js";

vi.mock("../lib/db.js", () => ({
  prisma: {
    entitySummary: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    event: {
      findUnique: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe("summaryService event replay", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import("../lib/db.js");
    (prisma.event.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "evt-50",
      timestamp: new Date("2026-04-04T12:00:00.000Z"),
    });
    (prisma.event.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);
    (prisma.event.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("counts only events after the exact event cursor and excludes connection noise", async () => {
    const { prisma } = await import("../lib/db.js");

    await summaryService.countEventsSince({
      organizationId: "org-1",
      scopeType: "session",
      scopeId: "session-1",
      afterEventId: "evt-50",
    });

    expect(prisma.event.count).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        scopeType: "session",
        scopeId: "session-1",
        NOT: [
          {
            eventType: "session_output",
            payload: { path: ["type"], equals: "connection_lost" },
          },
          {
            eventType: "session_output",
            payload: { path: ["type"], equals: "connection_restored" },
          },
        ],
        AND: [
          {
            OR: [
              { timestamp: { gt: new Date("2026-04-04T12:00:00.000Z") } },
              {
                timestamp: new Date("2026-04-04T12:00:00.000Z"),
                id: { gt: "evt-50" },
              },
            ],
          },
        ],
      },
    });
  });

  it("fetches summary events in stable timestamp-plus-id order and excludes noise", async () => {
    const { prisma } = await import("../lib/db.js");

    await summaryService.getEventsForSummary({
      organizationId: "org-1",
      scopeType: "session",
      scopeId: "session-1",
      afterEventId: "evt-50",
      limit: 100,
    });

    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        scopeType: "session",
        scopeId: "session-1",
        NOT: [
          {
            eventType: "session_output",
            payload: { path: ["type"], equals: "connection_lost" },
          },
          {
            eventType: "session_output",
            payload: { path: ["type"], equals: "connection_restored" },
          },
        ],
        AND: [
          {
            OR: [
              { timestamp: { gt: new Date("2026-04-04T12:00:00.000Z") } },
              {
                timestamp: new Date("2026-04-04T12:00:00.000Z"),
                id: { gt: "evt-50" },
              },
            ],
          },
        ],
      },
      orderBy: [{ timestamp: "asc" }, { id: "asc" }],
      take: 100,
    });
  });
});
