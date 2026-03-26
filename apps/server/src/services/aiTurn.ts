import type { AiBranch, AiConversation, AiTurn, Prisma } from "@prisma/client";
import type { ActorType } from "@trace/gql";
import type {
  LLMAssistantContentBlock,
  LLMMessage,
  LLMStreamEvent,
} from "@trace/shared";
import { prisma } from "../lib/db.js";
import { aiService } from "./ai.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { eventService } from "./event.js";
import { aiConversationService } from "./aiConversation.js";

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
    },
    actorType: ActorType,
    actorId: string,
  ): Promise<{ userTurn: AiTurn; assistantTurn: AiTurn }> {
    const model = input.model ?? DEFAULT_MODEL;

    // Verify access via the shared access control method
    const branch = await aiConversationService.assertBranchAccess(input.branchId, actorId);

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

    // Assemble context: all turns in the branch in chronological order
    const turns = await prisma.aiTurn.findMany({
      where: { branchId: input.branchId },
      orderBy: { createdAt: "asc" },
    });

    const messages = this.turnsToMessages(turns);

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
        .filter(
          (block: LLMAssistantContentBlock) => block.type === "text",
        )
        .map(
          (block: LLMAssistantContentBlock) =>
            block.type === "text" ? block.text : "",
        )
        .join("");
    } catch (error) {
      // On LLM failure, delete the user turn so we don't leave orphans
      await prisma.aiTurn.delete({ where: { id: userTurn.id } });
      throw error;
    }

    // Create assistant turn and update conversation.updatedAt atomically
    const assistantTurn = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
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
      },
    );

    // Emit events and publish to subscriptions after both turns succeed
    await this.emitTurnCreated(userTurn, branch, actorType, actorId);
    await this.emitTurnCreated(assistantTurn, branch, actorType, actorId);

    pubsub.publish(topics.branchTurns(input.branchId), { branchTurns: userTurn });
    pubsub.publish(topics.branchTurns(input.branchId), { branchTurns: assistantTurn });

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

    // Verify access via the shared access control method
    const branch = await aiConversationService.assertBranchAccess(input.branchId, actorId);

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

    // Yield the user turn immediately so the UI can show it,
    // but defer event emission until after the LLM succeeds
    // to avoid orphan events if the stream fails and the turn is deleted.
    pubsub.publish(topics.branchTurns(input.branchId), { branchTurns: userTurn });
    yield { type: "user_turn_created" as const, turn: userTurn };

    // Assemble context
    const turns = await prisma.aiTurn.findMany({
      where: { branchId: input.branchId },
      orderBy: { createdAt: "asc" },
    });
    const messages = this.turnsToMessages(turns);

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
    const assistantTurn = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
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
      },
    );

    // Emit events for both turns now that the full exchange succeeded
    await this.emitTurnCreated(userTurn, branch, actorType, actorId);
    await this.emitTurnCreated(assistantTurn, branch, actorType, actorId);

    pubsub.publish(topics.branchTurns(input.branchId), { branchTurns: assistantTurn });

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
   * Emits an ai_turn_created event via the event service.
   * Persists the event to the DB and broadcasts to org-wide + conversation-scoped streams.
   */
  private emitTurnCreated(
    turn: AiTurn,
    branch: AiBranch & { conversation: AiConversation },
    actorType: ActorType,
    actorId: string,
  ) {
    return eventService.create({
      organizationId: branch.conversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: branch.conversationId,
      eventType: "ai_turn_created",
      payload: {
        turnId: turn.id,
        branchId: branch.id,
        conversationId: branch.conversationId,
        role: turn.role,
        content: turn.content,
        parentTurnId: turn.parentTurnId,
        createdAt: turn.createdAt.toISOString(),
      },
      actorType,
      actorId,
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
