/**
 * Conversation Agent Processor — handles agent-powered features for AI conversations.
 *
 * Implements auto-titling, branch label suggestions, ticket creation from conversations,
 * cross-entity linking, and suggested branches. Uses the agent observation pipeline
 * and respects the conversation's agentObservability level (OFF / SUGGEST / PARTICIPATE).
 *
 * Ticket: #22
 * Dependencies: #21 (Agent Conversation Observation), #14 (Branch Labels)
 */

import type { AgentObservability } from "@prisma/client";
import type { LLMAdapter, LLMAssistantContentBlock, LLMToolDefinition } from "@trace/shared";
import { createLLMAdapter } from "../lib/llm/index.js";
import { prisma } from "../lib/db.js";
import { aiConversationService } from "../services/aiConversation.js";
import { createSuggestion, type CreateSuggestionInput } from "./suggestion.js";
import type { PolicyActionResult } from "./policy-engine.js";
import type { PlannerOutput, ProposedAction } from "./planner.js";
import type { AgentContextPacket } from "./context-builder.js";
import type { AgentEvent } from "./router.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationAgentEvent {
  event: AgentEvent;
  conversationId: string;
  branchId?: string;
  organizationId: string;
}

interface ConversationContext {
  conversationId: string;
  organizationId: string;
  title: string | null;
  agentObservability: AgentObservability;
  createdById: string;
  branchId?: string;
  branchLabel?: string | null;
  turnCount: number;
  recentContent: string[];
}

// ---------------------------------------------------------------------------
// LLM adapter (lazy singleton)
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

let cachedAdapter: LLMAdapter | null = null;

function getAdapter(): LLMAdapter {
  if (cachedAdapter) return cachedAdapter;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY env var is required for conversation agent");
  }

  cachedAdapter = createLLMAdapter({ provider: "anthropic", apiKey });
  return cachedAdapter;
}

/** Visible for testing. */
export function setAdapterForTest(adapter: LLMAdapter | null): void {
  cachedAdapter = adapter;
}

// ---------------------------------------------------------------------------
// Title generation tool
// ---------------------------------------------------------------------------

const TITLE_TOOL: LLMToolDefinition = {
  name: "set_title",
  description: "Set the conversation title based on the content discussed so far.",
  inputSchema: {
    type: "object",
    required: ["title"],
    properties: {
      title: {
        type: "string",
        description:
          "A concise, descriptive title for the conversation (under 60 characters). " +
          "Not a question or sentence — a short label like a document title.",
      },
    },
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Branch label tool
// ---------------------------------------------------------------------------

const LABEL_TOOL: LLMToolDefinition = {
  name: "set_label",
  description: "Set a short label for this branch based on the content of the first turn.",
  inputSchema: {
    type: "object",
    required: ["label"],
    properties: {
      label: {
        type: "string",
        description: "A short 2-5 word label capturing the branch topic.",
      },
    },
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadConversationContext(
  conversationId: string,
  branchId?: string,
): Promise<ConversationContext | null> {
  const conversation = await prisma.aiConversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) return null;

  let branchLabel: string | null = null;
  let turnCount = 0;
  const recentContent: string[] = [];

  if (branchId) {
    const branch = await prisma.aiBranch.findUnique({
      where: { id: branchId },
      include: {
        turns: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { content: true, role: true },
        },
        _count: { select: { turns: true } },
      },
    });

    if (branch) {
      branchLabel = branch.label;
      turnCount = branch._count.turns;
      recentContent.push(
        ...branch.turns
          .reverse()
          .map((t: { role: string; content: string }) => `[${t.role}]: ${t.content}`),
      );
    }
  } else {
    // Load from root branch
    const rootBranch = conversation.rootBranchId
      ? await prisma.aiBranch.findUnique({
          where: { id: conversation.rootBranchId },
          include: {
            turns: {
              orderBy: { createdAt: "desc" },
              take: 10,
              select: { content: true, role: true },
            },
            _count: { select: { turns: true } },
          },
        })
      : null;

    if (rootBranch) {
      branchLabel = rootBranch.label;
      turnCount = rootBranch._count.turns;
      recentContent.push(
        ...rootBranch.turns
          .reverse()
          .map((t: { role: string; content: string }) => `[${t.role}]: ${t.content}`),
      );
    }
  }

  return {
    conversationId,
    organizationId: conversation.organizationId,
    title: conversation.title,
    agentObservability: conversation.agentObservability,
    createdById: conversation.createdById,
    branchId,
    branchLabel,
    turnCount,
    recentContent,
  };
}

// ---------------------------------------------------------------------------
// Auto-Title Generation
// ---------------------------------------------------------------------------

/**
 * Generate a title for a conversation that has no title after sufficient exchanges.
 * Respects observability level: SUGGEST creates an InboxItem, PARTICIPATE sets directly.
 */
export async function maybeAutoTitle(input: ConversationAgentEvent): Promise<void> {
  const ctx = await loadConversationContext(input.conversationId);
  if (!ctx) return;

  // Gate: OFF means no agent features
  if (ctx.agentObservability === "OFF") return;

  // Gate: already has a title
  if (ctx.title) return;

  // Gate: need at least 2 complete exchanges (4 turns: user, assistant, user, assistant)
  if (ctx.turnCount < 4) return;

  // Truncate content to avoid huge prompts
  const contentSnippet = ctx.recentContent.slice(0, 6).join("\n").slice(0, 2000);

  const adapter = getAdapter();
  const model = process.env.AGENT_CONVERSATION_MODEL ?? DEFAULT_MODEL;

  try {
    const response = await adapter.complete({
      model,
      system:
        "You generate concise titles for AI conversations. Produce a short, descriptive title " +
        "(under 60 characters) that captures the main topic. Not a question or full sentence — " +
        "a label like a document title. Call the set_title tool with your title.",
      messages: [
        {
          role: "user",
          content: `Generate a title for this conversation:\n\n${contentSnippet}`,
        },
      ],
      tools: [TITLE_TOOL],
      maxTokens: 256,
      temperature: 0,
    });

    const toolBlock = response.content.find(
      (b: LLMAssistantContentBlock) => b.type === "tool_use" && b.name === "set_title",
    );

    if (!toolBlock || toolBlock.type !== "tool_use") return;

    const rawTitle = (toolBlock.input as Record<string, unknown>).title;
    if (typeof rawTitle !== "string" || !rawTitle.trim()) return;
    const title = rawTitle.trim().slice(0, 80);

    if (ctx.agentObservability === "PARTICIPATE") {
      // Direct action: set the title
      await aiConversationService.updateTitle(
        { conversationId: ctx.conversationId, title },
        "agent",
        ctx.createdById,
      );
    } else {
      // SUGGEST mode: create a suggestion InboxItem
      const agentId = ctx.createdById; // agent acts on behalf of system
      const suggestionInput = buildSuggestionInput({
        actionType: "ai_conversation.set_title",
        args: { conversationId: ctx.conversationId, title },
        confidence: 0.85,
        rationaleSummary: `Auto-generated title after ${ctx.turnCount} turns: "${title}"`,
        userVisibleMessage: `Suggested title: "${title}"`,
        context: buildMinimalContext(input, ctx),
        agentId,
        userId: ctx.createdById,
      });
      await createSuggestion(suggestionInput);
    }
  } catch {
    // Silently fail — auto-titling is best-effort
  }
}

// ---------------------------------------------------------------------------
// Branch Label Suggestion
// ---------------------------------------------------------------------------

/**
 * Suggest a label for a branch that was created without one, after its first turn.
 */
export async function maybeSuggestBranchLabel(input: ConversationAgentEvent): Promise<void> {
  if (!input.branchId) return;

  const ctx = await loadConversationContext(input.conversationId, input.branchId);
  if (!ctx) return;

  if (ctx.agentObservability === "OFF") return;

  // Already has a label
  if (ctx.branchLabel && ctx.branchLabel !== "main") return;

  // For the root branch labeled "main", skip label suggestions
  const conversation = await prisma.aiConversation.findUnique({
    where: { id: input.conversationId },
    select: { rootBranchId: true },
  });
  if (conversation?.rootBranchId === input.branchId) return;

  // Need at least one turn to generate a label
  if (ctx.turnCount < 1) return;

  const contentSnippet = ctx.recentContent.slice(0, 3).join("\n").slice(0, 1000);
  const adapter = getAdapter();
  const model = process.env.AGENT_CONVERSATION_MODEL ?? DEFAULT_MODEL;

  try {
    const response = await adapter.complete({
      model,
      system:
        "Generate a short label (2-5 words) for a conversation branch based on its content. " +
        "The label should capture the topic succinctly. Call the set_label tool.",
      messages: [
        {
          role: "user",
          content: `Generate a branch label for:\n\n${contentSnippet}`,
        },
      ],
      tools: [LABEL_TOOL],
      maxTokens: 128,
      temperature: 0,
    });

    const toolBlock = response.content.find(
      (b: LLMAssistantContentBlock) => b.type === "tool_use" && b.name === "set_label",
    );

    if (!toolBlock || toolBlock.type !== "tool_use") return;

    const rawLabel = (toolBlock.input as Record<string, unknown>).label;
    if (typeof rawLabel !== "string" || !rawLabel.trim()) return;
    const label = rawLabel.trim().slice(0, 50);

    if (ctx.agentObservability === "PARTICIPATE") {
      await aiConversationService.labelBranch(
        { branchId: input.branchId, label },
        "agent",
        ctx.createdById,
      );
    } else {
      const suggestionInput = buildSuggestionInput({
        actionType: "branch.suggest_label",
        args: { branchId: input.branchId, label },
        confidence: 0.8,
        rationaleSummary: `Suggested branch label: "${label}"`,
        userVisibleMessage: `Suggested label for this branch: "${label}"`,
        context: buildMinimalContext(input, ctx),
        agentId: ctx.createdById,
        userId: ctx.createdById,
      });
      await createSuggestion(suggestionInput);
    }
  } catch {
    // Best-effort
  }
}

// ---------------------------------------------------------------------------
// Ticket Creation Detection
// ---------------------------------------------------------------------------

const DETECT_ACTIONABLE_TOOL: LLMToolDefinition = {
  name: "detect_actionable",
  description: "Analyze conversation for actionable content that should become a ticket.",
  inputSchema: {
    type: "object",
    required: ["shouldCreateTicket"],
    properties: {
      shouldCreateTicket: {
        type: "boolean",
        description: "Whether a ticket should be created from this conversation content.",
      },
      title: {
        type: "string",
        description: "Proposed ticket title if shouldCreateTicket is true.",
      },
      description: {
        type: "string",
        description: "Proposed ticket description with conversation context.",
      },
      priority: {
        type: "string",
        description: "Suggested priority: low, medium, high, or urgent.",
      },
    },
    additionalProperties: false,
  },
};

/**
 * Detect actionable content (bugs, decisions, tasks) and suggest ticket creation.
 */
export async function maybeCreateTicketFromConversation(
  input: ConversationAgentEvent,
): Promise<void> {
  const ctx = await loadConversationContext(input.conversationId, input.branchId);
  if (!ctx) return;

  if (ctx.agentObservability === "OFF") return;

  // Need enough content to detect actionable items
  if (ctx.turnCount < 4) return;

  const contentSnippet = ctx.recentContent.slice(0, 8).join("\n").slice(0, 3000);
  const adapter = getAdapter();
  const model = process.env.AGENT_CONVERSATION_MODEL ?? DEFAULT_MODEL;

  try {
    const response = await adapter.complete({
      model,
      system:
        "Analyze the conversation for bugs, decisions, tasks, or actionable insights that should be tracked as a ticket. " +
        "Only suggest a ticket if there is a clear, specific actionable item. Do NOT suggest tickets for general discussion. " +
        "Call the detect_actionable tool with your analysis.",
      messages: [
        {
          role: "user",
          content: `Analyze this conversation for actionable content:\n\n${contentSnippet}`,
        },
      ],
      tools: [DETECT_ACTIONABLE_TOOL],
      maxTokens: 512,
      temperature: 0,
    });

    const toolBlock = response.content.find(
      (b: LLMAssistantContentBlock) => b.type === "tool_use" && b.name === "detect_actionable",
    );

    if (!toolBlock || toolBlock.type !== "tool_use") return;

    const rawInput = toolBlock.input as Record<string, unknown>;
    if (!rawInput.shouldCreateTicket) return;

    const title = typeof rawInput.title === "string" ? rawInput.title : "Untitled ticket";
    const description =
      typeof rawInput.description === "string"
        ? rawInput.description
        : "Created from AI conversation";
    const priority =
      typeof rawInput.priority === "string" ? rawInput.priority : "medium";

    const args: Record<string, unknown> = {
      title,
      description: `${description}\n\n---\n_Created from AI conversation ${ctx.conversationId}_`,
      priority,
      conversationId: ctx.conversationId,
      branchId: ctx.branchId,
    };

    // Always suggest for ticket creation (medium risk)
    const suggestionInput = buildSuggestionInput({
      actionType: "ticket.create_from_conversation",
      args,
      confidence: 0.7,
      rationaleSummary: `Detected actionable content in conversation: "${title}"`,
      userVisibleMessage: `Create ticket: "${title}"`,
      context: buildMinimalContext(input, ctx),
      agentId: ctx.createdById,
      userId: ctx.createdById,
    });
    await createSuggestion(suggestionInput);
  } catch {
    // Best-effort
  }
}

// ---------------------------------------------------------------------------
// Cross-Entity Link Detection
// ---------------------------------------------------------------------------

const DETECT_LINKS_TOOL: LLMToolDefinition = {
  name: "detect_links",
  description: "Identify existing tickets or sessions referenced in the conversation.",
  inputSchema: {
    type: "object",
    required: ["references"],
    properties: {
      references: {
        type: "array",
        description: "Entity references found in the conversation.",
        items: {
          type: "object",
          required: ["entityType", "searchQuery"],
          properties: {
            entityType: {
              type: "string",
              description: "Type of entity referenced: 'ticket' or 'session'.",
            },
            searchQuery: {
              type: "string",
              description: "A search query to find the referenced entity by title or description.",
            },
          },
        },
      },
    },
    additionalProperties: false,
  },
};

/**
 * Detect references to existing tickets or sessions and suggest linking.
 */
export async function maybeDetectEntityLinks(input: ConversationAgentEvent): Promise<void> {
  const ctx = await loadConversationContext(input.conversationId, input.branchId);
  if (!ctx) return;

  if (ctx.agentObservability === "OFF") return;
  if (ctx.turnCount < 3) return;

  const contentSnippet = ctx.recentContent.slice(0, 6).join("\n").slice(0, 2000);
  const adapter = getAdapter();
  const model = process.env.AGENT_CONVERSATION_MODEL ?? DEFAULT_MODEL;

  try {
    const response = await adapter.complete({
      model,
      system:
        "Analyze the conversation for references to existing tickets, issues, bugs, or sessions. " +
        "Only report references when the conversation clearly mentions a specific known entity. " +
        "Do NOT fabricate references. If there are no clear references, return an empty array. " +
        "Call the detect_links tool.",
      messages: [
        {
          role: "user",
          content: `Find entity references in this conversation:\n\n${contentSnippet}`,
        },
      ],
      tools: [DETECT_LINKS_TOOL],
      maxTokens: 256,
      temperature: 0,
    });

    const toolBlock = response.content.find(
      (b: LLMAssistantContentBlock) => b.type === "tool_use" && b.name === "detect_links",
    );

    if (!toolBlock || toolBlock.type !== "tool_use") return;

    const rawInput = toolBlock.input as Record<string, unknown>;
    const references = Array.isArray(rawInput.references) ? rawInput.references : [];
    if (references.length === 0) return;

    // Check for existing linked entities
    const existingLinks = await prisma.aiConversationLinkedEntity.findMany({
      where: { conversationId: ctx.conversationId },
      select: { entityType: true, entityId: true },
    });
    const linkedSet = new Set(existingLinks.map((l) => `${l.entityType}:${l.entityId}`));

    for (const ref of references) {
      const refObj = ref as Record<string, unknown>;
      const entityType = refObj.entityType as string | undefined;
      const searchQuery = refObj.searchQuery as string | undefined;
      if (!entityType || !searchQuery) continue;

      if (entityType === "ticket") {
        // Search for matching tickets in the org
        const tickets = await prisma.ticket.findMany({
          where: {
            organizationId: ctx.organizationId,
            OR: [
              { title: { contains: searchQuery, mode: "insensitive" } },
              { description: { contains: searchQuery, mode: "insensitive" } },
            ],
          },
          take: 1,
          select: { id: true, title: true },
        });

        if (tickets.length === 0) continue;
        const ticket = tickets[0];
        if (linkedSet.has(`ticket:${ticket.id}`)) continue;

        if (ctx.agentObservability === "PARTICIPATE") {
          try {
            await aiConversationService.linkEntity(
              {
                conversationId: ctx.conversationId,
                entityType: "ticket",
                entityId: ticket.id,
              },
              "agent",
              ctx.createdById,
            );
          } catch {
            // May already be linked
          }
        } else {
          const suggestionInput = buildSuggestionInput({
            actionType: "ai_conversation.link_entity",
            args: {
              conversationId: ctx.conversationId,
              entityType: "ticket",
              entityId: ticket.id,
            },
            confidence: 0.7,
            rationaleSummary: `Detected reference to ticket: "${ticket.title}"`,
            userVisibleMessage: `Link to ticket: "${ticket.title}"?`,
            context: buildMinimalContext(input, ctx),
            agentId: ctx.createdById,
            userId: ctx.createdById,
          });
          await createSuggestion(suggestionInput);
        }
      }
    }
  } catch {
    // Best-effort
  }
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Process an AI conversation event through all agent features.
 * Called by the event pipeline when an ai_conversation-scoped event is routed.
 */
export async function processConversationEvent(input: ConversationAgentEvent): Promise<void> {
  const conversation = await prisma.aiConversation.findUnique({
    where: { id: input.conversationId },
    select: { agentObservability: true },
  });

  if (!conversation || conversation.agentObservability === "OFF") return;

  const eventType = input.event.eventType;

  // Run features in parallel where possible
  if (eventType === "ai_turn_created") {
    await Promise.allSettled([
      maybeAutoTitle(input),
      maybeSuggestBranchLabel(input),
      maybeCreateTicketFromConversation(input),
      maybeDetectEntityLinks(input),
    ]);
  } else if (eventType === "ai_branch_created") {
    // A new branch was created — check if we should suggest a label after first turn
    await Promise.allSettled([maybeSuggestBranchLabel(input)]);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildMinimalContext(
  input: ConversationAgentEvent,
  ctx: ConversationContext,
): AgentContextPacket {
  return {
    organizationId: ctx.organizationId,
    scopeKey: `ai_conversation:${ctx.conversationId}`,
    scopeType: "ai_conversation",
    scopeId: ctx.conversationId,
    triggerEvent: input.event,
    eventBatch: [input.event],
    soulFile: "",
    scopeEntity: null,
    relevantEntities: [],
    recentEvents: [],
    summaries: [],
    actors: [],
    permissions: {
      autonomyMode: ctx.agentObservability === "PARTICIPATE" ? "act" : "suggest",
      actions: [],
    },
    tokenBudget: { total: 0, used: 0, sections: {} },
  };
}

function buildSuggestionInput(params: {
  actionType: string;
  args: Record<string, unknown>;
  confidence: number;
  rationaleSummary: string;
  userVisibleMessage: string;
  context: AgentContextPacket;
  agentId: string;
  userId: string;
}): CreateSuggestionInput {
  const proposedAction: ProposedAction = {
    actionType: params.actionType,
    args: params.args,
  };

  const plannerOutput: PlannerOutput = {
    disposition: "suggest",
    confidence: params.confidence,
    rationaleSummary: params.rationaleSummary,
    proposedActions: [proposedAction],
    userVisibleMessage: params.userVisibleMessage,
  };

  const policyResult: PolicyActionResult = {
    action: proposedAction,
    decision: "suggest",
    reason: "conversation_agent_feature",
  };

  return {
    policyResult,
    plannerOutput,
    context: params.context,
    agentId: params.agentId,
    userId: params.userId,
  };
}
