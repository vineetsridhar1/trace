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
}));

vi.mock("./planner.js", () => ({
  runPlanner: vi.fn(),
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
  costTrackingService: { recordCost: vi.fn().mockResolvedValue({}) },
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

  it("handles escalate disposition — logs as blocked", async () => {
    const packet = makePacket();
    mockBuildContext.mockResolvedValue(packet);
    const plannerResult = makePlannerResult("escalate");
    plannerResult.output.promotionReason = "complex multi-step task";
    mockRunPlanner.mockResolvedValue(plannerResult);

    await runPipeline({ batch: makeBatch(), agentSettings, executor: mockExecutor });

    expect(mockEvaluatePolicy).not.toHaveBeenCalled();
    expect(mockLogWrite).toHaveBeenCalledOnce();
    expect(mockLogWrite.mock.calls[0][0].disposition).toBe("escalate");
    expect(mockLogWrite.mock.calls[0][0].status).toBe("blocked");
    expect(mockMarkProcessed).toHaveBeenCalledOnce();
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
