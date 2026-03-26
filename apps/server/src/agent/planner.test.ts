import { describe, expect, it, beforeEach } from "vitest";
import {
  runPlanner,
  setAdapterForTest,
} from "./planner.js";
import type { AgentContextPacket } from "./context-builder.js";
import type {
  LLMAdapter,
  LLMRequestOptions,
  LLMResponse,
  LLMStreamEvent,
} from "@trace/shared";
import { getAllActions } from "./action-registry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContextPacket(overrides?: Partial<AgentContextPacket>): AgentContextPacket {
  return {
    organizationId: "org-1",
    scopeKey: "chat:chat-1",
    scopeType: "chat",
    scopeId: "chat-1",
    triggerEvent: {
      id: "evt-1",
      organizationId: "org-1",
      scopeType: "chat",
      scopeId: "chat-1",
      eventType: "message.created",
      actorType: "user",
      actorId: "user-1",
      payload: { text: "The login page is broken, getting a 500 error" },
      timestamp: "2026-03-24T10:00:00Z",
    },
    eventBatch: [
      {
        id: "evt-1",
        organizationId: "org-1",
        scopeType: "chat",
        scopeId: "chat-1",
        eventType: "message.created",
        actorType: "user",
        actorId: "user-1",
        payload: { text: "The login page is broken, getting a 500 error" },
        timestamp: "2026-03-24T10:00:00Z",
      },
    ],
    isDm: false,
    isMention: false,
    isAgentActiveThread: false,
    soulFile: "You are a helpful assistant.",
    scopeEntity: {
      type: "chat",
      id: "chat-1",
      data: { id: "chat-1", type: "group", name: "Engineering" },
      hop: 0,
    },
    relevantEntities: [],
    recentEvents: [],
    summaries: [],
    actors: [{ id: "user-1", name: "Alice", role: "member", type: "user" }],
    permissions: {
      autonomyMode: "suggest",
      actions: getAllActions() as ReturnType<typeof getAllActions>[number][],
    },
    tokenBudget: { total: 60000, used: 5000, sections: {} },
    ...overrides,
  };
}

/** Create a mock LLM adapter that returns a predetermined tool_use response. */
function makeMockAdapter(toolInput: Record<string, unknown>): LLMAdapter {
  return {
    provider: "anthropic",
    async complete(_options: LLMRequestOptions): Promise<LLMResponse> {
      return {
        content: [
          {
            type: "tool_use",
            id: "tool-1",
            name: "planner_decision",
            input: toolInput,
          },
        ],
        stopReason: "tool_use",
        usage: { inputTokens: 1000, outputTokens: 200 },
        model: "claude-sonnet-4-20250514",
      };
    },
    async *stream(): AsyncIterable<LLMStreamEvent> {
      // Not used by planner
    },
  };
}

/** Create a mock adapter that returns text (no tool use). */
function makeMockAdapterTextOnly(): LLMAdapter {
  return {
    provider: "anthropic",
    async complete(): Promise<LLMResponse> {
      return {
        content: [{ type: "text", text: "I think we should ignore this." }],
        stopReason: "end_turn",
        usage: { inputTokens: 500, outputTokens: 50 },
        model: "claude-sonnet-4-20250514",
      };
    },
    async *stream(): AsyncIterable<LLMStreamEvent> {},
  };
}

/** Create a mock adapter that throws. */
function makeMockAdapterError(message: string): LLMAdapter {
  return {
    provider: "anthropic",
    async complete(): Promise<LLMResponse> {
      throw new Error(message);
    },
    async *stream(): AsyncIterable<LLMStreamEvent> {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Tier 2 Planner", () => {
  beforeEach(() => {
    setAdapterForTest(null);
  });

  describe("successful decisions", () => {
    it("returns ignore for casual conversation", async () => {
      const adapter = makeMockAdapter({
        disposition: "ignore",
        confidence: 0.9,
        rationaleSummary: "Casual conversation, no action needed.",
        proposedActions: [],
      });

      const ctx = makeContextPacket({
        triggerEvent: {
          id: "evt-1",
          organizationId: "org-1",
          scopeType: "chat",
          scopeId: "chat-1",
          eventType: "message.created",
          actorType: "user",
          actorId: "user-1",
          payload: { text: "Hey, how's it going?" },
          timestamp: "2026-03-24T10:00:00Z",
        },
      });

      const result = await runPlanner(ctx, { adapter });

      expect(result.output.disposition).toBe("ignore");
      expect(result.output.confidence).toBe(0.9);
      expect(result.output.proposedActions).toHaveLength(0);
      expect(result.usage.inputTokens).toBe(1000);
      expect(result.usage.outputTokens).toBe(200);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.model).toBe("claude-sonnet-4-20250514");
    });

    it("returns suggest with ticket.create for a bug report", async () => {
      const adapter = makeMockAdapter({
        disposition: "suggest",
        confidence: 0.85,
        rationaleSummary: "User reported a bug — suggesting ticket creation.",
        proposedActions: [
          {
            actionType: "ticket.create",
            args: {
              title: "Login page returns 500 error",
              description: "User reported the login page is broken with a 500 error.",
              priority: "high",
            },
          },
        ],
        userVisibleMessage: "I noticed a bug report — would you like me to create a ticket?",
      });

      const result = await runPlanner(makeContextPacket(), { adapter });

      expect(result.output.disposition).toBe("suggest");
      expect(result.output.confidence).toBe(0.85);
      expect(result.output.proposedActions).toHaveLength(1);
      expect(result.output.proposedActions[0].actionType).toBe("ticket.create");
      expect(result.output.proposedActions[0].args.title).toBe("Login page returns 500 error");
      expect(result.output.userVisibleMessage).toContain("bug report");
    });

    it("returns act for low-risk summary update", async () => {
      const adapter = makeMockAdapter({
        disposition: "act",
        confidence: 0.95,
        rationaleSummary: "Sufficient new activity to update the rolling summary.",
        proposedActions: [
          {
            actionType: "summary.update",
            args: {
              entityType: "chat",
              entityId: "chat-1",
              summary: "Team discussed login page issues and deployment timeline.",
            },
          },
        ],
      });

      const result = await runPlanner(makeContextPacket(), { adapter });

      expect(result.output.disposition).toBe("act");
      expect(result.output.proposedActions[0].actionType).toBe("summary.update");
    });

    it("returns escalate with promotionReason", async () => {
      const adapter = makeMockAdapter({
        disposition: "escalate",
        confidence: 0.6,
        rationaleSummary: "Complex architectural discussion needs deeper analysis.",
        proposedActions: [],
        promotionReason:
          "Multiple conflicting approaches discussed — need Tier 3 to synthesize and suggest.",
      });

      const result = await runPlanner(makeContextPacket(), { adapter });

      expect(result.output.disposition).toBe("escalate");
      expect(result.output.promotionReason).toContain("Tier 3");
    });

    it("returns suggest with message.send when existing ticket found", async () => {
      const adapter = makeMockAdapter({
        disposition: "suggest",
        confidence: 0.75,
        rationaleSummary:
          "A matching ticket already exists — suggesting a reply referencing it.",
        proposedActions: [
          {
            actionType: "message.send",
            args: {
              chatId: "chat-1",
              text: "There's already a ticket for this: Login page 500 error (TICKET-42).",
            },
          },
        ],
        userVisibleMessage: "A related ticket already exists — should I mention it?",
      });

      const ctx = makeContextPacket({
        relevantEntities: [
          {
            type: "ticket",
            id: "ticket-42",
            data: {
              id: "ticket-42",
              title: "Login page 500 error",
              status: "in_progress",
              priority: "high",
            },
            hop: 1,
          },
        ],
      });

      const result = await runPlanner(ctx, { adapter });

      expect(result.output.disposition).toBe("suggest");
      expect(result.output.proposedActions[0].actionType).toBe("message.send");
    });
  });

  describe("error handling", () => {
    it("defaults to ignore when LLM returns text only (no tool use)", async () => {
      const adapter = makeMockAdapterTextOnly();
      const result = await runPlanner(makeContextPacket(), { adapter });

      expect(result.output.disposition).toBe("ignore");
      expect(result.output.rationaleSummary).toContain("did not produce a tool_use");
    });

    it("defaults to ignore when LLM throws an error", async () => {
      const adapter = makeMockAdapterError("API rate limited");
      const result = await runPlanner(makeContextPacket(), { adapter });

      expect(result.output.disposition).toBe("ignore");
      expect(result.output.rationaleSummary).toContain("API rate limited");
      expect(result.usage.inputTokens).toBe(0);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("defaults to ignore for invalid disposition", async () => {
      const adapter = makeMockAdapter({
        disposition: "destroy_everything",
        confidence: 1.0,
        rationaleSummary: "Let's break things.",
        proposedActions: [],
      });

      const result = await runPlanner(makeContextPacket(), { adapter });

      expect(result.output.disposition).toBe("ignore");
      expect(result.output.rationaleSummary).toContain("Invalid disposition");
    });

    it("filters out unknown action names", async () => {
      const adapter = makeMockAdapter({
        disposition: "suggest",
        confidence: 0.8,
        rationaleSummary: "Suggesting an action.",
        proposedActions: [
          { actionType: "ticket.create", args: { title: "Real action" } },
          { actionType: "hack.server", args: { target: "prod" } },
        ],
      });

      const result = await runPlanner(makeContextPacket(), { adapter });

      expect(result.output.disposition).toBe("suggest");
      expect(result.output.proposedActions).toHaveLength(1);
      expect(result.output.proposedActions[0].actionType).toBe("ticket.create");
    });

    it("downgrades to ignore when all actions are invalid", async () => {
      const adapter = makeMockAdapter({
        disposition: "act",
        confidence: 0.9,
        rationaleSummary: "Acting on it.",
        proposedActions: [
          { actionType: "nonexistent.action", args: {} },
        ],
      });

      const result = await runPlanner(makeContextPacket(), { adapter });

      expect(result.output.disposition).toBe("ignore");
      expect(result.output.rationaleSummary).toContain("no valid actions");
    });

    it("clamps confidence to [0, 1] range", async () => {
      const adapter = makeMockAdapter({
        disposition: "ignore",
        confidence: 5.0,
        rationaleSummary: "Over-confident.",
        proposedActions: [],
      });

      const result = await runPlanner(makeContextPacket(), { adapter });

      expect(result.output.confidence).toBe(1);
    });

    it("handles missing rationaleSummary gracefully", async () => {
      const adapter = makeMockAdapter({
        disposition: "ignore",
        confidence: 0.5,
        proposedActions: [],
      });

      const result = await runPlanner(makeContextPacket(), { adapter });

      expect(result.output.rationaleSummary).toBe("No rationale provided.");
    });

    it("handles malformed proposedActions array", async () => {
      const adapter = makeMockAdapter({
        disposition: "suggest",
        confidence: 0.8,
        rationaleSummary: "Trying.",
        proposedActions: [null, 42, "not an object"],
      });

      const result = await runPlanner(makeContextPacket(), { adapter });

      // All actions invalid → downgraded to ignore
      expect(result.output.disposition).toBe("ignore");
    });
  });

  describe("token usage and latency tracking", () => {
    it("returns token usage from LLM response", async () => {
      const adapter = makeMockAdapter({
        disposition: "ignore",
        confidence: 0.9,
        rationaleSummary: "Nothing to do.",
        proposedActions: [],
      });

      const result = await runPlanner(makeContextPacket(), { adapter });

      expect(result.usage).toEqual({ inputTokens: 1000, outputTokens: 200 });
    });

    it("records latency", async () => {
      const adapter = makeMockAdapter({
        disposition: "ignore",
        confidence: 0.5,
        rationaleSummary: "Nope.",
        proposedActions: [],
      });

      const result = await runPlanner(makeContextPacket(), { adapter });

      expect(typeof result.latencyMs).toBe("number");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("model selection", () => {
    it("uses provided model override", async () => {
      const adapter = makeMockAdapter({
        disposition: "ignore",
        confidence: 0.5,
        rationaleSummary: "Test.",
        proposedActions: [],
      });

      // Verify the adapter receives the model via captured options
      let capturedModel = "";
      const capturingAdapter: LLMAdapter = {
        provider: "anthropic",
        async complete(options: LLMRequestOptions): Promise<LLMResponse> {
          capturedModel = options.model;
          return adapter.complete(options);
        },
        async *stream(): AsyncIterable<LLMStreamEvent> {},
      };

      await runPlanner(makeContextPacket(), {
        adapter: capturingAdapter,
        model: "claude-haiku-4-5-20251001",
      });

      expect(capturedModel).toBe("claude-haiku-4-5-20251001");
    });
  });

  describe("system prompt construction", () => {
    it("includes action schema, soul file, and context in system prompt", async () => {
      let capturedSystem = "";
      const capturingAdapter: LLMAdapter = {
        provider: "anthropic",
        async complete(options: LLMRequestOptions): Promise<LLMResponse> {
          capturedSystem = options.system ?? "";
          return {
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "planner_decision",
                input: {
                  disposition: "ignore",
                  confidence: 0.5,
                  rationaleSummary: "Test.",
                  proposedActions: [],
                },
              },
            ],
            stopReason: "tool_use",
            usage: { inputTokens: 100, outputTokens: 50 },
            model: "test-model",
          };
        },
        async *stream(): AsyncIterable<LLMStreamEvent> {},
      };

      const ctx = makeContextPacket({
        soulFile: "Be friendly and proactive.",
      });

      await runPlanner(ctx, { adapter: capturingAdapter });

      // System prompt should contain key sections
      expect(capturedSystem).toContain("planner_decision");
      expect(capturedSystem).toContain("<action_schema>");
      expect(capturedSystem).toContain("ticket.create");
      expect(capturedSystem).toContain("no_op");
      expect(capturedSystem).toContain("<soul_file>");
      expect(capturedSystem).toContain("Be friendly and proactive.");
      expect(capturedSystem).toContain("<trigger_event>");
      expect(capturedSystem).toContain("<scope>");
      expect(capturedSystem).toContain("<actors>");
      expect(capturedSystem).toContain("ignore");
    });

    it("includes relevant entities and summaries when present", async () => {
      let capturedSystem = "";
      const capturingAdapter: LLMAdapter = {
        provider: "anthropic",
        async complete(options: LLMRequestOptions): Promise<LLMResponse> {
          capturedSystem = options.system ?? "";
          return {
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "planner_decision",
                input: {
                  disposition: "ignore",
                  confidence: 0.5,
                  rationaleSummary: "Test.",
                  proposedActions: [],
                },
              },
            ],
            stopReason: "tool_use",
            usage: { inputTokens: 100, outputTokens: 50 },
            model: "test-model",
          };
        },
        async *stream(): AsyncIterable<LLMStreamEvent> {},
      };

      const ctx = makeContextPacket({
        relevantEntities: [
          {
            type: "ticket",
            id: "t-99",
            data: { id: "t-99", title: "Existing bug" },
            hop: 1,
          },
        ],
        summaries: [
          {
            entityType: "chat",
            entityId: "chat-1",
            content: "Team discussed deployment.",
            structuredData: {},
            fresh: true,
            eventCount: 10,
          },
        ],
      });

      await runPlanner(ctx, { adapter: capturingAdapter });

      expect(capturedSystem).toContain("<relevant_entities");
      expect(capturedSystem).toContain("Existing bug");
      expect(capturedSystem).toContain("<summaries>");
      expect(capturedSystem).toContain("Team discussed deployment.");
    });
  });
});
