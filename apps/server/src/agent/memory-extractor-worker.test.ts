import { beforeEach, describe, expect, it, vi } from "vitest";

const strings = new Map<string, string>();
const sets = new Map<string, Set<string>>();

function getSet(key: string): Set<string> {
  let set = sets.get(key);
  if (!set) {
    set = new Set<string>();
    sets.set(key, set);
  }
  return set;
}

function makePipeline() {
  const ops: Array<() => void> = [];
  return {
    incr(key: string) {
      ops.push(() => {
        const current = parseInt(strings.get(key) ?? "0", 10);
        strings.set(key, String(current + 1));
      });
      return this;
    },
    setnx(key: string, value: string) {
      ops.push(() => {
        if (!strings.has(key)) strings.set(key, value);
      });
      return this;
    },
    sadd(key: string, value: string) {
      ops.push(() => {
        getSet(key).add(value);
      });
      return this;
    },
    srem(key: string, value: string) {
      ops.push(() => {
        getSet(key).delete(value);
      });
      return this;
    },
    del(key: string) {
      ops.push(() => {
        strings.delete(key);
      });
      return this;
    },
    set(key: string, value: string) {
      ops.push(() => {
        strings.set(key, value);
      });
      return this;
    },
    exec: vi.fn(async () => {
      for (const op of ops) op();
      return [];
    }),
  };
}

vi.mock("../lib/redis.js", () => ({
  redis: {
    pipeline: vi.fn(() => makePipeline()),
    mget: vi.fn(async (...keys: string[]) => keys.map((key) => strings.get(key) ?? null)),
    smembers: vi.fn(async (key: string) => [...getSet(key)]),
    get: vi.fn(async (key: string) => strings.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      strings.set(key, value);
      return "OK";
    }),
    decrby: vi.fn(async (key: string, amount: number) => {
      const current = parseInt(strings.get(key) ?? "0", 10);
      const next = current - amount;
      strings.set(key, String(next));
      return next;
    }),
  },
}));

vi.mock("../lib/db.js", () => ({
  prisma: {
    event: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    chat: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../services/memory.js", () => ({
  memoryService: {
    upsert: vi.fn(),
  },
}));

vi.mock("../services/cost-tracking.js", () => ({
  costTrackingService: {
    recordCost: vi.fn(),
  },
}));

vi.mock("./memory-extractor-prompt.js", () => ({
  EXTRACTABLE_EVENT_TYPES: new Set([
    "message_sent",
    "ticket_created",
    "ticket_updated",
    "ticket_commented",
    "ticket_assigned",
    "ticket_unassigned",
    "session_terminated",
    "entity_linked",
    "ticket_linked",
  ]),
  extractMemories: vi.fn(),
}));

vi.mock("./logger.js", () => ({
  createAgentLogger: vi.fn(() => ({
    log: vi.fn(),
    logError: vi.fn(),
  })),
}));

describe("memory extractor worker", () => {
  beforeEach(async () => {
    strings.clear();
    sets.clear();
    vi.clearAllMocks();

    const { prisma } = await import("../lib/db.js");
    const { extractMemories } = await import("./memory-extractor-prompt.js");

    (prisma.chat.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ type: "group" });
    (prisma.event.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (extractMemories as ReturnType<typeof vi.fn>).mockResolvedValue({
      memories: [
        {
          kind: "decision",
          subjectType: "ticket",
          subjectId: "ticket-1",
          content: "Ship the memory system before widening recall.",
          confidence: 0.9,
          structuredData: {},
        },
      ],
      inputTokens: 0,
      outputTokens: 0,
    });
  });

  it("processes stale low-volume scopes instead of dropping them", async () => {
    const { prisma } = await import("../lib/db.js");
    const { memoryService } = await import("../services/memory.js");
    const { __testOnly__ } = await import("./memory-extractor-worker.js");

    const scopeRef = "org-1:chat:chat-1";
    strings.set(`agent:memory:events:${scopeRef}`, "1");
    strings.set(
      `agent:memory:first_pending_at:${scopeRef}`,
      new Date(Date.now() - 11 * 60_000).toISOString(),
    );
    getSet("agent:memory:active_scopes").add(scopeRef);

    (prisma.event.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "evt-1",
        eventType: "message_sent",
        actorType: "user",
        actorId: "user-1",
        payload: { text: "Remember this decision" },
        timestamp: new Date("2026-04-04T12:00:00Z"),
      },
    ]);

    await __testOnly__.runExtractionCycle();

    expect(memoryService.upsert).toHaveBeenCalledTimes(1);
    expect(strings.has(`agent:memory:events:${scopeRef}`)).toBe(false);
    expect(getSet("agent:memory:active_scopes").size).toBe(0);
    expect(strings.get(`agent:memory:watermark:${scopeRef}`)).toContain("\"eventId\":\"evt-1\"");
  });

  it("uses timestamp plus event id in the watermark query", async () => {
    const { __testOnly__ } = await import("./memory-extractor-worker.js");
    const where = __testOnly__.buildPendingEventsWhere({
      organizationId: "org-1",
      scopeType: "chat",
      scopeId: "chat-1",
      watermark: {
        timestamp: "2026-04-04T12:00:00.000Z",
        eventId: "evt-50",
      },
    });

    expect(where).toMatchObject({
      organizationId: "org-1",
      scopeType: "chat",
      scopeId: "chat-1",
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
    });
  });
});
