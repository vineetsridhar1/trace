import type { Context } from "../context.js";
import type { AiConversationVisibility, CreateAiConversationInput } from "@trace/gql";
import { aiConversationService } from "../services/aiConversation.js";
import { aiTurnService } from "../services/aiTurn.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { prisma } from "../lib/db.js";

export const aiConversationQueries = {
  aiConversations: (
    _: unknown,
    args: { organizationId: string; visibility?: AiConversationVisibility },
    ctx: Context,
  ) => {
    return aiConversationService.getConversations({
      organizationId: args.organizationId,
      userId: ctx.userId,
      visibility: args.visibility ?? undefined,
    });
  },

  aiConversation: (_: unknown, args: { id: string }, ctx: Context) => {
    return aiConversationService.getConversation(args.id, ctx.userId);
  },

  branch: (_: unknown, args: { id: string }) => {
    return aiConversationService.getBranch(args.id);
  },
};

export const aiConversationMutations = {
  createAiConversation: async (
    _: unknown,
    args: { organizationId: string; input: CreateAiConversationInput },
    ctx: Context,
  ) => {
    const conversation = await aiConversationService.createConversation(
      {
        organizationId: args.organizationId,
        title: args.input.title ?? undefined,
        visibility: args.input.visibility ?? undefined,
      },
      ctx.actorType,
      ctx.userId,
    );
    return conversation;
  },

  sendTurn: async (
    _: unknown,
    args: { branchId: string; content: string },
    ctx: Context,
  ) => {
    const { userTurn, assistantTurn } = await aiTurnService.sendTurn(
      { branchId: args.branchId, content: args.content },
      ctx.actorType,
      ctx.userId,
    );

    // Publish both turns to the branch subscription
    pubsub.publish(topics.branchTurns(args.branchId), {
      branchTurns: userTurn,
    });
    pubsub.publish(topics.branchTurns(args.branchId), {
      branchTurns: assistantTurn,
    });

    // Return the assistant turn per the schema (Turn!)
    return assistantTurn;
  },

  updateAiConversationTitle: async (
    _: unknown,
    args: { conversationId: string; title: string },
    ctx: Context,
  ) => {
    const conversation = await aiConversationService.updateTitle(
      { conversationId: args.conversationId, title: args.title },
      ctx.actorType,
      ctx.userId,
    );

    // Publish a conversation event for title change
    pubsub.publish(topics.conversationEvents(args.conversationId), {
      conversationEvents: {
        id: `title-update-${Date.now()}`,
        scopeType: "system",
        scopeId: args.conversationId,
        eventType: "ai_conversation_title_updated",
        payload: { conversationId: args.conversationId, title: args.title },
        actorType: ctx.actorType,
        actorId: ctx.userId,
        timestamp: new Date().toISOString(),
      },
    });

    return conversation;
  },
};

export const aiConversationSubscriptions = {
  branchTurns: {
    subscribe: (_: unknown, args: { branchId: string }) => {
      return pubsub.asyncIterator<{ branchTurns: unknown }>(
        topics.branchTurns(args.branchId),
      );
    },
  },

  conversationEvents: {
    subscribe: (_: unknown, args: { conversationId: string }) => {
      return pubsub.asyncIterator<{ conversationEvents: unknown }>(
        topics.conversationEvents(args.conversationId),
      );
    },
  },
};

export const aiConversationTypeResolvers = {
  AiConversation: {
    createdBy: async (
      conversation: { createdById: string },
      _args: unknown,
      ctx: Context,
    ) => {
      const user = await ctx.userLoader.load(conversation.createdById);
      if (!user) throw new Error("User not found");
      return user;
    },

    rootBranch: (conversation: { rootBranchId: string | null; id: string }) => {
      if (!conversation.rootBranchId) {
        // Fallback: find the branch with no parent
        return prisma.aiBranch.findFirst({
          where: { conversationId: conversation.id, parentBranchId: null },
        });
      }
      return prisma.aiBranch.findUniqueOrThrow({
        where: { id: conversation.rootBranchId },
      });
    },

    branches: (conversation: { id: string }) => {
      return prisma.aiBranch.findMany({
        where: { conversationId: conversation.id },
      });
    },

    branchCount: async (conversation: { id: string }) => {
      return prisma.aiBranch.count({
        where: { conversationId: conversation.id },
      });
    },
  },

  Branch: {
    conversation: (branch: { conversationId: string }) => {
      return prisma.aiConversation.findUniqueOrThrow({
        where: { id: branch.conversationId },
      });
    },

    parentBranch: (branch: { parentBranchId: string | null }) => {
      if (!branch.parentBranchId) return null;
      return prisma.aiBranch.findUnique({
        where: { id: branch.parentBranchId },
      });
    },

    forkTurn: (branch: { forkTurnId?: string | null }) => {
      if (!branch.forkTurnId) return null;
      return prisma.aiTurn.findUnique({
        where: { id: branch.forkTurnId },
      });
    },

    turns: (branch: { id: string }) => {
      return prisma.aiTurn.findMany({
        where: { branchId: branch.id },
        orderBy: { createdAt: "asc" },
      });
    },

    childBranches: (branch: { id: string }) => {
      return prisma.aiBranch.findMany({
        where: { parentBranchId: branch.id },
      });
    },

    depth: (branch: { id: string }) => {
      return aiConversationService.getBranchDepth(branch.id);
    },

    turnCount: (branch: { id: string }) => {
      return prisma.aiTurn.count({
        where: { branchId: branch.id },
      });
    },

    createdBy: async (
      branch: { createdById: string },
      _args: unknown,
      ctx: Context,
    ) => {
      const user = await ctx.userLoader.load(branch.createdById);
      if (!user) throw new Error("User not found");
      return user;
    },
  },

  Turn: {
    branch: (turn: { branchId: string }) => {
      return prisma.aiBranch.findUniqueOrThrow({
        where: { id: turn.branchId },
      });
    },

    parentTurn: (turn: { parentTurnId?: string | null }) => {
      if (!turn.parentTurnId) return null;
      return prisma.aiTurn.findUnique({
        where: { id: turn.parentTurnId },
      });
    },

    branchCount: (turn: { id: string }) => {
      return prisma.aiBranch.count({
        where: { forkTurnId: turn.id },
      });
    },

    childBranches: (turn: { id: string }) => {
      return prisma.aiBranch.findMany({
        where: { forkTurnId: turn.id },
      });
    },
  },
};
