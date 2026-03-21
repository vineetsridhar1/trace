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
      maxTier: undefined,
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
});
