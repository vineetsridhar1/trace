import type { Context } from "../context.js";
import type { AiConversationVisibility, CreateAiConversationInput } from "@trace/gql";
import { aiConversationService } from "../services/aiConversation.js";
import { aiTurnService } from "../services/aiTurn.js";
import { pubsub, topics } from "../lib/pubsub.js";

export const aiConversationQueries = {
  aiConversations: (
    _: unknown,
    args: { organizationId: string; visibility?: AiConversationVisibility },
    ctx: Context,
  ) => {
    return aiConversationService.getConversations({
      organizationId: args.organizationId,
      userId: ctx.userId,
      visibility: args.visibility,
    });
  },

  aiConversation: (_: unknown, args: { id: string }, ctx: Context) => {
    return aiConversationService.getConversation(args.id, ctx.userId);
  },

  branch: (_: unknown, args: { id: string }, ctx: Context) => {
    return aiConversationService.getBranch(args.id, ctx.userId);
  },
};

export const aiConversationMutations = {
  createAiConversation: (
    _: unknown,
    args: { organizationId: string; input: CreateAiConversationInput },
    ctx: Context,
  ) => {
    return aiConversationService.createConversation(
      {
        organizationId: args.organizationId,
        title: args.input.title ?? undefined,
        visibility: args.input.visibility ?? undefined,
      },
      ctx.actorType,
      ctx.userId,
    );
  },

  sendTurn: async (
    _: unknown,
    args: { branchId: string; content: string },
    ctx: Context,
  ) => {
    const { assistantTurn } = await aiTurnService.sendTurn(
      { branchId: args.branchId, content: args.content },
      ctx.actorType,
      ctx.userId,
    );

    return assistantTurn;
  },

  updateAiConversationTitle: (
    _: unknown,
    args: { conversationId: string; title: string },
    ctx: Context,
  ) => {
    return aiConversationService.updateTitle(
      { conversationId: args.conversationId, title: args.title },
      ctx.actorType,
      ctx.userId,
    );
  },
};

export const aiConversationSubscriptions = {
  branchTurns: {
    subscribe: async (_: unknown, args: { branchId: string }, ctx: Context) => {
      await aiConversationService.assertBranchAccess(args.branchId, ctx.userId);

      return pubsub.asyncIterator<{ branchTurns: unknown }>(
        topics.branchTurns(args.branchId),
      );
    },
  },

  conversationEvents: {
    subscribe: async (_: unknown, args: { conversationId: string }, ctx: Context) => {
      await aiConversationService.assertConversationAccess(args.conversationId, ctx.userId);

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
      return aiConversationService.getRootBranch(conversation.id, conversation.rootBranchId);
    },

    branches: (conversation: { id: string }) => aiConversationService.getBranches(conversation.id),

    branchCount: (conversation: { id: string }) =>
      aiConversationService.countConversationBranches(conversation.id),
  },

  Branch: {
    conversation: (branch: { conversationId: string }, _args: unknown, ctx: Context) => {
      return ctx.conversationLoader.load(branch.conversationId);
    },

    parentBranch: (branch: { parentBranchId: string | null }, _args: unknown, ctx: Context) => {
      if (!branch.parentBranchId) return null;
      return ctx.branchLoader.load(branch.parentBranchId);
    },

    forkTurn: (branch: { forkTurnId?: string | null }, _args: unknown, ctx: Context) => {
      if (!branch.forkTurnId) return null;
      return ctx.turnLoader.load(branch.forkTurnId);
    },

    turns: (branch: { id: string }) => aiTurnService.getTurns(branch.id),

    childBranches: (branch: { id: string }) => aiConversationService.getChildBranches(branch.id),

    depth: (branch: { id: string }) => {
      return aiConversationService.getBranchDepth(branch.id);
    },

    turnCount: (branch: { id: string }) => aiConversationService.countBranchTurns(branch.id),

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
    branch: (turn: { branchId: string }, _args: unknown, ctx: Context) => {
      return ctx.branchLoader.load(turn.branchId);
    },

    parentTurn: (turn: { parentTurnId?: string | null }, _args: unknown, ctx: Context) => {
      if (!turn.parentTurnId) return null;
      return ctx.turnLoader.load(turn.parentTurnId);
    },

    branchCount: (turn: { id: string }) => aiConversationService.countTurnBranches(turn.id),

    childBranches: (turn: { id: string }) => aiConversationService.getTurnChildBranches(turn.id),
  },
};
