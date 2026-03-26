import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AggregatedBatch } from "./aggregator.js";
import type { OrgAgentSettings } from "../services/agent-identity.js";
import type { AgentContextPacket } from "./context-builder.js";
import type { PlannerResult } from "./planner.js";
import type { PolicyResult } from "./policy-engine.js";

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
      relevantEntities: 22_000,
      summaries: 18_000,
      recentEvents: 14_000,
      actors: 3_000,
    },
  },
}));

vi.mock("./planner.js", () => ({
  runPlanner: vi.fn(),
  DEFAULT_SONNET_MODEL: "claude-sonnet-4-20250514",
  DEFAULT_OPUS_MODEL: "claude-opus-4-20250514",
  buildSystemPrompt: vi.fn().mockReturnValue("system prompt"),
  runPlannerTurn: vi.fn(),
}));

vi.mock("./policy-engine.js", () => ({
  evaluatePolicy: vi.fn(),
}));

vi.mock("./suggestion.js", () => ({
  createSuggestions: vi.fn().mockResolvedValue([{ id: "inbox-1", itemType: "ticket_suggestion" }]),
}));

vi.mock("./summary-worker.js", () => ({
  refreshSummary: vi.fn().mockResolvedValue({ costCents: 0.5 }),
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
import { runPlanner } from "./planner.js";
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
const mockRunPlanner = vi.mocked(runPlanner);
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
    actors: [],
    permissions: { autonomyMode: "suggest", actions: [] },
    tokenBudget: { total: 60000, used: 5000, sections: { trigger: 200 } },
    ...overrides,
  } as AgentContextPacket;
}

function makePlannerResult(
  disposition: string,
  overrides?: Partial<PlannerResult>,
): PlannerResult {
  return {
    output: {
      disposition: disposition as PlannerResult["output"]["disposition"],
      confidence: 0.85,
      rationaleSummary: "test rationale",
      proposedActions: disposition === "ignore" ? [] : [{ actionType: "ticket.create", args: { title: "Bug" } }],
    },
    usage: { inputTokens: 1000, outputTokens: 200 },
    latencyMs: 500,
    model: "claude-sonnet-test",
    ...overrides,
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
    expect(mockRunPlanner).not.toHaveBeenCalled();
  });

  it("handles ignore disposition — logs and marks processed", async () => {
    const packet = makePacket();
    mockBuildContext.mockResolvedValue(packet);
    mockRunPlanner.mockResolvedValue(makePlannerResult("ignore"));

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockRunPlanner).toHaveBeenCalledOnce();
    expect(mockEvaluatePolicy).not.toHaveBeenCalled();
    expect(mockLogWrite).toHaveBeenCalledOnce();
    expect(mockRecordCost).toHaveBeenCalledOnce();
    expect(mockMarkProcessed).toHaveBeenCalledOnce();

    // Verify the log recorded the "dropped" status
    const logInput = mockLogWrite.mock.calls[0][0];
    expect(logInput.disposition).toBe("ignore");
    expect(logInput.status).toBe("dropped");
  });

  it("handles escalate disposition with promotion — re-runs with Tier 3", async () => {
    const packet = makePacket();
    const tier3Packet = makePacket({ tokenBudget: { total: 100000, used: 8000, sections: { trigger: 300 } } });
    mockBuildContext
      .mockResolvedValueOnce(packet) // Tier 2 context
      .mockResolvedValueOnce(tier3Packet); // Tier 3 context (rebuilt)

    // Tier 2 planner returns escalate with promotionReason
    const tier2Result = makePlannerResult("escalate");
    tier2Result.output.promotionReason = "complex multi-step task";

    // Tier 3 planner returns act
    const tier3Result = makePlannerResult("act", { model: "claude-opus-4-20250514" });

    mockRunPlanner
      .mockResolvedValueOnce(tier2Result)
      .mockResolvedValueOnce(tier3Result);

    mockEvaluatePolicy.mockResolvedValue({
      actions: [
        {
          action: { actionType: "ticket.create", args: { title: "Bug" } },
          decision: "execute",
          reason: "high confidence",
        },
      ],
      plannerOutput: tier3Result.output,
    } as PolicyResult);

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    // Planner called twice: once for Tier 2, once for Tier 3
    expect(mockRunPlanner).toHaveBeenCalledTimes(2);
    // Second call should use Tier 3 model
    expect(mockRunPlanner.mock.calls[1][1]).toEqual({ model: "claude-opus-4-20250514" });
    // Context rebuilt for Tier 3
    expect(mockBuildContext).toHaveBeenCalledTimes(2);
    // Execution log records promotion
    expect(mockLogWrite).toHaveBeenCalledOnce();
    expect(mockLogWrite.mock.calls[0][0].modelTier).toBe("tier3");
    expect(mockLogWrite.mock.calls[0][0].promoted).toBe(true);
    expect(mockLogWrite.mock.calls[0][0].promotionReason).toBe("complex multi-step task");
    // Cost recorded for both tiers
    expect(mockRecordCost).toHaveBeenCalledTimes(2);
    expect(mockRecordCost.mock.calls[0][0].modelTier).toBe("tier2");
    expect(mockRecordCost.mock.calls[1][0].modelTier).toBe("tier3");
  });

  it("suppresses Tier 3 promotion when budget is below 50%", async () => {
    const packet = makePacket();
    mockBuildContext.mockResolvedValue(packet);

    // Tier 2 planner returns escalate
    const tier2Result = makePlannerResult("escalate");
    tier2Result.output.promotionReason = "complex multi-step task";
    mockRunPlanner.mockResolvedValue(tier2Result);

    // Budget is tight — should suppress Tier 3
    mockCheckBudget.mockResolvedValue({
      dailyLimitCents: 1000,
      spentCents: 600,
      remainingCents: 400,
      remainingPercent: 40,
    });

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    // Only one planner call (Tier 2 only, no promotion)
    expect(mockRunPlanner).toHaveBeenCalledOnce();
    expect(mockLogWrite).toHaveBeenCalledOnce();
    expect(mockLogWrite.mock.calls[0][0].status).toBe("blocked");
    expect(mockLogWrite.mock.calls[0][0].modelTier).toBe("tier2");
  });

  it("runs Tier 3 directly when batch.maxTier is 3 (rule-based promotion)", async () => {
    const packet = makePacket({ tokenBudget: { total: 100000, used: 8000, sections: { trigger: 300 } } });
    mockBuildContext.mockResolvedValue(packet);
    const tier3Result = makePlannerResult("act", { model: "claude-opus-4-20250514" });
    mockRunPlanner.mockResolvedValue(tier3Result);
    mockEvaluatePolicy.mockResolvedValue({
      actions: [
        {
          action: { actionType: "ticket.create", args: { title: "Bug" } },
          decision: "execute",
          reason: "high confidence",
        },
      ],
      plannerOutput: tier3Result.output,
    } as PolicyResult);

    // batch.maxTier = 3 → skip Tier 2, run Tier 3 directly
    await runPipeline({
      batch: makeBatch({ maxTier: 3 }),
      agentSettings,
      executor: mockExecutor,
    });

    // Only one planner call with Tier 3 model
    expect(mockRunPlanner).toHaveBeenCalledOnce();
    expect(mockRunPlanner.mock.calls[0][1]).toEqual({ model: "claude-opus-4-20250514" });
    // Context built with Tier 3 token budget
    expect(mockBuildContext.mock.calls[0][0]).toHaveProperty("tokenBudget");
    // Execution log records rule-based promotion
    expect(mockLogWrite).toHaveBeenCalledOnce();
    expect(mockLogWrite.mock.calls[0][0].modelTier).toBe("tier3");
    expect(mockLogWrite.mock.calls[0][0].promoted).toBe(true);
    expect(mockLogWrite.mock.calls[0][0].promotionReason).toBe("rule_based:router");
    // Cost recorded as tier3
    expect(mockRecordCost).toHaveBeenCalledWith(
      expect.objectContaining({ modelTier: "tier3" }),
    );
  });

  it("handles summarize disposition — triggers summary refresh", async () => {
    const packet = makePacket();
    mockBuildContext.mockResolvedValue(packet);
    mockRunPlanner.mockResolvedValue(makePlannerResult("summarize"));

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockRefreshSummary).toHaveBeenCalledWith("org-1", "channel", "ch-1");
    expect(mockEvaluatePolicy).not.toHaveBeenCalled();
    expect(mockLogWrite).toHaveBeenCalledOnce();
    expect(mockLogWrite.mock.calls[0][0].disposition).toBe("summarize");
    expect(mockLogWrite.mock.calls[0][0].status).toBe("succeeded");
    expect(mockMarkProcessed).toHaveBeenCalledOnce();
  });

  it("runs full pipeline for suggest disposition", async () => {
    const packet = makePacket();
    mockBuildContext.mockResolvedValue(packet);
    mockRunPlanner.mockResolvedValue(makePlannerResult("suggest"));
    mockEvaluatePolicy.mockResolvedValue({
      actions: [
        {
          action: { actionType: "ticket.create", args: { title: "Bug" } },
          decision: "suggest",
          reason: "confidence below act threshold",
        },
      ],
      plannerOutput: makePlannerResult("suggest").output,
    } as PolicyResult);

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockEvaluatePolicy).toHaveBeenCalledOnce();
    expect(mockCreateSuggestions).toHaveBeenCalledOnce();
    expect((mockExecutor.execute as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(mockLogWrite).toHaveBeenCalledOnce();
    expect(mockLogWrite.mock.calls[0][0].status).toBe("suggested");
    expect(mockRecordCost).toHaveBeenCalledOnce();
    expect(mockMarkProcessed).toHaveBeenCalledOnce();
  });

  it("runs full pipeline for act disposition with execute decision", async () => {
    const packet = makePacket();
    mockBuildContext.mockResolvedValue(packet);
    mockRunPlanner.mockResolvedValue(makePlannerResult("act"));
    mockEvaluatePolicy.mockResolvedValue({
      actions: [
        {
          action: { actionType: "ticket.create", args: { title: "Bug" } },
          decision: "execute",
          reason: "high confidence, low risk",
        },
      ],
      plannerOutput: makePlannerResult("act").output,
    } as PolicyResult);

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockEvaluatePolicy).toHaveBeenCalledOnce();
    expect((mockExecutor.execute as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect(mockCreateSuggestions).not.toHaveBeenCalled();
    expect(mockLogWrite).toHaveBeenCalledOnce();
    expect(mockLogWrite.mock.calls[0][0].status).toBe("succeeded");
  });

  it("records cost after planner call", async () => {
    const packet = makePacket();
    mockBuildContext.mockResolvedValue(packet);
    mockRunPlanner.mockResolvedValue(makePlannerResult("ignore"));

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockRecordCost).toHaveBeenCalledWith({
      organizationId: "org-1",
      modelTier: "tier2",
      costCents: expect.any(Number),
    });
  });

  it("records execution log with full decision chain", async () => {
    const packet = makePacket();
    mockBuildContext.mockResolvedValue(packet);
    mockRunPlanner.mockResolvedValue(makePlannerResult("act"));
    mockEvaluatePolicy.mockResolvedValue({
      actions: [
        {
          action: { actionType: "ticket.create", args: { title: "Bug" } },
          decision: "execute",
          reason: "ok",
        },
      ],
      plannerOutput: makePlannerResult("act").output,
    } as PolicyResult);

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockLogWrite).toHaveBeenCalledOnce();
    const logInput = mockLogWrite.mock.calls[0][0];
    expect(logInput).toMatchObject({
      organizationId: "org-1",
      triggerEventId: "evt-1",
      agentId: "agent-1",
      modelTier: "tier2",
      model: "claude-sonnet-test",
      inputTokens: 1000,
      outputTokens: 200,
      disposition: "act",
      confidence: 0.85,
      latencyMs: 500,
    });
    expect(logInput.plannedActions).toHaveLength(1);
    expect(logInput.finalActions).toHaveLength(1);
    expect(logInput.contextTokenAllocation).toEqual({ trigger: 200 });
  });

  it("handles policy engine dropping actions", async () => {
    const packet = makePacket();
    mockBuildContext.mockResolvedValue(packet);
    mockRunPlanner.mockResolvedValue(makePlannerResult("suggest"));
    mockEvaluatePolicy.mockResolvedValue({
      actions: [
        {
          action: { actionType: "ticket.create", args: { title: "Bug" } },
          decision: "drop",
          reason: "rate limited",
        },
      ],
      plannerOutput: makePlannerResult("suggest").output,
    } as PolicyResult);

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockCreateSuggestions).not.toHaveBeenCalled();
    expect((mockExecutor.execute as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(mockLogWrite).toHaveBeenCalledOnce();
    expect(mockLogWrite.mock.calls[0][0].status).toBe("dropped");
  });

  it("skips empty batches", async () => {
    const batch = makeBatch({ events: [] });

    await runPipeline({ batch, agentSettings, executor: mockExecutor });

    expect(mockBuildContext).not.toHaveBeenCalled();
  });

  it("survives context builder failure", async () => {
    mockBuildContext.mockRejectedValue(new Error("db connection lost"));

    await expect(
      runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor }),
    ).resolves.toBeUndefined();

    expect(mockRunPlanner).not.toHaveBeenCalled();
  });

  it("survives policy engine failure and still logs", async () => {
    const packet = makePacket();
    mockBuildContext.mockResolvedValue(packet);
    mockRunPlanner.mockResolvedValue(makePlannerResult("suggest"));
    mockEvaluatePolicy.mockRejectedValue(new Error("policy failure"));

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockLogWrite).toHaveBeenCalledOnce();
    expect(mockLogWrite.mock.calls[0][0].status).toBe("failed");
    expect(mockMarkProcessed).toHaveBeenCalledOnce();
  });
});
