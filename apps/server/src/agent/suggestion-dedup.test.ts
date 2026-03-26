import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  levenshteinDistance,
  titleSimilarity,
  createSuggestion,
  type CreateSuggestionInput,
} from "./suggestion.js";
import type { PolicyActionResult } from "./policy-engine.js";
import type { PlannerOutput } from "./planner.js";
import type { AgentContextPacket } from "./context-builder.js";

// ---------------------------------------------------------------------------
// Mock inbox service
// ---------------------------------------------------------------------------

const mockCreateItem = vi.fn().mockResolvedValue({ id: "inbox-1" });
const mockFindActiveSuggestionsByScope = vi.fn().mockResolvedValue([]);

vi.mock("../services/inbox.js", () => ({
  inboxService: {
    createItem: (...args: unknown[]) => mockCreateItem(...args),
    findActiveSuggestionsByScope: (...args: unknown[]) =>
      mockFindActiveSuggestionsByScope(...args),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<CreateSuggestionInput> = {}): CreateSuggestionInput {
  const policyResult: PolicyActionResult = {
    action: { actionType: "ticket.create", args: { title: "Login timeout bug" } },
    decision: "suggest",
    reason: "test",
  };

  const plannerOutput: PlannerOutput = {
    disposition: "suggest",
    confidence: 0.8,
    rationaleSummary: "Users are discussing a login timeout issue",
    proposedActions: [policyResult.action],
    userVisibleMessage: "Suggested ticket: Login timeout bug",
  };

  const context = {
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
      timestamp: "2026-03-26T00:00:00.000Z",
    },
    eventBatch: [],
    soulFile: "",
    scopeEntity: null,
    relevantEntities: [],
    recentEvents: [],
    summaries: [],
    actors: [],
    permissions: { autonomyMode: "suggest", actions: [] },
    tokenBudget: { total: 8000, used: 0, sections: {} },
  } as AgentContextPacket;

  return {
    policyResult,
    plannerOutput,
    context,
    agentId: "agent-1",
    userId: "user-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockCreateItem.mockClear();
  mockFindActiveSuggestionsByScope.mockReset().mockResolvedValue([]);
});

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
  });

  it("returns length of non-empty string when other is empty", () => {
    expect(levenshteinDistance("hello", "")).toBe(5);
    expect(levenshteinDistance("", "world")).toBe(5);
  });

  it("computes distance for single character difference", () => {
    expect(levenshteinDistance("cat", "bat")).toBe(1);
  });

  it("computes distance for insertions and deletions", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });
});

describe("titleSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(titleSimilarity("Login timeout bug", "Login timeout bug")).toBe(1);
  });

  it("returns 1 for case-insensitive match", () => {
    expect(titleSimilarity("Login Timeout Bug", "login timeout bug")).toBe(1);
  });

  it("returns high similarity for minor differences", () => {
    const sim = titleSimilarity("Login timeout bug", "Login timeout issue");
    expect(sim).toBeGreaterThan(0.7);
  });

  it("returns low similarity for completely different strings", () => {
    const sim = titleSimilarity("Login timeout bug", "Deploy pipeline failure");
    expect(sim).toBeLessThan(0.4);
  });
});

describe("semantic deduplication in createSuggestion", () => {
  it("creates suggestion when no existing duplicates", async () => {
    mockFindActiveSuggestionsByScope.mockResolvedValue([]);

    const result = await createSuggestion(makeInput());
    expect(result).toEqual({ id: "inbox-1" });
    expect(mockCreateItem).toHaveBeenCalledOnce();
  });

  it("suppresses duplicate when existing similar suggestion found", async () => {
    mockFindActiveSuggestionsByScope.mockResolvedValue([
      { id: "existing-1", title: "Suggested ticket: Login timeout issue", itemType: "ticket_suggestion" },
    ]);

    const result = await createSuggestion(makeInput());
    expect(result).toBeNull();
    expect(mockCreateItem).not.toHaveBeenCalled();
  });

  it("allows suggestion when existing titles are dissimilar", async () => {
    mockFindActiveSuggestionsByScope.mockResolvedValue([
      { id: "existing-1", title: "Deploy pipeline failure", itemType: "ticket_suggestion" },
    ]);

    const result = await createSuggestion(makeInput());
    expect(result).toEqual({ id: "inbox-1" });
    expect(mockCreateItem).toHaveBeenCalledOnce();
  });

  it("queries for the correct scope and itemType", async () => {
    await createSuggestion(makeInput());

    expect(mockFindActiveSuggestionsByScope).toHaveBeenCalledWith({
      orgId: "org-1",
      scopeType: "channel",
      scopeId: "chan-1",
      itemType: "ticket_suggestion",
    });
  });
});
