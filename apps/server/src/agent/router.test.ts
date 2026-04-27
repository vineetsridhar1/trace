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
    seedChatMemberships("org-1", [{ chatId: "chat-1", type: "group" }]);

    const result = routeEvent(event({ payload: { mentions: [{ userId: "agent-1" }] } }), settings);

    expect(result).toEqual({
      decision: "direct",
      reason: "direct:message_sent",
      maxTier: undefined,
    });
  });

  it("aggregates configured event types", () => {
    seedChatMemberships("org-1", [{ chatId: "chat-1", type: "group" }]);

    const result = routeEvent(event(), settings);

    expect(result).toEqual({
      decision: "aggregate",
      reason: "aggregate:message_sent",
      maxTier: undefined,
    });
  });

  it("suppresses agent self-triggers outside the allowlist", () => {
    seedChatMemberships("org-1", [{ chatId: "chat-1", type: "group" }]);

    const result = routeEvent(event({ actorType: "agent", actorId: "agent-1" }), settings);

    expect(result).toEqual({ decision: "drop", reason: "self_trigger" });
  });

  it("drops events when cost budget is exhausted", () => {
    seedChatMemberships("org-1", [{ chatId: "chat-1", type: "group" }]);
    setCostTracker({ getRemainingBudgetFraction: () => 0 });

    const result = routeEvent(event(), settings);

    expect(result).toEqual({ decision: "drop", reason: "cost_budget_exhausted" });
  });

  it("degrades tier 3 actions when budget is low but not exhausted", () => {
    seedChatMemberships("org-1", [{ chatId: "chat-1", type: "group" }]);
    setCostTracker({ getRemainingBudgetFraction: () => 0.4 });

    const result = routeEvent(event(), settings);

    expect(result).toEqual({
      decision: "aggregate",
      reason: "aggregate:message_sent",
      maxTier: 2,
    });
  });

  it("rate limits noisy scopes", () => {
    seedChatMemberships("org-1", [{ chatId: "chat-rate", type: "group" }]);

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
    seedChatMemberships("org-1", [{ chatId: "chat-clean", type: "group" }]);

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
    seedChatMemberships("org-1", [{ chatId: "chat-1", type: "group" }]);

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
    seedChatMemberships("org-1", [{ chatId: "chat-1", type: "group" }]);

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

  it("routes @mention of agent directly without tier 3 promotion", () => {
    seedChatMemberships("org-1", [{ chatId: "chat-1", type: "group" }]);

    const result = routeEvent(event({ payload: { mentions: [{ userId: "agent-1" }] } }), settings);

    // @mentions route directly but don't auto-promote to Tier 3.
    // The planner can escalate via promotionReason if the question is complex.
    expect(result.decision).toBe("direct");
    expect(result.maxTier).toBeUndefined();
  });

  it("suppresses Tier 3 promotion when budget is below 50%", () => {
    setCostTracker({ getRemainingBudgetFraction: () => 0.3 });

    // Use ticket_assigned to agent (qualifies for Tier 3) to test budget suppression
    const result = routeEvent(
      event({
        scopeType: "ticket",
        scopeId: "ticket-1",
        eventType: "ticket_assigned",
        payload: { assigneeId: "agent-1" },
      }),
      settings,
    );

    // Budget suppression: event qualifies for Tier 3 but maxTier stays at 2
    expect(result.decision).toBe("direct");
    expect(result.maxTier).toBe(2);
  });

  // ---- Session monitoring routing ----
  // Only terminal/milestone session events are processed; ongoing events
  // (session_output, session_started, session_resumed) are dropped.

  it("drops session_started events (ongoing monitoring disabled)", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_started",
      }),
      settings,
    );

    expect(result.decision).toBe("drop");
    expect(result.reason).toBe("no_matching_rule");
  });

  it("drops session_resumed events (ongoing monitoring disabled)", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_resumed",
      }),
      settings,
    );

    expect(result.decision).toBe("drop");
    expect(result.reason).toBe("no_matching_rule");
  });

  it("drops session_output events (ongoing monitoring disabled)", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_output",
      }),
      settings,
    );

    expect(result.decision).toBe("drop");
    expect(result.reason).toBe("no_matching_rule");
  });

  it("drops connection_lost session_output events (via no_matching_rule)", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_output",
        payload: { type: "connection_lost", reason: "bridge_closed" },
      }),
      settings,
    );

    // session_output is not in any routing set, so it falls through to no_matching_rule
    expect(result.decision).toBe("drop");
  });

  it("drops connection_restored session_output events (via no_matching_rule)", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_output",
        payload: { type: "connection_restored", runtimeInstanceId: "rt-1" },
      }),
      settings,
    );

    expect(result.decision).toBe("drop");
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

  it("drops session_paused events (ongoing monitoring disabled)", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_paused",
        payload: { needsInput: true },
      }),
      settings,
    );

    expect(result.decision).toBe("drop");
  });

  it("aggregates session_terminated (terminal event)", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_terminated",
        payload: { needsInput: true },
      }),
      settings,
    );

    expect(result.decision).toBe("aggregate");
    expect(result.reason).toBe("aggregate:session_terminated");
  });

  it("aggregates session_terminated with failure", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_terminated",
        payload: { status: "failed" },
      }),
      settings,
    );

    expect(result.decision).toBe("aggregate");
    expect(result.reason).toBe("aggregate:session_terminated");
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

    expect(result.decision).toBe("aggregate");
    expect(result.reason).toBe("aggregate:session_terminated");
  });

  it("allows agent self-triggered session_terminated through the allowlist", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_terminated",
        actorType: "agent",
        actorId: "agent-1",
      }),
      settings,
    );

    expect(result.decision).toBe("aggregate");
    expect(result.reason).toBe("aggregate:session_terminated");
  });

  it("allows agent self-triggered session_pr_opened through the allowlist", () => {
    const result = routeEvent(
      event({
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_pr_opened",
        actorType: "agent",
        actorId: "agent-1",
      }),
      settings,
    );

    expect(result.decision).toBe("aggregate");
    expect(result.reason).toBe("aggregate:session_pr_opened");
  });

  it("does not promote normal priority tickets to Tier 3", () => {
    seedChatMemberships("org-1", [{ chatId: "chat-1", type: "group" }]);

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
