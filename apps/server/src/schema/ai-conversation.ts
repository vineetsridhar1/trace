import type { Context } from "../context.js";
import type {
  AgentObservability,
  AiConversationVisibility,
  CreateAiConversationInput,
  UpdateAiConversationInput,
} from "@trace/gql";
import { aiConversationService } from "../services/aiConversation.js";
import { aiTurnService } from "../services/aiTurn.js";
import { aiBranchSummaryService } from "../services/aiBranchSummary.js";
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

  branchAncestors: async (_: unknown, args: { branchId: string }, ctx: Context) => {
    await aiConversationService.assertBranchAccess(args.branchId, ctx.userId);
    return aiConversationService.getBranchAncestors(args.branchId);
  },

  branchSummary: async (_: unknown, args: { branchId: string }, ctx: Context) => {
    await aiConversationService.assertBranchAccess(args.branchId, ctx.userId);
    return aiBranchSummaryService.getLatestSummary(args.branchId);
  },

  contextHealth: async (_: unknown, args: { branchId: string }, ctx: Context) => {
    await aiConversationService.assertBranchAccess(args.branchId, ctx.userId);
    return aiBranchSummaryService.getContextHealth({ branchId: args.branchId });
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
        modelId: args.input.modelId ?? undefined,
        systemPrompt: args.input.systemPrompt ?? undefined,
      },
      ctx.actorType,
      ctx.userId,
    );
  },

  sendTurn: async (
    _: unknown,
    args: { branchId: string; content: string; clientMutationId?: string | null },
    ctx: Context,
  ) => {
    const { assistantTurn } = await aiTurnService.sendTurn(
      {
        branchId: args.branchId,
        content: args.content,
        clientMutationId: args.clientMutationId ?? undefined,
      },
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

  forkBranch: (
    _: unknown,
    args: { turnId: string; label?: string | null },
    ctx: Context,
  ) => {
    return aiConversationService.forkBranch(
      { turnId: args.turnId, label: args.label ?? undefined },
      ctx.actorType,
      ctx.userId,
    );
  },

  updateAiConversation: (
    _: unknown,
    args: { conversationId: string; input: UpdateAiConversationInput },
    ctx: Context,
  ) => {
    return aiConversationService.updateConversation(
      {
        conversationId: args.conversationId,
        title: args.input.title ?? undefined,
        modelId: args.input.modelId,
        systemPrompt: args.input.systemPrompt,
        visibility: args.input.visibility ?? undefined,
      },
      ctx.actorType,
      ctx.userId,
    );
  },

  labelBranch: (
    _: unknown,
    args: { branchId: string; label: string },
    ctx: Context,
  ) => {
    return aiConversationService.labelBranch(
      { branchId: args.branchId, label: args.label },
      ctx.actorType,
      ctx.userId,
    );
  },

  updateAgentObservability: (
    _: unknown,
    args: { conversationId: string; level: AgentObservability },
    ctx: Context,
  ) => {
    return aiConversationService.updateAgentObservability({
      conversationId: args.conversationId,
      level: args.level,
      userId: ctx.userId,
      actorType: ctx.actorType,
    });
  },

  summarizeBranch: async (_: unknown, args: { branchId: string }, ctx: Context) => {
    const branch = await aiConversationService.assertBranchAccess(args.branchId, ctx.userId);
    return aiBranchSummaryService.summarizeBranch({
      branchId: args.branchId,
      organizationId: branch.conversation.organizationId,
      userId: ctx.userId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
};

export const aiConversationSubscriptions = {
  branchTurns: {
    subscribe: async (_: unknown, args: { branchId: string }, ctx: Context) => {
      await aiConversationService.assertBranchAccess(args.branchId, ctx.userId);

      return pubsub.asyncIterator<{ branchTurns: unknown }>(topics.branchTurns(args.branchId));
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
    createdBy: async (conversation: { createdById: string }, _args: unknown, ctx: Context) => {
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

    latestSummary: (branch: { id: string }) => {
      return aiBranchSummaryService.getLatestSummary(branch.id);
    },

    contextHealth: (branch: { id: string }) => {
      return aiBranchSummaryService.getContextHealth({ branchId: branch.id });
    },

    createdBy: async (branch: { createdById: string }, _args: unknown, ctx: Context) => {
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
