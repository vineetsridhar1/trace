import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  estimateTokens,
  buildContext,
  type AgentContextPacket,
  type BuildContextInput,
} from "./context-builder.js";
import type { AggregatedBatch } from "./aggregator.js";
import type { AgentEvent } from "./router.js";
import type { OrgAgentSettings } from "../services/agent-identity.js";

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock("../lib/db.js", () => ({
  prisma: {
    chat: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    ticket: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    session: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    channel: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    project: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    ticketLink: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    event: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("../services/summary.js", () => ({
  summaryService: {
    getLatest: vi.fn().mockResolvedValue(null),
    countEventsSince: vi.fn().mockResolvedValue(0),
    isFresh: vi.fn().mockReturnValue({ fresh: true, newEventCount: 0, minutesSinceUpdate: 0 }),
  },
}));

vi.mock("./summary-worker.js", () => ({
  refreshIfStale: vi.fn().mockResolvedValue(null),
}));

vi.mock("../services/ticket.js", () => ({
  ticketService: {
    searchByRelevance: vi.fn().mockResolvedValue([]),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: "evt_1",
    organizationId: "org_1",
    scopeType: "chat",
    scopeId: "chat_1",
    eventType: "message_created",
    actorType: "user",
    actorId: "user_1",
    payload: { text: "Found a bug in the login page" },
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeBatch(overrides: Partial<AggregatedBatch> = {}): AggregatedBatch {
  return {
    scopeKey: "chat:chat_1",
    organizationId: "org_1",
    events: [makeEvent()],
    openedAt: Date.now() - 5000,
    closedAt: Date.now(),
    closeReason: "silence",
    ...overrides,
  };
}

function makeAgentSettings(overrides: Partial<OrgAgentSettings> = {}): OrgAgentSettings {
  return {
    agentId: "agent_org_1",
    organizationId: "org_1",
    name: "Trace Agent",
    status: "active" as never,
    autonomyMode: "suggest" as never,
    soulFile: "You are a helpful team assistant.",
    costBudget: { dailyLimitCents: 1000 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("estimateTokens", () => {
  it("estimates tokens from word count", () => {
    expect(estimateTokens("hello world")).toBe(3); // 2 words × 1.3 = 2.6 → 3
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("one")).toBe(2); // 1 × 1.3 = 1.3 → 2
  });

  it("handles multi-word strings", () => {
    const text = "This is a test with several words in it";
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(text.split(/\s+/).length * 2);
  });
});

describe("buildContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("produces a valid context packet with all required fields", async () => {
    const batch = makeBatch();
    const settings = makeAgentSettings();

    const packet = await buildContext({ batch, agentSettings: settings });

    expect(packet.organizationId).toBe("org_1");
    expect(packet.scopeKey).toBe("chat:chat_1");
    expect(packet.scopeType).toBe("chat");
    expect(packet.scopeId).toBe("chat_1");
    expect(packet.triggerEvent).toBeDefined();
    expect(packet.triggerEvent.id).toBe("evt_1");
    expect(packet.eventBatch).toHaveLength(1);
    expect(packet.soulFile).toBe("You are a helpful team assistant.");
    expect(packet.permissions.autonomyMode).toBe("suggest");
    expect(packet.permissions.actions.length).toBeGreaterThan(0);
    expect(packet.tokenBudget.total).toBe(60_000);
    expect(packet.tokenBudget.used).toBeGreaterThan(0);
  });

  it("uses the most recent event as the trigger event", async () => {
    const events = [
      makeEvent({ id: "evt_old", timestamp: "2024-01-01T00:00:00Z" }),
      makeEvent({ id: "evt_new", timestamp: "2024-01-01T00:01:00Z" }),
    ];
    const batch = makeBatch({ events });

    const packet = await buildContext({ batch, agentSettings: makeAgentSettings() });

    expect(packet.triggerEvent.id).toBe("evt_new");
  });

  it("filters actions by scope type", async () => {
    // Chat scope should include message.send
    const chatBatch = makeBatch({ scopeKey: "chat:chat_1" });
    const chatPacket = await buildContext({ batch: chatBatch, agentSettings: makeAgentSettings() });
    expect(chatPacket.permissions.actions.some((a) => a.name === "message.send")).toBe(true);

    // Ticket scope should not include message.send
    const ticketBatch = makeBatch({
      scopeKey: "ticket:ticket_1",
      events: [makeEvent({ scopeType: "ticket", scopeId: "ticket_1" })],
    });
    const ticketPacket = await buildContext({ batch: ticketBatch, agentSettings: makeAgentSettings() });
    expect(ticketPacket.permissions.actions.some((a) => a.name === "message.send")).toBe(false);
  });

  it("includes token budget accounting", async () => {
    const packet = await buildContext({
      batch: makeBatch(),
      agentSettings: makeAgentSettings(),
    });

    expect(packet.tokenBudget.sections).toBeDefined();
    expect(typeof packet.tokenBudget.used).toBe("number");
    expect(packet.tokenBudget.used).toBeLessThanOrEqual(packet.tokenBudget.total);
  });

  it("handles empty soul file gracefully", async () => {
    const settings = makeAgentSettings({ soulFile: "" });
    const packet = await buildContext({ batch: makeBatch(), agentSettings: settings });

    expect(packet.soulFile).toBe("");
  });

  it("parses thread scope keys correctly", async () => {
    const batch = makeBatch({
      scopeKey: "chat:chat_1:thread:msg_parent",
      events: [makeEvent({ scopeType: "chat", scopeId: "chat_1" })],
    });

    const packet = await buildContext({ batch, agentSettings: makeAgentSettings() });

    expect(packet.scopeType).toBe("chat");
    expect(packet.scopeId).toBe("chat_1");
  });

  it("resolves actors from events", async () => {
    const { prisma } = await import("../lib/db.js");
    (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "user_1", name: "Alice" },
      { id: "user_2", name: "Bob" },
    ]);

    const events = [
      makeEvent({ actorId: "user_1" }),
      makeEvent({ id: "evt_2", actorId: "user_2" }),
    ];
    const batch = makeBatch({ events });

    const packet = await buildContext({ batch, agentSettings: makeAgentSettings() });

    expect(packet.actors).toHaveLength(2);
    expect(packet.actors.find((a) => a.name === "Alice")).toBeDefined();
    expect(packet.actors.find((a) => a.name === "Bob")).toBeDefined();
  });

  it("includes relevant ticket search results", async () => {
    const { ticketService } = await import("../services/ticket.js");
    (ticketService.searchByRelevance as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: "ticket_99",
        title: "Login page bug",
        description: "Users cannot log in",
        status: "todo",
        priority: "high",
        labels: ["bug"],
      },
    ]);

    const batch = makeBatch({
      events: [makeEvent({ payload: { text: "Found a bug in the login page" } })],
    });

    const packet = await buildContext({ batch, agentSettings: makeAgentSettings() });

    expect(packet.relevantEntities.some((e) => e.id === "ticket_99")).toBe(true);
  });

  it("deduplicates entities across hops", async () => {
    const { prisma } = await import("../lib/db.js");

    // Scope entity is a ticket with a link to session_1
    (prisma.ticket.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "ticket_1",
      title: "Test ticket",
      description: "Test",
      status: "todo",
      priority: "medium",
      labels: [],
      assignees: [],
      links: [{ entityType: "session", entityId: "session_1" }],
      projects: [],
      channel: null,
    });

    // Also return session_1 when fetched as linked entity
    (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "session_1",
      name: "Fix login",
      agentStatus: "idle",
      sessionStatus: "active",
      tool: "claude_code",
    });

    const batch = makeBatch({
      scopeKey: "ticket:ticket_1",
      events: [makeEvent({ scopeType: "ticket", scopeId: "ticket_1", payload: {} })],
    });

    const packet = await buildContext({ batch, agentSettings: makeAgentSettings() });

    // session_1 should appear at most once in relevant entities
    const sessionEntities = packet.relevantEntities.filter(
      (e) => e.type === "session" && e.id === "session_1",
    );
    expect(sessionEntities.length).toBeLessThanOrEqual(1);
  });

  it("includes summaries when available", async () => {
    const { refreshIfStale } = await import("./summary-worker.js");
    const { summaryService } = await import("../services/summary.js");

    (refreshIfStale as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "summary_1",
      content: "Discussion about login bugs and potential fixes.",
      structuredData: { decisions: [], openQuestions: ["root cause?"] },
      eventCount: 15,
      endEventId: "evt_old",
    });

    (summaryService.countEventsSince as ReturnType<typeof vi.fn>).mockResolvedValue(3);
    (summaryService.isFresh as ReturnType<typeof vi.fn>).mockReturnValue({
      fresh: true,
      newEventCount: 3,
      minutesSinceUpdate: 5,
    });

    const packet = await buildContext({
      batch: makeBatch(),
      agentSettings: makeAgentSettings(),
    });

    expect(packet.summaries).toHaveLength(1);
    expect(packet.summaries[0].content).toContain("login bugs");
    expect(packet.summaries[0].fresh).toBe(true);
  });

  it("includes linked tickets for session scope entities", async () => {
    const { prisma } = await import("../lib/db.js");

    // Session scope entity
    (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "session_1",
      name: "Fix login bug",
      agentStatus: "in_progress",
      sessionStatus: "in_progress",
      tool: "claude_code",
      repo: { id: "repo_1", name: "app", remoteUrl: "https://github.com/org/app" },
      channel: null,
      projects: [],
    });

    // Reverse ticket link lookup — tickets linked to this session
    (prisma.ticketLink.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        ticket: {
          id: "ticket_42",
          title: "Login page broken",
          status: "in_progress",
          priority: "high",
          assignees: [{ user: { id: "user_alice", name: "Alice" } }],
        },
      },
    ]);

    const batch = makeBatch({
      scopeKey: "session:session_1",
      events: [
        makeEvent({
          scopeType: "session",
          scopeId: "session_1",
          eventType: "session_output",
          payload: { text: "Running tests..." },
        }),
      ],
    });

    const packet = await buildContext({ batch, agentSettings: makeAgentSettings() });

    expect(packet.scopeType).toBe("session");
    expect(packet.scopeEntity).not.toBeNull();
    expect(packet.scopeEntity?.data.linkedTickets).toBeDefined();

    const linkedTickets = packet.scopeEntity?.data.linkedTickets as Array<{
      id: string;
      title: string;
      assignees: Array<{ id: string }>;
    }>;
    expect(linkedTickets).toHaveLength(1);
    expect(linkedTickets[0].id).toBe("ticket_42");
    expect(linkedTickets[0].title).toBe("Login page broken");
    expect(linkedTickets[0].assignees[0].id).toBe("user_alice");

    // Linked ticket should also appear in relevant entities
    expect(packet.relevantEntities.some((e) => e.id === "ticket_42")).toBe(true);
  });

  it("handles session scope with no linked tickets", async () => {
    const { prisma } = await import("../lib/db.js");

    (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "session_2",
      name: "Explore codebase",
      agentStatus: "in_progress",
      sessionStatus: "in_progress",
      tool: "claude_code",
      repo: null,
      channel: null,
      projects: [],
    });

    (prisma.ticketLink.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const batch = makeBatch({
      scopeKey: "session:session_2",
      events: [
        makeEvent({
          scopeType: "session",
          scopeId: "session_2",
          eventType: "session_started",
          payload: {},
        }),
      ],
    });

    const packet = await buildContext({ batch, agentSettings: makeAgentSettings() });

    expect(packet.scopeEntity).not.toBeNull();
    expect(packet.scopeEntity?.data.linkedTickets).toEqual([]);
  });

  it("handles scope types with no specific fetcher", async () => {
    const batch = makeBatch({
      scopeKey: "unknown:unk_1",
      events: [makeEvent({ scopeType: "unknown", scopeId: "unk_1" })],
    });

    const packet = await buildContext({ batch, agentSettings: makeAgentSettings() });

    expect(packet.scopeEntity).toBeNull();
    expect(packet.scopeType).toBe("unknown");
  });
});
