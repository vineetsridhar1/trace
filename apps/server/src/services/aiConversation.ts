import type {
  AgentObservability,
  AiConversationVisibility,
  AiTurn,
  Prisma,
} from "@prisma/client";
import type { ActorType } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { eventService } from "./event.js";

type ConversationEventPayload = Record<string, unknown>;

function asJson(payload: ConversationEventPayload): Prisma.InputJsonValue {
  return payload as Prisma.InputJsonValue;
}

export class AiConversationService {
  async createConversation(
    input: {
      organizationId: string;
      title?: string;
      visibility?: AiConversationVisibility;
      agentObservability?: AgentObservability;
      modelId?: string;
      systemPrompt?: string;
    },
    actorType: ActorType,
    actorId: string,
  ) {
    await this.assertOrgMembership(input.organizationId, actorId);

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const conversation = await tx.aiConversation.create({
        data: {
          organizationId: input.organizationId,
          createdById: actorId,
          title: input.title ?? null,
          visibility: input.visibility ?? "PRIVATE",
          agentObservability: input.agentObservability ?? "OFF",
          modelId: input.modelId ?? null,
          systemPrompt: input.systemPrompt ?? null,
        },
      });

      const rootBranch = await tx.aiBranch.create({
        data: {
          conversationId: conversation.id,
          createdById: actorId,
          label: "main",
        },
      });

      const updated = await tx.aiConversation.update({
        where: { id: conversation.id },
        data: { rootBranchId: rootBranch.id },
        include: { branches: true },
      });

      return { conversation: updated, rootBranch };
    });

    const { conversation, rootBranch } = result;
    const conversationPayload = {
      conversationId: conversation.id,
      title: conversation.title,
      visibility: conversation.visibility,
      agentObservability: conversation.agentObservability,
      modelId: conversation.modelId,
      systemPrompt: conversation.systemPrompt,
      rootBranchId: conversation.rootBranchId,
      createdById: actorId,
      forkedFromConversationId: conversation.forkedFromConversationId,
      forkedFromBranchId: conversation.forkedFromBranchId,
      updatedAt: conversation.updatedAt.toISOString(),
    };

    await eventService.create({
      organizationId: conversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: conversation.id,
      eventType: "ai_conversation_created",
      payload: asJson(conversationPayload),
      actorType,
      actorId,
    });

    await eventService.create({
      organizationId: conversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: conversation.id,
      eventType: "ai_branch_created",
      payload: asJson({
        branchId: rootBranch.id,
        conversationId: conversation.id,
        parentBranchId: null,
        forkTurnId: null,
        label: rootBranch.label,
        createdById: actorId,
        depth: 0,
      }),
      actorType,
      actorId,
    });

    this.publishConversationEvent(conversation.id, "ai_conversation_created", conversationPayload);
    this.publishConversationEvent(conversation.id, "ai_branch_created", {
      branchId: rootBranch.id,
      conversationId: conversation.id,
      parentBranchId: null,
      forkTurnId: null,
      label: rootBranch.label,
      createdById: actorId,
      depth: 0,
    });

    return conversation;
  }

  async assertBranchAccess(branchId: string, userId: string) {
    const branch = await prisma.aiBranch.findUniqueOrThrow({
      where: { id: branchId },
      include: { conversation: true },
    });

    if (
      branch.conversation.visibility === "PRIVATE" &&
      branch.conversation.createdById !== userId
    ) {
      throw new Error("Conversation not found");
    }

    if (branch.conversation.createdById !== userId) {
      await this.assertOrgMembership(branch.conversation.organizationId, userId);
    }

    return branch;
  }

  async assertConversationAccess(conversationId: string, userId: string) {
    const conversation = await prisma.aiConversation.findUniqueOrThrow({
      where: { id: conversationId },
    });

    if (conversation.visibility === "PRIVATE" && conversation.createdById !== userId) {
      throw new Error("Conversation not found");
    }

    if (conversation.createdById !== userId) {
      await this.assertOrgMembership(conversation.organizationId, userId);
    }

    return conversation;
  }

  async getConversation(id: string, requestingUserId: string) {
    const conversation = await prisma.aiConversation.findFirst({
      where: {
        id,
        OR: [{ createdById: requestingUserId }, { visibility: "ORG" }],
      },
      include: {
        branches: {
          include: {
            _count: { select: { turns: true } },
          },
        },
      },
    });

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    if (conversation.createdById !== requestingUserId) {
      await this.assertOrgMembership(conversation.organizationId, requestingUserId);
    }

    return conversation;
  }

  async getConversations({
    organizationId,
    userId,
    visibility,
    limit,
  }: {
    organizationId: string;
    userId: string;
    visibility?: AiConversationVisibility;
    limit?: number;
  }) {
    await this.assertOrgMembership(organizationId, userId);

    let where: Prisma.AiConversationWhereInput;
    if (visibility === "PRIVATE") {
      where = {
        organizationId,
        createdById: userId,
        visibility: "PRIVATE",
      };
    } else if (visibility === "ORG") {
      where = {
        organizationId,
        visibility: "ORG",
      };
    } else {
      where = {
        organizationId,
        OR: [{ createdById: userId }, { visibility: "ORG" }],
      };
    }

    return prisma.aiConversation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      ...(limit ? { take: limit } : {}),
      include: {
        branches: {
          include: {
            _count: { select: { turns: true } },
          },
        },
      },
    });
  }

  async updateTitle(
    input: { conversationId: string; title: string },
    actorType: ActorType,
    actorId: string,
  ) {
    const conversation = await prisma.aiConversation.findUniqueOrThrow({
      where: { id: input.conversationId },
    });

    if (conversation.createdById !== actorId) {
      throw new Error("Only the conversation creator can update the title");
    }

    const updated = await prisma.aiConversation.update({
      where: { id: input.conversationId },
      data: { title: input.title },
    });

    const payload = {
      conversationId: input.conversationId,
      title: input.title,
      updatedAt: updated.updatedAt.toISOString(),
    };

    await eventService.create({
      organizationId: conversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: input.conversationId,
      eventType: "ai_conversation_title_updated",
      payload: asJson(payload),
      actorType,
      actorId,
    });

    this.publishConversationEvent(input.conversationId, "ai_conversation_title_updated", payload);

    return updated;
  }

  async updateConversation(
    input: {
      conversationId: string;
      title?: string;
      modelId?: string | null;
      systemPrompt?: string | null;
      visibility?: AiConversationVisibility;
    },
    actorType: ActorType,
    actorId: string,
  ) {
    const conversation = await prisma.aiConversation.findUniqueOrThrow({
      where: { id: input.conversationId },
    });

    if (conversation.createdById !== actorId) {
      throw new Error("Only the conversation creator can update the conversation");
    }

    const data: Prisma.AiConversationUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.modelId !== undefined) data.modelId = input.modelId;
    if (input.systemPrompt !== undefined) data.systemPrompt = input.systemPrompt;
    if (input.visibility !== undefined) data.visibility = input.visibility;

    if (Object.keys(data).length === 0) {
      return conversation;
    }

    const updated = await prisma.aiConversation.update({
      where: { id: input.conversationId },
      data,
    });

    const payload: ConversationEventPayload = {
      conversationId: input.conversationId,
      updatedAt: updated.updatedAt.toISOString(),
    };
    if (input.title !== undefined) payload.title = updated.title;
    if (input.modelId !== undefined) payload.modelId = updated.modelId;
    if (input.systemPrompt !== undefined) payload.systemPrompt = updated.systemPrompt;
    if (input.visibility !== undefined) payload.visibility = updated.visibility;

    await eventService.create({
      organizationId: conversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: input.conversationId,
      eventType: "ai_conversation_updated",
      payload: asJson(payload),
      actorType,
      actorId,
    });

    this.publishConversationEvent(input.conversationId, "ai_conversation_updated", payload);

    if (input.visibility !== undefined) {
      this.publishConversationEvent(input.conversationId, "ai_conversation_visibility_changed", {
        conversationId: input.conversationId,
        visibility: updated.visibility,
        updatedAt: updated.updatedAt.toISOString(),
      });
    }

    return updated;
  }

  async updateVisibility(
    input: { conversationId: string; visibility: AiConversationVisibility },
    actorType: ActorType,
    actorId: string,
  ) {
    const conversation = await prisma.aiConversation.findUniqueOrThrow({
      where: { id: input.conversationId },
    });

    if (conversation.createdById !== actorId) {
      throw new Error("Only the conversation creator can change visibility");
    }

    if (conversation.visibility === input.visibility) {
      return conversation;
    }

    const updated = await prisma.aiConversation.update({
      where: { id: input.conversationId },
      data: { visibility: input.visibility },
    });

    const payload = {
      conversationId: input.conversationId,
      visibility: updated.visibility,
      updatedAt: updated.updatedAt.toISOString(),
    };

    await eventService.create({
      organizationId: conversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: input.conversationId,
      eventType: "ai_conversation_visibility_changed",
      payload: asJson(payload),
      actorType,
      actorId,
    });

    this.publishConversationEvent(
      input.conversationId,
      "ai_conversation_visibility_changed",
      payload,
    );

    return updated;
  }

  async updateAgentObservability(
    input: {
      conversationId: string;
      level: AgentObservability;
      userId: string;
      actorType: ActorType;
    },
  ) {
    const conversation = await prisma.aiConversation.findUniqueOrThrow({
      where: { id: input.conversationId },
    });

    if (conversation.createdById !== input.userId) {
      throw new Error("Only the conversation creator can update agent observability");
    }

    const updated = await prisma.aiConversation.update({
      where: { id: input.conversationId },
      data: { agentObservability: input.level },
    });

    const payload = {
      conversationId: input.conversationId,
      agentObservability: updated.agentObservability,
      updatedAt: updated.updatedAt.toISOString(),
    };

    await eventService.create({
      organizationId: conversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: input.conversationId,
      eventType: "ai_conversation_observability_changed",
      payload: asJson(payload),
      actorType: input.actorType,
      actorId: input.userId,
    });

    this.publishConversationEvent(
      input.conversationId,
      "ai_conversation_observability_changed",
      payload,
    );

    return updated;
  }

  async getBranch(branchId: string, requestingUserId: string) {
    await this.assertBranchAccess(branchId, requestingUserId);

    return prisma.aiBranch.findUniqueOrThrow({
      where: { id: branchId },
      include: {
        turns: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  async getBranches(conversationId: string) {
    const branches = await prisma.aiBranch.findMany({
      where: { conversationId },
      include: {
        _count: { select: { turns: true } },
      },
    });

    const branchMap = new Map<string, { parentBranchId: string | null }>(
      branches.map((branch) => [branch.id, branch]),
    );

    return branches.map((branch) => ({
      ...branch,
      turnCount: branch._count.turns,
      depth: this.computeDepth(branch.id, branchMap),
    }));
  }

  async getBranchDepth(branchId: string): Promise<number> {
    let depth = 0;
    let currentId: string | null = branchId;

    while (currentId) {
      const current: { parentBranchId: string | null } = await prisma.aiBranch.findUniqueOrThrow({
        where: { id: currentId },
        select: { parentBranchId: true },
      });

      if (current.parentBranchId === null) {
        break;
      }

      depth++;
      currentId = current.parentBranchId;
    }

    return depth;
  }

  async labelBranch(
    input: { branchId: string; label: string },
    actorType: ActorType,
    actorId: string,
  ) {
    const branch = await this.assertBranchAccess(input.branchId, actorId);

    if (
      actorType === "user" &&
      branch.conversation.createdById !== actorId &&
      branch.createdById !== actorId
    ) {
      throw new Error("Only the conversation or branch creator can label a branch");
    }

    const updated = await prisma.aiBranch.update({
      where: { id: input.branchId },
      data: { label: input.label },
    });

    const payload = {
      branchId: input.branchId,
      conversationId: branch.conversationId,
      label: input.label,
    };

    await eventService.create({
      organizationId: branch.conversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: branch.conversationId,
      eventType: "ai_branch_labeled",
      payload: asJson(payload),
      actorType,
      actorId,
    });

    this.publishConversationEvent(branch.conversationId, "ai_branch_labeled", payload);

    return updated;
  }

  async forkBranch(
    input: { turnId: string; label?: string; branchId?: string },
    actorType: ActorType,
    actorId: string,
  ) {
    const turn = await prisma.aiTurn.findUniqueOrThrow({
      where: { id: input.turnId },
      include: {
        branch: {
          include: {
            conversation: true,
          },
        },
      },
    });

    if (input.branchId && input.branchId !== turn.branchId) {
      throw new Error("Turn does not belong to the specified branch");
    }

    const parentBranch = turn.branch;
    const conversation = parentBranch.conversation;

    await this.assertConversationAccess(conversation.id, actorId);

    if (actorType === "user" && conversation.createdById !== actorId) {
      throw new Error("Only the conversation creator can create branches");
    }

    const parentDepth = await this.getBranchDepth(parentBranch.id);
    const newBranch = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.aiBranch.create({
        data: {
          conversationId: conversation.id,
          parentBranchId: parentBranch.id,
          forkTurnId: turn.id,
          label: input.label ?? null,
          createdById: actorId,
        },
      });

      await tx.aiConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });

      return created;
    });

    const payload = {
      branchId: newBranch.id,
      conversationId: conversation.id,
      parentBranchId: parentBranch.id,
      forkTurnId: turn.id,
      label: newBranch.label,
      createdById: actorId,
      depth: parentDepth + 1,
    };

    await eventService.create({
      organizationId: conversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: conversation.id,
      eventType: "ai_branch_created",
      payload: asJson(payload),
      actorType,
      actorId,
    });

    this.publishConversationEvent(conversation.id, "ai_branch_created", payload);

    return newBranch;
  }

  async buildContext(branchId: string, upToTurnId?: string): Promise<AiTurn[]> {
    const branch = await prisma.aiBranch.findUniqueOrThrow({
      where: { id: branchId },
    });

    let branchTurns: AiTurn[];
    if (upToTurnId) {
      const upToTurn = await prisma.aiTurn.findUniqueOrThrow({
        where: { id: upToTurnId },
      });

      branchTurns = await prisma.aiTurn.findMany({
        where: {
          branchId,
          createdAt: { lte: upToTurn.createdAt },
        },
        orderBy: { createdAt: "asc" },
      });
    } else {
      branchTurns = await prisma.aiTurn.findMany({
        where: { branchId },
        orderBy: { createdAt: "asc" },
      });
    }

    if (branch.parentBranchId === null) {
      return branchTurns;
    }

    const parentContext = await this.buildContext(
      branch.parentBranchId,
      branch.forkTurnId ?? undefined,
    );

    return [...parentContext, ...branchTurns];
  }

  async getBranchAncestors(branchId: string) {
    const ancestors: Array<{
      id: string;
      conversationId: string;
      parentBranchId: string | null;
      forkTurnId: string | null;
      label: string | null;
      createdById: string;
      createdAt: Date;
    }> = [];

    let currentId: string | null = branchId;
    while (currentId) {
      const branch: {
        id: string;
        conversationId: string;
        parentBranchId: string | null;
        forkTurnId: string | null;
        label: string | null;
        createdById: string;
        createdAt: Date;
      } = await prisma.aiBranch.findUniqueOrThrow({
        where: { id: currentId },
      });

      ancestors.unshift(branch);
      currentId = branch.parentBranchId;
    }

    return ancestors;
  }

  async linkEntity(
    input: { conversationId: string; entityType: string; entityId: string },
    actorType: ActorType,
    actorId: string,
  ) {
    const conversation = await prisma.aiConversation.findUniqueOrThrow({
      where: { id: input.conversationId },
    });

    if (actorType === "user" && conversation.createdById !== actorId) {
      throw new Error("Only the conversation creator can link entities");
    }

    const link = await prisma.aiConversationLinkedEntity.upsert({
      where: {
        conversationId_entityType_entityId: {
          conversationId: input.conversationId,
          entityType: input.entityType,
          entityId: input.entityId,
        },
      },
      update: {},
      create: {
        conversationId: input.conversationId,
        entityType: input.entityType,
        entityId: input.entityId,
        createdById: actorId,
      },
    });

    const payload = {
      conversationId: input.conversationId,
      linkedEntityId: link.id,
      entityType: link.entityType,
      entityId: link.entityId,
      createdById: link.createdById,
      createdAt: link.createdAt.toISOString(),
    };

    await eventService.create({
      organizationId: conversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: input.conversationId,
      eventType: "ai_conversation_entity_linked",
      payload: asJson(payload),
      actorType,
      actorId,
    });

    this.publishConversationEvent(input.conversationId, "ai_conversation_entity_linked", payload);

    return link;
  }

  async unlinkEntity(
    input: { conversationId: string; entityType: string; entityId: string },
    actorType: ActorType,
    actorId: string,
  ) {
    const conversation = await prisma.aiConversation.findUniqueOrThrow({
      where: { id: input.conversationId },
    });

    if (actorType === "user" && conversation.createdById !== actorId) {
      throw new Error("Only the conversation creator can unlink entities");
    }

    await prisma.aiConversationLinkedEntity.delete({
      where: {
        conversationId_entityType_entityId: {
          conversationId: input.conversationId,
          entityType: input.entityType,
          entityId: input.entityId,
        },
      },
    });

    const payload = {
      conversationId: input.conversationId,
      entityType: input.entityType,
      entityId: input.entityId,
    };

    await eventService.create({
      organizationId: conversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: input.conversationId,
      eventType: "ai_conversation_entity_unlinked",
      payload: asJson(payload),
      actorType,
      actorId,
    });

    this.publishConversationEvent(
      input.conversationId,
      "ai_conversation_entity_unlinked",
      payload,
    );

    return true;
  }

  async forkAiConversation(
    input: { branchId: string },
    actorType: ActorType,
    actorId: string,
  ) {
    const sourceBranch = await prisma.aiBranch.findUniqueOrThrow({
      where: { id: input.branchId },
      include: { conversation: true },
    });

    const sourceConversation = sourceBranch.conversation;
    if (sourceConversation.visibility !== "ORG") {
      throw new Error("Can only fork ORG-visible conversations");
    }

    await this.assertOrgMembership(sourceConversation.organizationId, actorId);

    const contextTurns = await this.buildContext(input.branchId);

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const conversation = await tx.aiConversation.create({
        data: {
          organizationId: sourceConversation.organizationId,
          createdById: actorId,
          title: sourceConversation.title ? `${sourceConversation.title} (fork)` : "Fork",
          visibility: "PRIVATE",
          agentObservability: "OFF",
          modelId: sourceConversation.modelId,
          systemPrompt: sourceConversation.systemPrompt,
          forkedFromConversationId: sourceConversation.id,
          forkedFromBranchId: input.branchId,
        },
      });

      const rootBranch = await tx.aiBranch.create({
        data: {
          conversationId: conversation.id,
          createdById: actorId,
          label: "main",
        },
      });

      const updated = await tx.aiConversation.update({
        where: { id: conversation.id },
        data: { rootBranchId: rootBranch.id },
        include: { branches: true },
      });

      let previousTurnId: string | null = null;
      for (const turn of contextTurns) {
        const created: { id: string } = await tx.aiTurn.create({
          data: {
            branchId: rootBranch.id,
            role: turn.role,
            content: turn.content,
            parentTurnId: previousTurnId,
            summarized: turn.summarized,
          },
          select: { id: true },
        });
        previousTurnId = created.id;
      }

      return { conversation: updated, rootBranch };
    });

    const { conversation, rootBranch } = result;
    const conversationPayload = {
      conversationId: conversation.id,
      title: conversation.title,
      visibility: conversation.visibility,
      agentObservability: conversation.agentObservability,
      modelId: conversation.modelId,
      systemPrompt: conversation.systemPrompt,
      rootBranchId: conversation.rootBranchId,
      createdById: actorId,
      forkedFromConversationId: sourceConversation.id,
      forkedFromBranchId: input.branchId,
      updatedAt: conversation.updatedAt.toISOString(),
    };

    await eventService.create({
      organizationId: sourceConversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: conversation.id,
      eventType: "ai_conversation_created",
      payload: asJson(conversationPayload),
      actorType,
      actorId,
    });

    await eventService.create({
      organizationId: sourceConversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: conversation.id,
      eventType: "ai_branch_created",
      payload: asJson({
        branchId: rootBranch.id,
        conversationId: conversation.id,
        parentBranchId: null,
        forkTurnId: null,
        label: rootBranch.label,
        createdById: actorId,
        depth: 0,
      }),
      actorType,
      actorId,
    });

    this.publishConversationEvent(conversation.id, "ai_conversation_created", conversationPayload);
    this.publishConversationEvent(conversation.id, "ai_branch_created", {
      branchId: rootBranch.id,
      conversationId: conversation.id,
      parentBranchId: null,
      forkTurnId: null,
      label: rootBranch.label,
      createdById: actorId,
      depth: 0,
    });

    return conversation;
  }

  private publishConversationEvent(
    conversationId: string,
    type: string,
    payload: ConversationEventPayload,
  ) {
    pubsub.publish(topics.conversationEvents(conversationId), {
      conversationEvents: {
        conversationId,
        type,
        payload,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private async assertOrgMembership(organizationId: string, userId: string) {
    await prisma.orgMember.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    });
  }

  private computeDepth(
    branchId: string,
    branchMap: Map<string, { parentBranchId: string | null }>,
  ) {
    let depth = 0;
    let currentId: string | null = branchId;

    while (currentId) {
      const node = branchMap.get(currentId);
      if (!node || node.parentBranchId === null) {
        break;
      }
      depth++;
      currentId = node.parentBranchId;
    }

    return depth;
  }
}

export const aiConversationService = new AiConversationService();
