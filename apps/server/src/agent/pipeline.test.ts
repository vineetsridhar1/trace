import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AggregatedBatch } from "./aggregator.js";
import type { OrgAgentSettings } from "../services/agent-identity.js";
import type { AgentContextPacket } from "./context-builder.js";
import type { PlannerTurnResult, PlannerOutput } from "./planner.js";
import type { PolicyResult } from "./policy-engine.js";
import type { LLMResponse } from "@trace/shared";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock("./context-builder.js", () => ({
  buildContext: vi.fn(),
  TIER3_TOKEN_BUDGET: {
    total: 100_000,
    sections: {
      triggerEvent: 3_000,
      actionSchema: 5_000,
      soulFile: 3_000,
      scopeEntity: 6_000,
      eventBatch: 18_000,
      relevantEntities: 18_000,
      summaries: 16_000,
      memories: 8_000,
      recentEvents: 12_000,
      actors: 3_000,
    },
  },
}));

vi.mock("./planner.js", () => ({
  DEFAULT_SONNET_MODEL: "claude-sonnet-4-20250514",
  DEFAULT_OPUS_MODEL: "claude-opus-4-20250514",
  PLANNER_TOOL: { name: "planner_decision" },
  buildSystemPrompt: vi
    .fn()
    .mockReturnValue({ text: "system prompt", blockVersions: { "system-preamble": 1 } }),
  runPlannerTurn: vi.fn(),
}));

vi.mock("./policy-engine.js", () => ({
  evaluatePolicy: vi.fn(),
}));

vi.mock("./suggestion.js", () => ({
  createSuggestions: vi.fn().mockResolvedValue({
    created: [
      {
        actionType: "ticket.create",
        itemId: "inbox-1",
        itemType: "ticket_suggestion",
      },
    ],
    suppressed: [],
  }),
}));

vi.mock("./summary-worker.js", () => ({
  refreshSummary: vi.fn().mockResolvedValue({ costCents: 0.5 }),
}));

vi.mock("./soul-file-resolver.js", () => ({
  fetchProjectSoulFile: vi.fn().mockResolvedValue(undefined),
  fetchRepoIdForScope: vi.fn().mockResolvedValue(undefined),
  loadRepoSoulFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/execution-logging.js", () => ({
  executionLoggingService: { write: vi.fn().mockResolvedValue({}) },
}));

vi.mock("../services/cost-tracking.js", () => ({
  costTrackingService: {
    recordCost: vi.fn().mockResolvedValue({}),
    checkBudget: vi.fn().mockResolvedValue({
      dailyLimitCents: 1000,
      spentCents: 100,
      remainingCents: 900,
      remainingPercent: 90,
    }),
  },
}));

vi.mock("../services/processed-event.js", () => ({
  processedEventService: {
    isProcessed: vi.fn().mockResolvedValue(false),
    markProcessed: vi.fn().mockResolvedValue({}),
  },
}));

// Now import the module under test and mocked modules
import { runPipeline } from "./pipeline.js";
import { buildContext } from "./context-builder.js";
import { runPlannerTurn } from "./planner.js";
import { evaluatePolicy } from "./policy-engine.js";
import { createSuggestions } from "./suggestion.js";
import { refreshSummary } from "./summary-worker.js";
import { executionLoggingService } from "../services/execution-logging.js";
import { costTrackingService } from "../services/cost-tracking.js";
import { processedEventService } from "../services/processed-event.js";
import { ActionExecutor } from "./executor.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockBuildContext = vi.mocked(buildContext);
const mockRunPlannerTurn = vi.mocked(runPlannerTurn);
const mockEvaluatePolicy = vi.mocked(evaluatePolicy);
const mockCreateSuggestions = vi.mocked(createSuggestions);
const mockRefreshSummary = vi.mocked(refreshSummary);
const mockLogWrite = vi.mocked(executionLoggingService.write);
const mockRecordCost = vi.mocked(costTrackingService.recordCost);
const mockCheckBudget = vi.mocked(costTrackingService.checkBudget);
const mockIsProcessed = vi.mocked(processedEventService.isProcessed);
const mockMarkProcessed = vi.mocked(processedEventService.markProcessed);

function makeBatch(overrides?: Partial<AggregatedBatch>): AggregatedBatch {
  return {
    scopeKey: "channel:ch-1",
    organizationId: "org-1",
    events: [
      {
        id: "evt-1",
        organizationId: "org-1",
        scopeType: "channel",
        scopeId: "ch-1",
        eventType: "message.sent",
        actorType: "user",
        actorId: "user-1",
        payload: { body: "found a bug" },
        timestamp: new Date().toISOString(),
      },
    ],
    openedAt: Date.now() - 5000,
    closedAt: Date.now(),
    closeReason: "time" as const,
    ...overrides,
  };
}

function makePacket(overrides?: Partial<AgentContextPacket>): AgentContextPacket {
  return {
    organizationId: "org-1",
    scopeKey: "channel:ch-1",
    scopeType: "channel",
    scopeId: "ch-1",
    isDm: false,
    isMention: false,
    triggerEvent: {
      id: "evt-1",
      organizationId: "org-1",
      scopeType: "channel",
      scopeId: "ch-1",
      eventType: "message.sent",
      actorType: "user",
      actorId: "user-1",
      payload: { body: "found a bug" },
      timestamp: new Date().toISOString(),
    },
    eventBatch: [],
    soulFile: "You are a helpful assistant.",
    scopeEntity: null,
    relevantEntities: [],
    recentEvents: [],
    summaries: [],
    memories: [],
    actors: [],
    permissions: { autonomyMode: "suggest", actions: [] },
    tokenBudget: { total: 60000, used: 5000, sections: { trigger: 200 } },
    ...overrides,
  } as AgentContextPacket;
}

function makeLLMResponse(model = "claude-haiku-test"): LLMResponse {
  return {
    content: [
      {
        type: "tool_use",
        id: "tool-1",
        name: "planner_decision",
        input: {},
      },
    ],
    stopReason: "tool_use",
    usage: { inputTokens: 1000, outputTokens: 200 },
    model,
  };
}

function makeTurnResult(
  disposition: string,
  overrides?: {
    done?: boolean;
    proposedActions?: PlannerOutput["proposedActions"];
    promotionReason?: string;
    promotionTarget?: "sonnet" | "opus";
    model?: string;
  },
): PlannerTurnResult {
  const actions =
    overrides?.proposedActions ??
    (disposition === "ignore" ? [] : [{ actionType: "ticket.create", args: { title: "Bug" } }]);
  return {
    output: {
      disposition: disposition as PlannerOutput["disposition"],
      confidence: 0.85,
      rationaleSummary: "test rationale",
      proposedActions: actions,
      done: overrides?.done,
      promotionReason: overrides?.promotionReason,
      promotionTarget: overrides?.promotionTarget,
    },
    response: makeLLMResponse(overrides?.model),
    latencyMs: 500,
    provider: "anthropic",
    maxTokens: 1024,
  };
}

const agentSettings: OrgAgentSettings = {
  agentId: "agent-1",
  status: "active",
  autonomyMode: "suggest",
  actThreshold: 0.9,
  suggestThreshold: 0.6,
  dailyBudgetCents: 1000,
};

const mockExecutor = {
  execute: vi.fn().mockResolvedValue({ status: "success", actionType: "ticket.create" }),
} as unknown as ActionExecutor;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsProcessed.mockResolvedValue(false);
  });

  it("skips already-processed events", async () => {
    mockIsProcessed.mockResolvedValue(true);

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockBuildContext).not.toHaveBeenCalled();
    expect(mockRunPlannerTurn).not.toHaveBeenCalled();
  });

  it("skips empty batches", async () => {
    await runPipeline({ batch: makeBatch({ events: [] }), agentSettings, executor: mockExecutor });
    expect(mockBuildContext).not.toHaveBeenCalled();
  });

  it("survives context builder failure", async () => {
    mockBuildContext.mockRejectedValue(new Error("db connection lost"));

    await expect(
      runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor }),
    ).resolves.toBeUndefined();

    expect(mockRunPlannerTurn).not.toHaveBeenCalled();
  });

  // ── Disposition handling ──

  it("handles ignore — logs and marks processed, no policy call", async () => {
    mockBuildContext.mockResolvedValue(makePacket());
    mockRunPlannerTurn.mockResolvedValue(makeTurnResult("ignore"));

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockRunPlannerTurn).toHaveBeenCalledOnce();
    expect(mockEvaluatePolicy).not.toHaveBeenCalled();
    expect(mockLogWrite).toHaveBeenCalledOnce();
    expect(mockRecordCost).toHaveBeenCalledOnce();
    expect(mockMarkProcessed).toHaveBeenCalledOnce();
    expect(mockLogWrite.mock.calls[0][0].disposition).toBe("ignore");
    expect(mockLogWrite.mock.calls[0][0].status).toBe("dropped");
  });

  it("handles summarize — triggers summary refresh", async () => {
    mockBuildContext.mockResolvedValue(makePacket());
    mockRunPlannerTurn.mockResolvedValue(makeTurnResult("summarize"));

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockRefreshSummary).toHaveBeenCalledWith("org-1", "channel", "ch-1");
    expect(mockEvaluatePolicy).not.toHaveBeenCalled();
    expect(mockLogWrite).toHaveBeenCalledOnce();
    expect(mockMarkProcessed).toHaveBeenCalledOnce();
  });

  // ── Suggest/Act flow ──

  it("runs full pipeline for suggest disposition", async () => {
    mockBuildContext.mockResolvedValue(makePacket());
    mockRunPlannerTurn.mockResolvedValue(makeTurnResult("suggest", { done: true }));
    mockEvaluatePolicy.mockResolvedValue({
      actions: [
        {
          action: { actionType: "ticket.create", args: { title: "Bug" } },
          decision: "suggest",
          reason: "confidence below act threshold",
        },
      ],
      plannerOutput: makeTurnResult("suggest").output,
    } as PolicyResult);

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockEvaluatePolicy).toHaveBeenCalledOnce();
    expect(mockCreateSuggestions).toHaveBeenCalledOnce();
    // The executor is called once by sendActionConfirmation (auto-reply in thread)
    // but not by the policy engine for action execution
    expect(mockLogWrite).toHaveBeenCalledOnce();
    expect(mockLogWrite.mock.calls[0][0].status).toBe("suggested");
  });

  it("treats dedup-suppressed suggestions as dropped, not suggested", async () => {
    mockBuildContext.mockResolvedValue(makePacket());
    mockRunPlannerTurn.mockResolvedValue(makeTurnResult("suggest", { done: true }));
    mockEvaluatePolicy.mockResolvedValue({
      actions: [
        {
          action: { actionType: "ticket.create", args: { title: "Bug" } },
          decision: "suggest",
          reason: "confidence below act threshold",
        },
      ],
      plannerOutput: makeTurnResult("suggest").output,
    } as PolicyResult);
    mockCreateSuggestions.mockResolvedValueOnce({
      created: [],
      suppressed: [{ actionType: "ticket.create", reason: "duplicate_suppressed" }],
    });

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockLogWrite).toHaveBeenCalledOnce();
    expect(mockLogWrite.mock.calls[0][0].status).toBe("dropped");
    expect(mockLogWrite.mock.calls[0][0].finalActions).toContainEqual({
      actionType: "ticket.create",
      decision: "drop",
      reason: "duplicate_suppressed",
    });
  });

  it("runs full pipeline for act disposition with execute decision", async () => {
    mockBuildContext.mockResolvedValue(makePacket());
    mockRunPlannerTurn.mockResolvedValue(makeTurnResult("act", { done: true }));
    mockEvaluatePolicy.mockResolvedValue({
      actions: [
        {
          action: { actionType: "ticket.create", args: { title: "Bug" } },
          decision: "execute",
          reason: "high confidence, low risk",
        },
      ],
      plannerOutput: makeTurnResult("act").output,
    } as PolicyResult);

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    // Executor called twice: once for ticket.create, once for sendActionConfirmation auto-reply
    expect(mockExecutor.execute as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
    expect(mockCreateSuggestions).not.toHaveBeenCalled();
    expect(mockLogWrite.mock.calls[0][0].status).toBe("succeeded");
  });

  it("handles policy engine dropping actions", async () => {
    mockBuildContext.mockResolvedValue(makePacket());
    mockRunPlannerTurn.mockResolvedValue(makeTurnResult("suggest", { done: true }));
    mockEvaluatePolicy.mockResolvedValue({
      actions: [
        {
          action: { actionType: "ticket.create", args: { title: "Bug" } },
          decision: "drop",
          reason: "rate limited",
        },
      ],
      plannerOutput: makeTurnResult("suggest").output,
    } as PolicyResult);

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockCreateSuggestions).not.toHaveBeenCalled();
    expect(mockExecutor.execute as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    expect(mockLogWrite.mock.calls[0][0].status).toBe("dropped");
  });

  it("survives policy engine failure", async () => {
    mockBuildContext.mockResolvedValue(makePacket());
    mockRunPlannerTurn.mockResolvedValue(makeTurnResult("suggest"));
    mockEvaluatePolicy.mockRejectedValue(new Error("policy failure"));

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockLogWrite).toHaveBeenCalledOnce();
    expect(mockMarkProcessed).toHaveBeenCalledOnce();
  });

  // ── Multi-turn ──

  it("runs multiple turns when planner does not set done", async () => {
    mockBuildContext.mockResolvedValue(makePacket());

    // Turn 1: act, done=false → Turn 2: ignore, done=true
    mockRunPlannerTurn
      .mockResolvedValueOnce(makeTurnResult("act", { done: false }))
      .mockResolvedValueOnce(makeTurnResult("ignore", { done: true }));

    mockEvaluatePolicy.mockResolvedValue({
      actions: [
        {
          action: { actionType: "message.send", args: { chatId: "ch-1", text: "hi" } },
          decision: "execute",
          reason: "ok",
        },
      ],
      plannerOutput: makeTurnResult("act").output,
    } as PolicyResult);

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockRunPlannerTurn).toHaveBeenCalledTimes(2);
    // Policy only called for the act turn, not the ignore turn
    expect(mockEvaluatePolicy).toHaveBeenCalledOnce();
  });

  it("stops at done=true even if more turns are available", async () => {
    mockBuildContext.mockResolvedValue(makePacket());
    mockRunPlannerTurn.mockResolvedValue(makeTurnResult("act", { done: true }));
    mockEvaluatePolicy.mockResolvedValue({
      actions: [
        {
          action: { actionType: "ticket.create", args: { title: "Bug" } },
          decision: "execute",
          reason: "ok",
        },
      ],
      plannerOutput: makeTurnResult("act").output,
    } as PolicyResult);

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockRunPlannerTurn).toHaveBeenCalledOnce();
  });

  // ── Tier 3 promotion ──

  it("promotes to Opus when planner escalates with promotionTarget opus", async () => {
    const packet = makePacket();
    const tier3Packet = makePacket({
      tokenBudget: { total: 100000, used: 8000, sections: { trigger: 300 } },
    });
    mockBuildContext.mockResolvedValueOnce(packet).mockResolvedValueOnce(tier3Packet);

    mockRunPlannerTurn
      .mockResolvedValueOnce(
        makeTurnResult("escalate", {
          promotionReason: "complex task",
          promotionTarget: "opus",
        }),
      )
      .mockResolvedValueOnce(
        makeTurnResult("act", { done: true, model: "claude-opus-4-20250514" }),
      );

    mockEvaluatePolicy.mockResolvedValue({
      actions: [
        {
          action: { actionType: "ticket.create", args: { title: "Bug" } },
          decision: "execute",
          reason: "ok",
        },
      ],
      plannerOutput: makeTurnResult("act").output,
    } as PolicyResult);

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    // Two planner calls: Tier 2 escalate, then Opus re-run
    expect(mockRunPlannerTurn).toHaveBeenCalledTimes(2);
    // Context rebuilt for Opus
    expect(mockBuildContext).toHaveBeenCalledTimes(2);
    // Tier 2 cost recorded separately
    expect(mockRecordCost.mock.calls[0][0].modelTier).toBe("tier2");
  });

  it("promotes to Sonnet (default) when no promotionTarget specified", async () => {
    mockBuildContext.mockResolvedValue(makePacket());

    mockRunPlannerTurn
      .mockResolvedValueOnce(makeTurnResult("escalate", { promotionReason: "needs reasoning" }))
      .mockResolvedValueOnce(
        makeTurnResult("act", { done: true, model: "claude-sonnet-4-20250514" }),
      );

    mockEvaluatePolicy.mockResolvedValue({
      actions: [
        {
          action: { actionType: "ticket.create", args: { title: "Bug" } },
          decision: "execute",
          reason: "ok",
        },
      ],
      plannerOutput: makeTurnResult("act").output,
    } as PolicyResult);

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    // Context NOT rebuilt (Sonnet doesn't get larger budget)
    expect(mockBuildContext).toHaveBeenCalledOnce();
  });

  it("suppresses Opus promotion when budget is below 50%", async () => {
    mockBuildContext.mockResolvedValue(makePacket());
    mockRunPlannerTurn.mockResolvedValue(
      makeTurnResult("escalate", {
        promotionReason: "complex task",
        promotionTarget: "opus",
      }),
    );
    mockCheckBudget.mockResolvedValue({
      dailyLimitCents: 1000,
      spentCents: 600,
      remainingCents: 400,
      remainingPercent: 40,
    });

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    // Only one planner call — promotion suppressed
    expect(mockRunPlannerTurn).toHaveBeenCalledOnce();
    expect(mockLogWrite).toHaveBeenCalledOnce();
  });

  it("runs Tier 3 directly when batch.maxTier is 3", async () => {
    mockBuildContext.mockResolvedValue(makePacket());
    mockRunPlannerTurn.mockResolvedValue(
      makeTurnResult("act", { done: true, model: "claude-opus-4-20250514" }),
    );
    mockEvaluatePolicy.mockResolvedValue({
      actions: [
        {
          action: { actionType: "ticket.create", args: { title: "Bug" } },
          decision: "execute",
          reason: "ok",
        },
      ],
      plannerOutput: makeTurnResult("act").output,
    } as PolicyResult);

    await runPipeline({
      batch: makeBatch({ maxTier: 3 }),
      agentSettings,
      executor: mockExecutor,
    });

    expect(mockRunPlannerTurn).toHaveBeenCalledOnce();
    // Build context with Tier 3 budget
    expect(mockBuildContext.mock.calls[0][0]).toHaveProperty("tokenBudget");
    expect(mockLogWrite.mock.calls[0][0].promoted).toBe(true);
    expect(mockLogWrite.mock.calls[0][0].promotionReason).toBe("rule_based:router");
  });

  // ── @mention handling ──

  it("forces reply when planner ignores an @mention", async () => {
    const packet = makePacket({
      isMention: true,
      scopeType: "chat",
      scopeId: "chat-1",
      triggerEvent: {
        id: "evt-1",
        organizationId: "org-1",
        scopeType: "chat",
        scopeId: "chat-1",
        eventType: "message_sent",
        actorType: "user",
        actorId: "user-1",
        payload: { messageId: "msg-1" },
        timestamp: new Date().toISOString(),
      },
    });
    mockBuildContext.mockResolvedValue(packet);
    // Turn 1: planner ignores → pipeline overrides with forced reply
    // Turn 2: planner says done
    mockRunPlannerTurn
      .mockResolvedValueOnce(makeTurnResult("ignore"))
      .mockResolvedValueOnce(makeTurnResult("ignore", { done: true }));
    mockEvaluatePolicy.mockResolvedValue({
      actions: [
        {
          action: {
            actionType: "message.send",
            args: { chatId: "chat-1", text: "test rationale", parentId: "msg-1" },
          },
          decision: "execute",
          reason: "forced mention reply",
        },
      ],
      plannerOutput: makeTurnResult("act").output,
    } as PolicyResult);

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    // Policy engine was called (ignore was overridden to act)
    expect(mockEvaluatePolicy).toHaveBeenCalledOnce();
  });

  it("treats channel.sendMessage as the reply action for channel mentions", async () => {
    const packet = makePacket({
      isMention: true,
      scopeType: "channel",
      scopeId: "ch-1",
      triggerEvent: {
        id: "evt-1",
        organizationId: "org-1",
        scopeType: "channel",
        scopeId: "ch-1",
        eventType: "message_sent",
        actorType: "user",
        actorId: "user-1",
        payload: { messageId: "msg-1" },
        timestamp: new Date().toISOString(),
      },
    });
    mockBuildContext.mockResolvedValue(packet);
    mockRunPlannerTurn.mockResolvedValue(
      makeTurnResult("act", {
        done: true,
        proposedActions: [
          { actionType: "channel.sendMessage", args: { channelId: "ch-1", text: "On it." } },
        ],
      }),
    );
    mockEvaluatePolicy.mockImplementation(async ({ plannerOutput }) => ({
      actions: plannerOutput.proposedActions.map((action) => ({
        action,
        decision: "execute" as const,
        reason: "ok",
      })),
      plannerOutput,
    }));
    (mockExecutor.execute as ReturnType<typeof vi.fn>).mockImplementation(
      async (action: { actionType: string }) => ({
        status: "success",
        actionType: action.actionType,
      }),
    );

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
    expect(mockExecutor.execute).toHaveBeenCalledWith(
      {
        actionType: "channel.sendMessage",
        args: { channelId: "ch-1", text: "On it.", threadId: "msg-1" },
      },
      {
        organizationId: "org-1",
        agentId: "agent-1",
        triggerEventId: "evt-1",
        scopeType: "channel",
        scopeId: "ch-1",
        isDm: false,
      },
    );
  });

  // ── Execution logging ──

  it("records cost and execution log with full decision chain", async () => {
    mockBuildContext.mockResolvedValue(makePacket());
    mockRunPlannerTurn.mockResolvedValue(makeTurnResult("act", { done: true }));
    mockEvaluatePolicy.mockResolvedValue({
      actions: [
        {
          action: { actionType: "ticket.create", args: { title: "Bug" } },
          decision: "execute",
          reason: "ok",
        },
      ],
      plannerOutput: makeTurnResult("act").output,
    } as PolicyResult);

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockRecordCost).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", modelTier: "tier2" }),
    );
    expect(mockLogWrite).toHaveBeenCalledOnce();
    const logInput = mockLogWrite.mock.calls[0][0];
    expect(logInput).toMatchObject({
      organizationId: "org-1",
      triggerEventId: "evt-1",
      agentId: "agent-1",
      modelTier: "tier2",
      disposition: "act",
      confidence: 0.85,
    });
    expect(logInput.plannedActions).toHaveLength(1);
    expect(logInput.finalActions).toHaveLength(1);
  });
});
