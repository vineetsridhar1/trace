import { Prisma, type AiTurn } from "@prisma/client";
import type { ActorType } from "@trace/gql";
import type {
  LLMAssistantContentBlock,
  LLMMessage,
  LLMStreamEvent,
} from "@trace/shared";
import { prisma } from "../lib/db.js";
import { aiService } from "./ai.js";
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

    // Load the branch
    const branch = await prisma.aiBranch.findUniqueOrThrow({
      where: { id: input.branchId },
    });

    // Verify access via the conversation service (single source of truth for access control)
    const conversation = await aiConversationService.getConversation(
      branch.conversationId,
      actorId,
    );

    // Create user turn with race condition protection on parentTurnId
    let userTurn: AiTurn;
    try {
      const lastTurn = await prisma.aiTurn.findFirst({
        where: { branchId: input.branchId },
        orderBy: { createdAt: "desc" },
      });

      userTurn = await prisma.aiTurn.create({
        data: {
          branchId: input.branchId,
          role: "USER",
          content: input.content,
          parentTurnId: lastTurn?.id ?? null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new Error(
          "Another message is being sent to this branch. Please try again.",
        );
      }
      throw error;
    }

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
        organizationId: conversation.organizationId,
        userId: actorId,
        model,
        messages,
      });

      // Extract text content from response
      assistantContent = response.content
        .filter(
          (block: LLMAssistantContentBlock) => block.type === "text",
        )
        .map((block: LLMAssistantContentBlock) =>
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

    return { userTurn, assistantTurn };
  }

  /**
   * Streams a user turn response from the LLM. Creates the user turn
   * immediately, yields stream events, then creates the assistant turn
   * after the stream completes. On LLM failure, the user turn is kept
   * and a stream_error event is yielded so the frontend can show a retry UI.
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
    | LLMStreamEvent
    | { type: "user_turn_created"; turn: AiTurn }
    | { type: "assistant_turn_created"; turn: AiTurn }
    | { type: "stream_error"; error: string; userTurn: AiTurn }
  > {
    const model = input.model ?? DEFAULT_MODEL;

    // Load the branch
    const branch = await prisma.aiBranch.findUniqueOrThrow({
      where: { id: input.branchId },
    });

    // Verify access via the conversation service
    const conversation = await aiConversationService.getConversation(
      branch.conversationId,
      actorId,
    );

    // Create user turn with race condition protection
    let userTurn: AiTurn;
    try {
      const lastTurn = await prisma.aiTurn.findFirst({
        where: { branchId: input.branchId },
        orderBy: { createdAt: "desc" },
      });

      userTurn = await prisma.aiTurn.create({
        data: {
          branchId: input.branchId,
          role: "USER",
          content: input.content,
          parentTurnId: lastTurn?.id ?? null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new Error(
          "Another message is being sent to this branch. Please try again.",
        );
      }
      throw error;
    }

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
        organizationId: conversation.organizationId,
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
      // Keep the user turn — yield an error event so the frontend can show retry UI
      yield {
        type: "stream_error" as const,
        error: error instanceof Error ? error.message : "LLM stream failed",
        userTurn,
      };
      return;
    }

    if (!fullText) {
      // No content received — yield error, keep user turn for retry
      yield {
        type: "stream_error" as const,
        error: "No response received from the model",
        userTurn,
      };
      return;
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

    yield { type: "assistant_turn_created" as const, turn: assistantTurn };
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
