import { afterEach, describe, expect, it, vi } from "vitest";
import {
  evaluatePolicy,
  clearSuggestionRates,
  clearDismissals,
  clearBudgetCache,
  recordDismissal,
  type PolicyEngineInput,
} from "./policy-engine.js";
import type { PlannerOutput } from "./planner.js";
import type { AgentContextPacket } from "./context-builder.js";

// ---------------------------------------------------------------------------
// Mock cost-tracking service
// ---------------------------------------------------------------------------

vi.mock("../services/cost-tracking.js", () => ({
  costTrackingService: {
    checkBudget: vi.fn().mockResolvedValue({
      dailyLimitCents: 1000,
      spentCents: 0,
      remainingCents: 1000,
      remainingPercent: 100,
    }),
  },
}));

// Mock Redis for dismissal cooldown (now Redis-backed)
const mockRedisStore = new Map<string, string>();
vi.mock("../lib/redis.js", () => ({
  redis: {
    set: vi.fn(async (key: string, value: string, _ex: string, _ttl: number) => {
      mockRedisStore.set(key, value);
      return "OK";
    }),
    exists: vi.fn(async (key: string) => (mockRedisStore.has(key) ? 1 : 0)),
    keys: vi.fn(async (pattern: string) => {
      const prefix = pattern.replace("*", "");
      return [...mockRedisStore.keys()].filter((k) => k.startsWith(prefix));
    }),
    del: vi.fn(async (...keys: string[]) => {
      for (const k of keys) mockRedisStore.delete(k);
      return keys.length;
    }),
  },
}));

import { costTrackingService } from "../services/cost-tracking.js";

const mockCheckBudget = vi.mocked(costTrackingService.checkBudget);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlannerOutput(overrides: Partial<PlannerOutput> = {}): PlannerOutput {
  return {
    disposition: "act",
    confidence: 0.9,
    rationaleSummary: "Test rationale",
    proposedActions: [
      { actionType: "link.create", args: { ticketId: "t-1", entityType: "chat", entityId: "c-1" } },
    ],
    ...overrides,
  };
}

function makeContext(overrides: Partial<AgentContextPacket> = {}): AgentContextPacket {
  return {
    organizationId: "org-1",
    scopeKey: "channel:chan-1",
    scopeType: "channel",
    scopeId: "chan-1",
    triggerEvent: {
      id: "evt-1",
      organizationId: "org-1",
      scopeType: "channel",
      scopeId: "chan-1",
      eventType: "message_sent",
      actorType: "user",
      actorId: "user-1",
      payload: {},
      timestamp: "2026-03-21T00:00:00.000Z",
    },
    eventBatch: [],
    soulFile: "",
    scopeEntity: null,
    relevantEntities: [],
    recentEvents: [],
    summaries: [],
    actors: [],
    permissions: {
      autonomyMode: "act",
      actions: [],
    },
    tokenBudget: { total: 8000, used: 0, sections: {} },
    ...overrides,
  } as AgentContextPacket;
}

function makeInput(overrides: Partial<PolicyEngineInput> = {}): PolicyEngineInput {
  return {
    plannerOutput: makePlannerOutput(),
    context: makeContext(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(async () => {
  clearSuggestionRates();
  await clearDismissals();
  clearBudgetCache();
  mockRedisStore.clear();
  mockCheckBudget.mockResolvedValue({
    dailyLimitCents: 1000,
    spentCents: 0,
    remainingCents: 1000,
    remainingPercent: 100,
  });
});

describe("policy-engine", () => {
  // ── Hard rules ──

  describe("hard rules", () => {
    it("drops all actions in observe mode", async () => {
      const result = await evaluatePolicy(
        makeInput({
          context: makeContext({
            permissions: { autonomyMode: "observe", actions: [] },
          }),
        }),
      );

      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].decision).toBe("drop");
      expect(result.actions[0].reason).toBe("observe_mode");
    });

    it("drops actions when planner disposition is ignore", async () => {
      const result = await evaluatePolicy(
        makeInput({
          plannerOutput: makePlannerOutput({ disposition: "ignore" }),
        }),
      );

      expect(result.actions[0].decision).toBe("drop");
      expect(result.actions[0].reason).toBe("planner_disposition_ignore");
    });

    it("drops actions when planner disposition is summarize", async () => {
      const result = await evaluatePolicy(
        makeInput({
          plannerOutput: makePlannerOutput({ disposition: "summarize" }),
        }),
      );

      expect(result.actions[0].decision).toBe("drop");
      expect(result.actions[0].reason).toBe("planner_disposition_summarize");
    });

    it("drops unknown actions not in the registry", async () => {
      const result = await evaluatePolicy(
        makeInput({
          plannerOutput: makePlannerOutput({
            proposedActions: [{ actionType: "nonexistent.action", args: {} }],
          }),
        }),
      );

      expect(result.actions[0].decision).toBe("drop");
      expect(result.actions[0].reason).toBe("unknown_action");
    });

    it("drops non-suggestable actions when below act threshold", async () => {
      // escalate.toHuman is not suggestable, risk=low
      // In act mode, low risk act threshold = 0.4
      // Confidence 0.3 is above suggest threshold (0.2) but below act (0.4)
      // Since it's not suggestable, it should drop
      const result = await evaluatePolicy(
        makeInput({
          plannerOutput: makePlannerOutput({
            confidence: 0.3,
            proposedActions: [{ actionType: "escalate.toHuman", args: { userId: "u-1", title: "t", sourceType: "chat", sourceId: "c-1" } }],
          }),
        }),
      );

      expect(result.actions[0].decision).toBe("drop");
      expect(result.actions[0].reason).toBe("not_suggestable");
    });
  });

  // ── Confidence × Risk × Autonomy matrix ──

  describe("confidence matrix", () => {
    it("allows execute for medium risk in act mode when confidence >= 0.7", async () => {
      // ticket.create is medium risk. In act mode, actMin = 0.7
      const result = await evaluatePolicy(
        makeInput({
          plannerOutput: makePlannerOutput({
            confidence: 0.8,
            proposedActions: [{ actionType: "ticket.create", args: { title: "Bug" } }],
          }),
        }),
      );

      expect(result.actions[0].decision).toBe("execute");
    });

    it("downgrades to suggest for medium risk in suggest mode when 0.5 <= confidence < 0.9", async () => {
      // ticket.create is medium risk. In suggest mode: suggestMin=0.5, actMin=0.9
      const result = await evaluatePolicy(
        makeInput({
          plannerOutput: makePlannerOutput({
            confidence: 0.8,
            proposedActions: [{ actionType: "ticket.create", args: { title: "Bug" } }],
          }),
          context: makeContext({
            permissions: { autonomyMode: "suggest", actions: [] },
          }),
        }),
      );

      expect(result.actions[0].decision).toBe("suggest");
    });

    it("allows execute for medium risk in act mode with confidence 0.8 (ticket spec test 2)", async () => {
      const result = await evaluatePolicy(
        makeInput({
          plannerOutput: makePlannerOutput({
            confidence: 0.8,
            proposedActions: [{ actionType: "ticket.create", args: { title: "Bug" } }],
          }),
          context: makeContext({
            permissions: { autonomyMode: "act", actions: [] },
          }),
        }),
      );

      expect(result.actions[0].decision).toBe("execute");
    });

    it("drops low-confidence actions below suggest threshold", async () => {
      // medium risk, suggest mode: suggestMin=0.5
      const result = await evaluatePolicy(
        makeInput({
          plannerOutput: makePlannerOutput({
            confidence: 0.3,
            proposedActions: [{ actionType: "ticket.create", args: { title: "Bug" } }],
          }),
          context: makeContext({
            permissions: { autonomyMode: "suggest", actions: [] },
          }),
        }),
      );

      expect(result.actions[0].decision).toBe("drop");
    });

    it("allows execute for low risk in act mode when confidence >= 0.4", async () => {
      // link.create is low risk. In act mode, actMin = 0.4
      const result = await evaluatePolicy(
        makeInput({
          plannerOutput: makePlannerOutput({
            confidence: 0.5,
            proposedActions: [{ actionType: "link.create", args: { ticketId: "t-1", entityType: "chat", entityId: "c-1" } }],
          }),
        }),
      );

      expect(result.actions[0].decision).toBe("execute");
    });

    it("requires high confidence (0.95) for high risk in suggest mode", async () => {
      // session.start is high risk. In suggest mode: suggestMin=0.6, actMin=0.95
      const result = await evaluatePolicy(
        makeInput({
          plannerOutput: makePlannerOutput({
            confidence: 0.9,
            proposedActions: [{ actionType: "session.start", args: { prompt: "Fix the bug" } }],
          }),
          context: makeContext({
            permissions: { autonomyMode: "suggest", actions: [] },
          }),
        }),
      );

      // 0.9 >= 0.6 (suggest) but < 0.95 (act) → suggest
      expect(result.actions[0].decision).toBe("suggest");
    });
  });

  // ── Anti-chaos: suggestion rate limiting ──

  describe("suggestion rate limiting", () => {
    it("suppresses suggestions after exceeding per-scope limit", async () => {
      // system scope has limit=0 so we can test rate limiting easily
      const input = makeInput({
        plannerOutput: makePlannerOutput({
          confidence: 0.8,
          proposedActions: [{ actionType: "ticket.create", args: { title: "Bug" } }],
        }),
        context: makeContext({
          scopeType: "system",
          permissions: { autonomyMode: "suggest", actions: [] },
        }),
      });

      // system limit is 0 per hour — first call should be suppressed
      const r1 = await evaluatePolicy(input);
      expect(r1.actions[0].decision).toBe("drop");
      expect(r1.actions[0].reason).toBe("suggestion_rate_limited");
    });

    it("suppresses all unsolicited suggestions in DMs", async () => {
      const result = await evaluatePolicy(
        makeInput({
          plannerOutput: makePlannerOutput({
            confidence: 0.8,
            proposedActions: [{ actionType: "ticket.create", args: { title: "Bug" } }],
          }),
          context: makeContext({
            scopeType: "chat",
            isDm: true,
            permissions: { autonomyMode: "suggest", actions: [] },
          }),
        }),
      );

      expect(result.actions[0].decision).toBe("drop");
      expect(result.actions[0].reason).toBe("suggestion_rate_limited");
    });
  });

  // ── Anti-chaos: dismissal cooldown ──

  describe("dismissal cooldown", () => {
    it("suppresses suggestions of the same itemType after dismissal", async () => {
      await recordDismissal({
        organizationId: "org-1",
        scopeType: "channel",
        scopeId: "chan-1",
        itemType: "ticket_suggestion",
      });

      const result = await evaluatePolicy(
        makeInput({
          plannerOutput: makePlannerOutput({
            confidence: 0.8,
            proposedActions: [{ actionType: "ticket.create", args: { title: "Bug" } }],
          }),
          context: makeContext({
            permissions: { autonomyMode: "suggest", actions: [] },
          }),
        }),
      );

      expect(result.actions[0].decision).toBe("drop");
      expect(result.actions[0].reason).toBe("dismissal_cooldown");
    });

    it("does not suppress different itemTypes in the same scope", async () => {
      await recordDismissal({
        organizationId: "org-1",
        scopeType: "channel",
        scopeId: "chan-1",
        itemType: "ticket_suggestion",
      });

      // link.create maps to link_suggestion, not ticket_suggestion — should not be suppressed
      // Use confidence 0.5, which is >= suggestMin 0.3 but < actMin 0.6 for low:suggest
      const result = await evaluatePolicy(
        makeInput({
          plannerOutput: makePlannerOutput({
            confidence: 0.5,
            proposedActions: [{ actionType: "link.create", args: { ticketId: "t-1", entityType: "chat", entityId: "c-1" } }],
          }),
          context: makeContext({
            permissions: { autonomyMode: "suggest", actions: [] },
          }),
        }),
      );

      expect(result.actions[0].decision).toBe("suggest");
    });

    it("does not affect execute decisions", async () => {
      await recordDismissal({
        organizationId: "org-1",
        scopeType: "channel",
        scopeId: "chan-1",
        itemType: "ticket_suggestion",
      });

      // In act mode with confidence 0.8 >= actMin 0.7 → execute (not suggest)
      const result = await evaluatePolicy(
        makeInput({
          plannerOutput: makePlannerOutput({
            confidence: 0.8,
            proposedActions: [{ actionType: "ticket.create", args: { title: "Bug" } }],
          }),
          context: makeContext({
            permissions: { autonomyMode: "act", actions: [] },
          }),
        }),
      );

      expect(result.actions[0].decision).toBe("execute");
    });
  });

  // ── Anti-chaos: cost budget ──

  describe("cost budget enforcement", () => {
    it("drops all actions when budget is exhausted", async () => {
      mockCheckBudget.mockResolvedValueOnce({
        dailyLimitCents: 1000,
        spentCents: 1000,
        remainingCents: 0,
        remainingPercent: 0,
      });
      clearBudgetCache();

      const result = await evaluatePolicy(makeInput());

      expect(result.actions[0].decision).toBe("drop");
      expect(result.actions[0].reason).toBe("budget_exhausted");
    });

    it("drops all actions when budget < 10% (observe-only mode)", async () => {
      mockCheckBudget.mockResolvedValueOnce({
        dailyLimitCents: 1000,
        spentCents: 950,
        remainingCents: 50,
        remainingPercent: 5,
      });
      clearBudgetCache();

      const result = await evaluatePolicy(makeInput());

      expect(result.actions[0].decision).toBe("drop");
      expect(result.actions[0].reason).toBe("budget_observe_only");
    });

    it("allows actions when budget is healthy", async () => {
      const result = await evaluatePolicy(makeInput());

      expect(result.actions[0].decision).not.toBe("drop");
    });
  });

  // ── Multiple actions ──

  describe("multiple actions", () => {
    it("evaluates each action independently", async () => {
      const result = await evaluatePolicy(
        makeInput({
          plannerOutput: makePlannerOutput({
            confidence: 0.5,
            proposedActions: [
              // low risk, act mode: actMin=0.4 → 0.5 >= 0.4 → execute
              { actionType: "link.create", args: { ticketId: "t-1", entityType: "chat", entityId: "c-1" } },
              // medium risk, act mode: actMin=0.7 → 0.5 < 0.7, suggestMin=0.3 → suggest
              { actionType: "ticket.create", args: { title: "Bug" } },
              // unknown → drop
              { actionType: "unknown.action", args: {} },
            ],
          }),
        }),
      );

      expect(result.actions).toHaveLength(3);
      expect(result.actions[0].decision).toBe("execute");
      expect(result.actions[1].decision).toBe("suggest");
      expect(result.actions[2].decision).toBe("drop");
      expect(result.actions[2].reason).toBe("unknown_action");
    });
  });
});
