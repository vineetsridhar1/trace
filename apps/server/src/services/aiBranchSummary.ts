import type { AiTurn, Prisma } from "@prisma/client";
import type { ActorType } from "@trace/gql";
import type { LLMAssistantContentBlock, LLMMessage } from "@trace/shared";
import { prisma } from "../lib/db.js";
import { aiService } from "./ai.js";
import { eventService } from "./event.js";
import { pubsub, topics } from "../lib/pubsub.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Trigger auto-summarization when a branch exceeds this many unsummarized turns */
const SUMMARIZE_THRESHOLD = 40;

/** When summarizing, summarize the oldest half of unsummarized turns */
const SUMMARIZE_RATIO = 0.5;

/** Haiku-class model for cost-efficient summarization */
const SUMMARIZATION_MODEL =
  process.env.AI_BRANCH_SUMMARY_MODEL ?? "claude-haiku-4-5-20251001";

/** Simple token estimation: ~4 chars per token */
const CHARS_PER_TOKEN = 4;

/** Default context budget (200k tokens) */
const DEFAULT_CONTEXT_BUDGET = 200_000;

/** Budget allocation across ancestor levels (current → deepest) */
const BUDGET_ALLOCATION = [0.6, 0.2, 0.12, 0.06, 0.02] as const;

/** Trigger auto-summarization of ancestors when context health exceeds this */
const AUTO_SUMMARIZE_HEALTH_THRESHOLD = 0.7;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextHealthInfo {
  tokenUsage: number;
  budgetTotal: number;
  percentage: number;
}

interface AncestorLevel {
  branchId: string;
  turns: AiTurn[];
  summary: string | null;
  depth: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AiBranchSummaryService {
  /**
   * Summarizes the oldest unsummarized turns in a branch using an LLM.
   * Marks those turns as summarized and stores the summary.
   */
  async summarizeBranch(input: {
    branchId: string;
    organizationId: string;
    userId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const { branchId, organizationId, userId, actorType, actorId } = input;

    // Get unsummarized turns in chronological order
    const unsummarizedTurns = await prisma.aiTurn.findMany({
      where: { branchId, summarized: false },
      orderBy: { createdAt: "asc" },
    });

    if (unsummarizedTurns.length < 2) {
      throw new Error("Not enough turns to summarize");
    }

    // Summarize the oldest half
    const countToSummarize = Math.max(
      2,
      Math.floor(unsummarizedTurns.length * SUMMARIZE_RATIO),
    );
    const turnsToSummarize = unsummarizedTurns.slice(0, countToSummarize);
    const lastSummarizedTurn = turnsToSummarize[turnsToSummarize.length - 1];

    // Get existing summary for context
    const existingSummary = await prisma.aiBranchSummary.findFirst({
      where: { branchId },
      orderBy: { createdAt: "desc" },
    });

    // Build LLM prompt
    const summaryContent = await this.generateSummary({
      turns: turnsToSummarize,
      existingSummary: existingSummary?.content ?? null,
      organizationId,
      userId,
    });

    // Persist in transaction
    const totalSummarizedCount =
      (existingSummary?.summarizedTurnCount ?? 0) + countToSummarize;

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Mark turns as summarized
      await tx.aiTurn.updateMany({
        where: {
          id: { in: turnsToSummarize.map((t) => t.id) },
        },
        data: { summarized: true },
      });

      // Create new summary
      const summary = await tx.aiBranchSummary.create({
        data: {
          branchId,
          content: summaryContent,
          summarizedTurnCount: totalSummarizedCount,
          summarizedUpToTurnId: lastSummarizedTurn.id,
        },
      });

      return summary;
    });

    // Get conversationId for events
    const branch = await prisma.aiBranch.findUniqueOrThrow({
      where: { id: branchId },
    });

    // Emit event
    await eventService.create({
      organizationId,
      scopeType: "ai_conversation",
      scopeId: branch.conversationId,
      eventType: "ai_branch_summary_updated",
      payload: {
        summaryId: result.id,
        branchId,
        conversationId: branch.conversationId,
        content: summaryContent,
        summarizedTurnCount: totalSummarizedCount,
        summarizedUpToTurnId: lastSummarizedTurn.id,
        createdAt: result.createdAt.toISOString(),
      },
      actorType,
      actorId,
    });

    // Publish to conversation subscription
    pubsub.publish(topics.conversationEvents(branch.conversationId), {
      conversationEvents: {
        conversationId: branch.conversationId,
        type: "ai_branch_summary_updated",
        payload: {
          summaryId: result.id,
          branchId,
          conversationId: branch.conversationId,
          content: summaryContent,
          summarizedTurnCount: totalSummarizedCount,
          summarizedUpToTurnId: lastSummarizedTurn.id,
          createdAt: result.createdAt.toISOString(),
        },
        timestamp: new Date().toISOString(),
      },
    });

    return result;
  }

  /**
   * Returns the latest summary for a branch, or null.
   */
  async getLatestSummary(branchId: string) {
    return prisma.aiBranchSummary.findFirst({
      where: { branchId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Estimates token count from text using chars/4 heuristic.
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Computes context health for a branch, accounting for ancestor context.
   */
  async getContextHealth(input: {
    branchId: string;
    contextBudget?: number;
  }): Promise<ContextHealthInfo> {
    const budgetTotal = input.contextBudget ?? DEFAULT_CONTEXT_BUDGET;
    const levels = await this.collectAncestorLevels(input.branchId);

    let totalTokens = 0;
    for (const level of levels) {
      if (level.summary) {
        totalTokens += this.estimateTokens(level.summary);
      }
      for (const turn of level.turns) {
        if (!turn.summarized) {
          totalTokens += this.estimateTokens(turn.content);
        }
      }
    }

    return {
      tokenUsage: totalTokens,
      budgetTotal,
      percentage: Math.min(1, totalTokens / budgetTotal),
    };
  }

  /**
   * Builds LLM context messages for a branch, respecting token budgets
   * across ancestor levels and using summaries where available.
   */
  async buildContextWithBudget(input: {
    branchId: string;
    contextBudget?: number;
  }): Promise<{ messages: LLMMessage[]; health: ContextHealthInfo }> {
    const budgetTotal = input.contextBudget ?? DEFAULT_CONTEXT_BUDGET;
    const levels = await this.collectAncestorLevels(input.branchId);

    const messages: LLMMessage[] = [];
    let totalTokens = 0;

    // Allocate budget across levels (current branch first in array)
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const allocationIndex = Math.min(i, BUDGET_ALLOCATION.length - 1);
      const levelBudget = Math.floor(budgetTotal * BUDGET_ALLOCATION[allocationIndex]);

      let levelTokens = 0;

      // If there's a summary, prepend it as system context
      if (level.summary) {
        const summaryTokens = this.estimateTokens(level.summary);
        if (levelTokens + summaryTokens <= levelBudget) {
          messages.push({
            role: "user",
            content: `[Summary of earlier conversation${level.depth > 0 ? ` (ancestor branch, depth ${level.depth})` : ""}]: ${level.summary}`,
          });
          messages.push({
            role: "assistant",
            content: "Understood, I have the context from the summarized conversation.",
          });
          levelTokens += summaryTokens;
        }
      }

      // Add unsummarized turns within budget
      const unsummarizedTurns = level.turns.filter((t) => !t.summarized);
      for (const turn of unsummarizedTurns) {
        const turnTokens = this.estimateTokens(turn.content);
        if (levelTokens + turnTokens > levelBudget) {
          break; // Exceeds this level's budget
        }
        messages.push({
          role: turn.role === "USER" ? "user" : "assistant",
          content: turn.content,
        });
        levelTokens += turnTokens;
      }

      totalTokens += levelTokens;
    }

    return {
      messages,
      health: {
        tokenUsage: totalTokens,
        budgetTotal,
        percentage: Math.min(1, totalTokens / budgetTotal),
      },
    };
  }

  /**
   * Checks if auto-summarization should be triggered for a branch.
   * Called after each turn is created.
   */
  async maybeAutoSummarize(input: {
    branchId: string;
    organizationId: string;
    userId: string;
    actorType: ActorType;
    actorId: string;
  }): Promise<void> {
    const unsummarizedCount = await prisma.aiTurn.count({
      where: { branchId: input.branchId, summarized: false },
    });

    // Summarize current branch if threshold exceeded
    if (unsummarizedCount >= SUMMARIZE_THRESHOLD) {
      await this.summarizeBranch(input);
    }

    // Check context health and summarize ancestors if needed
    const health = await this.getContextHealth({ branchId: input.branchId });
    if (health.percentage >= AUTO_SUMMARIZE_HEALTH_THRESHOLD) {
      await this.summarizeAncestorsIfNeeded(input);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Collects ancestor branch levels from current branch up to root.
   * Returns array with current branch at index 0.
   */
  private async collectAncestorLevels(branchId: string): Promise<AncestorLevel[]> {
    const levels: AncestorLevel[] = [];
    let currentBranchId: string | null = branchId;
    let depth = 0;

    while (currentBranchId) {
      const branchWithTurns: { id: string; parentBranchId: string | null; turns: AiTurn[] } =
        await prisma.aiBranch.findUniqueOrThrow({
          where: { id: currentBranchId },
          include: {
            turns: { orderBy: { createdAt: "asc" as const } },
          },
        });

      const summary = await this.getLatestSummary(currentBranchId);

      // For child branches, only include turns up to and including the fork point
      let turns: AiTurn[] = branchWithTurns.turns;
      if (depth > 0 && levels.length > 0) {
        // Find the fork turn of the child branch
        const childBranch: { forkTurnId: string | null } = await prisma.aiBranch.findUniqueOrThrow({
          where: { id: levels[levels.length - 1].branchId },
        });
        if (childBranch.forkTurnId) {
          const forkIndex = turns.findIndex((t: AiTurn) => t.id === childBranch.forkTurnId);
          if (forkIndex >= 0) {
            turns = turns.slice(0, forkIndex + 1);
          }
        }
      }

      levels.push({
        branchId: currentBranchId,
        turns,
        summary: summary?.content ?? null,
        depth,
      });

      currentBranchId = branchWithTurns.parentBranchId;
      depth++;
    }

    return levels;
  }

  /**
   * Summarizes ancestor branches that have many unsummarized turns.
   */
  private async summarizeAncestorsIfNeeded(input: {
    branchId: string;
    organizationId: string;
    userId: string;
    actorType: ActorType;
    actorId: string;
  }): Promise<void> {
    let currentBranchId: string | null = input.branchId;

    // Walk up the branch tree
    while (currentBranchId) {
      const ancestorBranch: { parentBranchId: string | null } =
        await prisma.aiBranch.findUniqueOrThrow({
          where: { id: currentBranchId },
        });

      if (!ancestorBranch.parentBranchId) break;

      const parentUnsummarized = await prisma.aiTurn.count({
        where: { branchId: ancestorBranch.parentBranchId, summarized: false },
      });

      if (parentUnsummarized >= Math.floor(SUMMARIZE_THRESHOLD / 2)) {
        try {
          await this.summarizeBranch({
            ...input,
            branchId: ancestorBranch.parentBranchId,
          });
        } catch {
          // Don't fail the main operation if ancestor summarization fails
          break;
        }
      }

      currentBranchId = ancestorBranch.parentBranchId;
    }
  }

  /**
   * Calls the LLM to generate a summary of the given turns.
   */
  private async generateSummary(input: {
    turns: AiTurn[];
    existingSummary: string | null;
    organizationId: string;
    userId: string;
  }): Promise<string> {
    const { turns, existingSummary, organizationId, userId } = input;

    const turnText = turns
      .map((t) => `${t.role === "USER" ? "User" : "Assistant"}: ${t.content}`)
      .join("\n\n");

    const systemPrompt = `You are a summarizer. Produce a concise summary of the conversation below.
Preserve:
- Key decisions made
- Important facts and context
- Open threads and pending questions
- Technical details that may be needed later

${existingSummary ? `Previous summary of earlier turns:\n${existingSummary}\n\nNow summarize the following additional turns, incorporating the previous context:` : "Summarize the following conversation turns:"}`;

    const messages: LLMMessage[] = [
      { role: "user", content: `${systemPrompt}\n\n---\n\n${turnText}` },
    ];

    const response = await aiService.complete({
      organizationId,
      userId,
      model: SUMMARIZATION_MODEL,
      messages,
      maxTokens: 2048,
      temperature: 0.3,
    });

    const text = response.content
      .filter((block: LLMAssistantContentBlock) => block.type === "text")
      .map((block: LLMAssistantContentBlock) => (block.type === "text" ? block.text : ""))
      .join("");

    return text;
  }
}

export const aiBranchSummaryService = new AiBranchSummaryService();
