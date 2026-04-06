import type { AiTurn, Prisma } from "@prisma/client";
import type { ActorType } from "@trace/gql";
import type { LLMAssistantContentBlock, LLMMessage, LLMStreamEvent } from "@trace/shared";
import { prisma } from "../lib/db.js";
import { aiService } from "./ai.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { eventService } from "./event.js";
import { aiBranchSummaryService } from "./aiBranchSummary.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";

export class AiTurnService {
  /**
   * Sends a user turn, calls the LLM with the full branch context,
   * and stores the assistant response. Returns both turns.
   */
  async sendTurn(
    input: {
      branchId: string;
      content: string;
      model?: string;
      clientMutationId?: string;
    },
    actorType: ActorType,
    actorId: string,
  ): Promise<{ userTurn: AiTurn; assistantTurn: AiTurn }> {
    // Load the branch and verify access to the conversation
    const branch = await prisma.aiBranch.findUniqueOrThrow({
      where: { id: input.branchId },
      include: {
        conversation: true,
      },
    });

    const model = input.model ?? branch.conversation.modelId ?? DEFAULT_MODEL;
    const system = branch.conversation.systemPrompt ?? undefined;

    // Verify user belongs to org
    await prisma.orgMember.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: actorId,
          organizationId: branch.conversation.organizationId,
        },
      },
    });

    // Only the conversation creator can send turns (even for ORG-visible conversations)
    if (branch.conversation.createdById !== actorId) {
      throw new Error(
        branch.conversation.visibility === "PRIVATE"
          ? "Conversation not found"
          : "Only the conversation creator can send messages",
      );
    }

    // Get the last turn in the branch to set parentTurnId
    const lastTurn = await prisma.aiTurn.findFirst({
      where: { branchId: input.branchId },
      orderBy: { createdAt: "desc" },
    });

    // Create user turn
    const userTurn = await prisma.aiTurn.create({
      data: {
        branchId: input.branchId,
        role: "USER",
        content: input.content,
        parentTurnId: lastTurn?.id ?? null,
      },
    });

    // Assemble context with budget-aware context builder
    const { messages } = await aiBranchSummaryService.buildContextWithBudget({
      branchId: input.branchId,
    });

    // Call LLM
    let assistantContent: string;
    try {
      const response = await aiService.complete({
        organizationId: branch.conversation.organizationId,
        userId: actorId,
        model,
        messages,
        system,
      });

      // Extract text content from response
      assistantContent = response.content
        .filter((block: LLMAssistantContentBlock) => block.type === "text")
        .map((block: LLMAssistantContentBlock) => (block.type === "text" ? block.text : ""))
        .join("");
    } catch (error) {
      // On LLM failure, delete the user turn so we don't leave orphans
      await prisma.aiTurn.delete({ where: { id: userTurn.id } });
      throw error;
    }

    // Create assistant turn and update conversation.updatedAt atomically
    const assistantTurn = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const turn = await tx.aiTurn.create({
        data: {
          branchId: input.branchId,
          role: "ASSISTANT",
          content: assistantContent,
          parentTurnId: userTurn.id,
        },
      });

      await tx.aiConversation.update({
        where: { id: branch.conversationId },
        data: { updatedAt: new Date() },
      });

      return turn;
    });

    // Persist turn events and broadcast to org-wide stream
    const organizationId = branch.conversation.organizationId;
    const conversationId = branch.conversationId;

    await eventService.create({
      organizationId,
      scopeType: "ai_conversation",
      scopeId: conversationId,
      eventType: "ai_turn_created",
      payload: {
        turnId: userTurn.id,
        branchId: input.branchId,
        conversationId,
        role: userTurn.role,
        content: userTurn.content,
        parentTurnId: userTurn.parentTurnId,
        createdAt: userTurn.createdAt.toISOString(),
        ...(input.clientMutationId ? { clientMutationId: input.clientMutationId } : {}),
      },
      actorType,
      actorId,
    });

    await eventService.create({
      organizationId,
      scopeType: "ai_conversation",
      scopeId: conversationId,
      eventType: "ai_turn_created",
      payload: {
        turnId: assistantTurn.id,
        branchId: input.branchId,
        conversationId,
        role: assistantTurn.role,
        content: assistantTurn.content,
        parentTurnId: assistantTurn.parentTurnId,
        createdAt: assistantTurn.createdAt.toISOString(),
      },
      actorType,
      actorId,
    });

    // Publish to branchTurns subscription topic
    pubsub.publish(topics.branchTurns(input.branchId), {
      branchTurns: userTurn,
    });
    pubsub.publish(topics.branchTurns(input.branchId), {
      branchTurns: assistantTurn,
    });

    // Publish to conversation-level subscription
    pubsub.publish(topics.conversationEvents(conversationId), {
      conversationEvents: {
        conversationId,
        type: "ai_turn_created",
        payload: {
          turnId: assistantTurn.id,
          branchId: input.branchId,
          conversationId,
          role: assistantTurn.role,
          content: assistantTurn.content,
          parentTurnId: assistantTurn.parentTurnId,
          createdAt: assistantTurn.createdAt.toISOString(),
        },
        timestamp: new Date().toISOString(),
      },
    });

    // Trigger auto-summarization in the background (non-blocking)
    aiBranchSummaryService
      .maybeAutoSummarize({
        branchId: input.branchId,
        organizationId,
        userId: actorId,
        actorType,
        actorId,
      })
      .catch((err) => {
        console.error("[aiTurn] auto-summarize failed:", err);
      });

    return { userTurn, assistantTurn };
  }

  /**
   * Creates a single assistant turn without invoking the LLM.
   * Used by agent-powered participation features that need to surface
   * guidance or suggestions directly in the conversation.
   */
  async postAssistantTurn(
    input: {
      branchId: string;
      content: string;
      parentTurnId?: string | null;
    },
    actorType: ActorType,
    actorId: string,
  ): Promise<AiTurn> {
    const branch = await prisma.aiBranch.findUniqueOrThrow({
      where: { id: input.branchId },
      include: { conversation: true },
    });

    await prisma.orgMember.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: actorId,
          organizationId: branch.conversation.organizationId,
        },
      },
    });

    if (actorType === "agent") {
      if (branch.conversation.agentObservability !== "PARTICIPATE") {
        throw new Error("Agent participation is disabled for this conversation");
      }
    } else if (branch.conversation.createdById !== actorId) {
      throw new Error(
        branch.conversation.visibility === "PRIVATE"
          ? "Conversation not found"
          : "Only the conversation creator can send messages",
      );
    }

    const lastTurn = await prisma.aiTurn.findFirst({
      where: { branchId: input.branchId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    const assistantTurn = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const turn = await tx.aiTurn.create({
        data: {
          branchId: input.branchId,
          role: "ASSISTANT",
          content: input.content,
          parentTurnId: input.parentTurnId ?? lastTurn?.id ?? null,
        },
      });

      await tx.aiConversation.update({
        where: { id: branch.conversationId },
        data: { updatedAt: new Date() },
      });

      return turn;
    });

    const organizationId = branch.conversation.organizationId;
    const conversationId = branch.conversationId;
    const payload = {
      turnId: assistantTurn.id,
      branchId: input.branchId,
      conversationId,
      role: assistantTurn.role,
      content: assistantTurn.content,
      parentTurnId: assistantTurn.parentTurnId,
      createdAt: assistantTurn.createdAt.toISOString(),
    };

    await eventService.create({
      organizationId,
      scopeType: "ai_conversation",
      scopeId: conversationId,
      eventType: "ai_turn_created",
      payload,
      actorType,
      actorId,
    });

    pubsub.publish(topics.branchTurns(input.branchId), {
      branchTurns: assistantTurn,
    });

    pubsub.publish(topics.conversationEvents(conversationId), {
      conversationEvents: {
        conversationId,
        type: "ai_turn_created",
        payload,
        timestamp: new Date().toISOString(),
      },
    });

    aiBranchSummaryService
      .maybeAutoSummarize({
        branchId: input.branchId,
        organizationId,
        userId: actorId,
        actorType,
        actorId,
      })
      .catch((err) => {
        console.error("[aiTurn] auto-summarize failed:", err);
      });

    return assistantTurn;
  }

  /**
   * Streams a user turn response from the LLM. Creates the user turn
   * immediately, yields stream events, then creates the assistant turn
   * after the stream completes.
   */
  async *streamTurn(
    input: {
      branchId: string;
      content: string;
      model?: string;
    },
    actorType: ActorType,
    actorId: string,
  ): AsyncGenerator<
    LLMStreamEvent | { type: "user_turn_created"; turn: AiTurn },
    AiTurn | undefined
  > {
    // Load the branch and verify access
    const branch = await prisma.aiBranch.findUniqueOrThrow({
      where: { id: input.branchId },
      include: { conversation: true },
    });

    const model = input.model ?? branch.conversation.modelId ?? DEFAULT_MODEL;
    const system = branch.conversation.systemPrompt ?? undefined;

    await prisma.orgMember.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: actorId,
          organizationId: branch.conversation.organizationId,
        },
      },
    });

    // Only the conversation creator can send turns (even for ORG-visible conversations)
    if (branch.conversation.createdById !== actorId) {
      throw new Error(
        branch.conversation.visibility === "PRIVATE"
          ? "Conversation not found"
          : "Only the conversation creator can send messages",
      );
    }

    const lastTurn = await prisma.aiTurn.findFirst({
      where: { branchId: input.branchId },
      orderBy: { createdAt: "desc" },
    });

    const userTurn = await prisma.aiTurn.create({
      data: {
        branchId: input.branchId,
        role: "USER",
        content: input.content,
        parentTurnId: lastTurn?.id ?? null,
      },
    });

    yield { type: "user_turn_created" as const, turn: userTurn };

    // Assemble context with budget-aware context builder
    const { messages } = await aiBranchSummaryService.buildContextWithBudget({
      branchId: input.branchId,
    });

    // Stream from LLM
    let fullText = "";
    try {
      for await (const event of aiService.stream({
        organizationId: branch.conversation.organizationId,
        userId: actorId,
        model,
        messages,
        system,
      })) {
        if (event.type === "text_delta") {
          fullText += event.text;
        }
        yield event;
      }
    } catch (error) {
      // Clean up user turn on failure
      await prisma.aiTurn.delete({ where: { id: userTurn.id } });
      throw error;
    }

    if (!fullText) {
      // No content received — clean up
      await prisma.aiTurn.delete({ where: { id: userTurn.id } });
      return undefined;
    }

    // Create assistant turn
    const assistantTurn = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const turn = await tx.aiTurn.create({
        data: {
          branchId: input.branchId,
          role: "ASSISTANT",
          content: fullText,
          parentTurnId: userTurn.id,
        },
      });

      await tx.aiConversation.update({
        where: { id: branch.conversationId },
        data: { updatedAt: new Date() },
      });

      return turn;
    });

    // Persist turn events and broadcast to org-wide stream
    const organizationId = branch.conversation.organizationId;
    const conversationId = branch.conversationId;

    await eventService.create({
      organizationId,
      scopeType: "ai_conversation",
      scopeId: conversationId,
      eventType: "ai_turn_created",
      payload: {
        turnId: userTurn.id,
        branchId: input.branchId,
        conversationId,
        role: userTurn.role,
        content: userTurn.content,
        parentTurnId: userTurn.parentTurnId,
        createdAt: userTurn.createdAt.toISOString(),
      },
      actorType,
      actorId,
    });

    await eventService.create({
      organizationId,
      scopeType: "ai_conversation",
      scopeId: conversationId,
      eventType: "ai_turn_created",
      payload: {
        turnId: assistantTurn.id,
        branchId: input.branchId,
        conversationId,
        role: assistantTurn.role,
        content: assistantTurn.content,
        parentTurnId: assistantTurn.parentTurnId,
        createdAt: assistantTurn.createdAt.toISOString(),
      },
      actorType,
      actorId,
    });

    // Publish to branchTurns subscription topic
    pubsub.publish(topics.branchTurns(input.branchId), {
      branchTurns: userTurn,
    });
    pubsub.publish(topics.branchTurns(input.branchId), {
      branchTurns: assistantTurn,
    });

    // Publish to conversation-level subscription
    pubsub.publish(topics.conversationEvents(conversationId), {
      conversationEvents: {
        conversationId,
        type: "ai_turn_created",
        payload: {
          turnId: assistantTurn.id,
          branchId: input.branchId,
          conversationId,
          role: assistantTurn.role,
          content: assistantTurn.content,
          parentTurnId: assistantTurn.parentTurnId,
          createdAt: assistantTurn.createdAt.toISOString(),
        },
        timestamp: new Date().toISOString(),
      },
    });

    // Trigger auto-summarization in the background (non-blocking)
    aiBranchSummaryService
      .maybeAutoSummarize({
        branchId: input.branchId,
        organizationId,
        userId: actorId,
        actorType,
        actorId,
      })
      .catch((err) => {
        console.error("[aiTurn] auto-summarize failed:", err);
      });

    return assistantTurn;
  }

  /**
   * Returns all turns in a branch ordered by creation time.
   */
  async getTurns(branchId: string): Promise<AiTurn[]> {
    return prisma.aiTurn.findMany({
      where: { branchId },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Returns a single turn with its branch info.
   */
  async getTurn(turnId: string) {
    return prisma.aiTurn.findUniqueOrThrow({
      where: { id: turnId },
      include: { branch: true },
    });
  }

  /**
   * Converts AiTurn records into LLMMessage format for context assembly.
   */
  private turnsToMessages(turns: AiTurn[]): LLMMessage[] {
    return turns.map((turn) => ({
      role: turn.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: turn.content,
    }));
  }
}

export const aiTurnService = new AiTurnService();
