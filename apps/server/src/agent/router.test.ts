import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanupRateLimits,
  clearChatMemberships,
  isAgentChatMember,
  routeEvent,
  seedChatMemberships,
  setCostTracker,
  updateChatMembership,
} from "./router.js";

function event(overrides: Partial<Parameters<typeof routeEvent>[0]> = {}) {
  return {
    id: "evt-1",
    organizationId: "org-1",
    scopeType: "chat",
    scopeId: "chat-1",
    eventType: "message_sent",
    actorType: "user",
    actorId: "user-1",
    payload: {},
    timestamp: "2026-03-21T00:00:00.000Z",
    ...overrides,
  };
}

const settings = {
  agentId: "agent-1",
  organizationId: "org-1",
  name: "Trace AI",
  status: "enabled" as const,
  autonomyMode: "act" as const,
  soulFile: "",
  costBudget: { dailyLimitCents: 1000 },
};

afterEach(() => {
  clearChatMemberships();
  setCostTracker({ getRemainingBudgetFraction: () => 1 });
  vi.useRealTimers();
});

describe("router", () => {
  it("drops all events when the org agent is disabled", () => {
    const result = routeEvent(event(), { ...settings, status: "disabled" });

    expect(result).toEqual({ decision: "drop", reason: "org_ai_disabled" });
  });

  it("updates chat membership from membership events", () => {
    updateChatMembership(
      event({
        scopeId: "chat-2",
        eventType: "chat_member_added",
        payload: { userId: "agent-1" },
      }),
      "agent-1",
    );

    expect(isAgentChatMember("org-1", "chat-2")).toBe(true);
  });

  it("drops chat events when the agent is not a member", () => {
    const result = routeEvent(event(), settings);

    expect(result).toEqual({ decision: "drop", reason: "not_chat_member" });
  });

  it("routes mention events directly", () => {
    seedChatMemberships("org-1", ["chat-1"]);

    const result = routeEvent(
      event({ payload: { mentions: [{ userId: "agent-1" }] } }),
      settings,
    );

    expect(result).toEqual({
      decision: "direct",
      reason: "direct:message_sent",
      maxTier: 3,
    });
  });

  it("aggregates configured event types", () => {
    seedChatMemberships("org-1", ["chat-1"]);

    const result = routeEvent(event(), settings);

    expect(result).toEqual({
      decision: "aggregate",
      reason: "aggregate:message_sent",
      maxTier: undefined,
    });
  });

  it("suppresses agent self-triggers outside the allowlist", () => {
    seedChatMemberships("org-1", ["chat-1"]);

    const result = routeEvent(
      event({ actorType: "agent", actorId: "agent-1" }),
      settings,
    );

    expect(result).toEqual({ decision: "drop", reason: "self_trigger" });
  });

  it("drops events when cost budget is exhausted", () => {
    seedChatMemberships("org-1", ["chat-1"]);
    setCostTracker({ getRemainingBudgetFraction: () => 0 });

    const result = routeEvent(event(), settings);

    expect(result).toEqual({ decision: "drop", reason: "cost_budget_exhausted" });
  });

  it("degrades tier 3 actions when budget is low but not exhausted", () => {
    seedChatMemberships("org-1", ["chat-1"]);
    setCostTracker({ getRemainingBudgetFraction: () => 0.4 });

    const result = routeEvent(event(), settings);

    expect(result).toEqual({
      decision: "aggregate",
      reason: "aggregate:message_sent",
      maxTier: 2,
    });
  });

  it("rate limits noisy scopes", () => {
    seedChatMemberships("org-1", ["chat-rate"]);

    for (let index = 0; index < 20; index += 1) {
      expect(
        routeEvent(event({ id: `evt-${index}`, scopeId: "chat-rate" }), settings).decision,
      ).toBe("aggregate");
    }

    expect(routeEvent(event({ id: "evt-21", scopeId: "chat-rate" }), settings)).toEqual({
      decision: "drop",
      reason: "rate_limited",
    });
  });

  it("cleans up stale rate limit entries", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-21T00:00:00.000Z"));
    seedChatMemberships("org-1", ["chat-clean"]);

    routeEvent(event({ scopeId: "chat-clean" }), settings);

    vi.setSystemTime(new Date("2026-03-21T00:00:21.000Z"));
    cleanupRateLimits();

    expect(routeEvent(event({ scopeId: "chat-clean" }), settings).decision).toBe("aggregate");
  });

  // ---- Tier 3 promotion rules ----

  it("promotes ticket_assigned to Tier 3 when assigned to agent", () => {
    const result = routeEvent(
      event({
        scopeType: "ticket",
        scopeId: "ticket-1",
        eventType: "ticket_assigned",
        payload: { assigneeId: "agent-1" },
      }),
      settings,
    );

    expect(result.decision).toBe("direct");
    expect(result.maxTier).toBe(3);
  });

  it("promotes urgent ticket_created to Tier 3", () => {
    seedChatMemberships("org-1", ["chat-1"]);

    const result = routeEvent(
      event({
        scopeType: "ticket",
        scopeId: "ticket-1",
        eventType: "ticket_created",
        payload: { priority: "urgent" },
      }),
      settings,
    );

    expect(result.decision).toBe("aggregate");
    expect(result.maxTier).toBe(3);
  });

  it("promotes high priority ticket_updated to Tier 3", () => {
    seedChatMemberships("org-1", ["chat-1"]);

    const result = routeEvent(
      event({
        scopeType: "ticket",
        scopeId: "ticket-1",
        eventType: "ticket_updated",
        payload: { priority: "high" },
      }),
      settings,
    );

    expect(result.decision).toBe("aggregate");
    expect(result.maxTier).toBe(3);
  });

  it("promotes @mention of agent to Tier 3", () => {
    seedChatMemberships("org-1", ["chat-1"]);

    const result = routeEvent(
      event({ payload: { mentions: [{ userId: "agent-1" }] } }),
      settings,
    );

    expect(result.decision).toBe("direct");
    expect(result.maxTier).toBe(3);
  });

  it("suppresses Tier 3 promotion when budget is below 50%", () => {
    seedChatMemberships("org-1", ["chat-1"]);
    setCostTracker({ getRemainingBudgetFraction: () => 0.3 });

    const result = routeEvent(
      event({ payload: { mentions: [{ userId: "agent-1" }] } }),
      settings,
    );

    // Budget suppression: even though event qualifies for Tier 3, maxTier stays at 2
    expect(result.decision).toBe("direct");
    expect(result.maxTier).toBe(2);
  });

  // ---- Session monitoring routing (ticket #18) ----

  it("aggregates session_started events", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_started",
      }),
      settings,
    );

    expect(result.decision).toBe("aggregate");
    expect(result.reason).toBe("aggregate:session_started");
  });

  it("aggregates session_resumed events", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_resumed",
      }),
      settings,
    );

    expect(result.decision).toBe("aggregate");
    expect(result.reason).toBe("aggregate:session_resumed");
  });

  it("aggregates session_output events", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_output",
      }),
      settings,
    );

    expect(result.decision).toBe("aggregate");
    expect(result.reason).toBe("aggregate:session_output");
  });

  it("aggregates session_pr_opened events", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_pr_opened",
      }),
      settings,
    );

    expect(result.decision).toBe("aggregate");
    expect(result.reason).toBe("aggregate:session_pr_opened");
  });

  it("aggregates session_pr_merged events", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_pr_merged",
      }),
      settings,
    );

    expect(result.decision).toBe("aggregate");
    expect(result.reason).toBe("aggregate:session_pr_merged");
  });

  it("aggregates session_pr_closed events", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_pr_closed",
      }),
      settings,
    );

    expect(result.decision).toBe("aggregate");
    expect(result.reason).toBe("aggregate:session_pr_closed");
  });

  it("routes session_paused with needsInput directly", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_paused",
        payload: { needsInput: true },
      }),
      settings,
    );

    expect(result.decision).toBe("direct");
    expect(result.reason).toBe("direct:session_paused");
  });

  it("routes session_terminated with needsInput directly", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_terminated",
        payload: { needsInput: true },
      }),
      settings,
    );

    expect(result.decision).toBe("direct");
    expect(result.reason).toBe("direct:session_terminated");
  });

  it("routes session_terminated with failure directly", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_terminated",
        payload: { status: "failed" },
      }),
      settings,
    );

    expect(result.decision).toBe("direct");
    expect(result.reason).toBe("direct:session_terminated");
  });

  it("aggregates session_terminated with successful completion", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_terminated",
        payload: { status: "completed" },
      }),
      settings,
    );

    // Successful completion: DIRECT_RULE predicate doesn't match (no failure/needsInput),
    // so it falls through to AGGREGATE_EVENT_TYPES where session_terminated is listed.
    expect(result.decision).toBe("aggregate");
    expect(result.reason).toBe("aggregate:session_terminated");
  });

  it("allows agent self-triggered session events through the allowlist", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_output",
        actorType: "agent",
        actorId: "agent-1",
      }),
      settings,
    );

    expect(result.decision).toBe("aggregate");
    expect(result.reason).toBe("aggregate:session_output");
  });

  it("allows agent self-triggered session_started through the allowlist", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_started",
        actorType: "agent",
        actorId: "agent-1",
      }),
      settings,
    );

    expect(result.decision).toBe("aggregate");
    expect(result.reason).toBe("aggregate:session_started");
  });

  it("does not promote normal priority tickets to Tier 3", () => {
    seedChatMemberships("org-1", ["chat-1"]);

    const result = routeEvent(
      event({
        scopeType: "ticket",
        scopeId: "ticket-1",
        eventType: "ticket_created",
        payload: { priority: "medium" },
      }),
      settings,
    );

    expect(result.decision).toBe("aggregate");
    expect(result.maxTier).toBeUndefined();
  });
});
