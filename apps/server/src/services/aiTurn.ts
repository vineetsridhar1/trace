import type { AiTurn, Prisma } from "@prisma/client";
import type { ActorType } from "@trace/gql";
import type { LLMAssistantContentBlock, LLMMessage, LLMStreamEvent } from "@trace/shared";
import { prisma } from "../lib/db.js";
import { aiService } from "./ai.js";
import { aiConversationService } from "./aiConversation.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { eventService } from "./event.js";

/**
 * Truncates text at a word boundary within the given max length.
 * Returns the truncated text with "..." appended if it was shortened.
 */
function truncateAtWord(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;

  const truncated = trimmed.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  const cutPoint = lastSpace > 0 ? lastSpace : maxLength;
  return trimmed.slice(0, cutPoint) + "...";
}

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
    const model = input.model ?? DEFAULT_MODEL;

    // Load the branch and verify access to the conversation
    const branch = await prisma.aiBranch.findUniqueOrThrow({
      where: { id: input.branchId },
      include: {
        conversation: true,
      },
    });

    // Verify user belongs to org
    await prisma.orgMember.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: actorId,
          organizationId: branch.conversation.organizationId,
        },
      },
    });

    // Verify access: private conversations only accessible to creator
    if (
      branch.conversation.visibility === "PRIVATE" &&
      branch.conversation.createdById !== actorId
    ) {
      throw new Error("Conversation not found");
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

    // Auto-label: if this is the first turn on the branch and no label is set, generate one
    if (!lastTurn && !branch.label) {
      const autoLabel = truncateAtWord(input.content, 30);
      await prisma.aiBranch.update({
        where: { id: input.branchId },
        data: { label: autoLabel },
      });

      const conversationId = branch.conversationId;
      const organizationId = branch.conversation.organizationId;

      await eventService.create({
        organizationId,
        scopeType: "ai_conversation",
        scopeId: conversationId,
        eventType: "ai_branch_labeled",
        payload: { branchId: input.branchId, label: autoLabel, conversationId },
        actorType,
        actorId,
      });

      pubsub.publish(topics.conversationEvents(conversationId), {
        conversationEvents: {
          conversationId,
          type: "ai_branch_labeled",
          payload: { branchId: input.branchId, label: autoLabel, conversationId },
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Assemble context: walk ancestor chain for full conversation history
    const contextTurns = await aiConversationService.buildContext(input.branchId);
    const messages = this.turnsToMessages(contextTurns);

    // Call LLM
    let assistantContent: string;
    try {
      const response = await aiService.complete({
        organizationId: branch.conversation.organizationId,
        userId: actorId,
        model,
        messages,
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

    return { userTurn, assistantTurn };
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
    const model = input.model ?? DEFAULT_MODEL;

    // Load the branch and verify access
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

    if (
      branch.conversation.visibility === "PRIVATE" &&
      branch.conversation.createdById !== actorId
    ) {
      throw new Error("Conversation not found");
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

    // Auto-label: if this is the first turn on the branch and no label is set, generate one
    if (!lastTurn && !branch.label) {
      const autoLabel = truncateAtWord(input.content, 30);
      await prisma.aiBranch.update({
        where: { id: input.branchId },
        data: { label: autoLabel },
      });

      const conversationId = branch.conversationId;
      const organizationId = branch.conversation.organizationId;

      await eventService.create({
        organizationId,
        scopeType: "ai_conversation",
        scopeId: conversationId,
        eventType: "ai_branch_labeled",
        payload: { branchId: input.branchId, label: autoLabel, conversationId },
        actorType,
        actorId,
      });

      pubsub.publish(topics.conversationEvents(conversationId), {
        conversationEvents: {
          conversationId,
          type: "ai_branch_labeled",
          payload: { branchId: input.branchId, label: autoLabel, conversationId },
          timestamp: new Date().toISOString(),
        },
      });
    }

    yield { type: "user_turn_created" as const, turn: userTurn };

    // Assemble context: walk ancestor chain for full conversation history
    const contextTurns = await aiConversationService.buildContext(input.branchId);
    const messages = this.turnsToMessages(contextTurns);

    // Stream from LLM
    let fullText = "";
    try {
      for await (const event of aiService.stream({
        organizationId: branch.conversation.organizationId,
        userId: actorId,
        model,
        messages,
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
