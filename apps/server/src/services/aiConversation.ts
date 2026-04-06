import type { AgentObservability, AiConversationVisibility, Prisma } from "@prisma/client";
import type { ActorType } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { eventService } from "./event.js";

export class AiConversationService {
  /**
   * Creates a conversation and its root branch atomically.
   * Returns the conversation with the root branch included.
   */
  async createConversation(
    input: {
      organizationId: string;
      title?: string;
      visibility?: AiConversationVisibility;
      agentObservability?: AgentObservability;
    },
    actorType: ActorType,
    actorId: string,
  ) {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Verify user belongs to org
      await tx.orgMember.findUniqueOrThrow({
        where: {
          userId_organizationId: {
            userId: actorId,
            organizationId: input.organizationId,
          },
        },
      });

      const conversation = await tx.aiConversation.create({
        data: {
          organizationId: input.organizationId,
          createdById: actorId,
          title: input.title ?? null,
          visibility: input.visibility ?? "PRIVATE",
          agentObservability: input.agentObservability ?? "OFF",
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

    const { conversation: updated, rootBranch } = result;

    // Emit events after transaction commits to avoid race conditions
    await eventService.create({
      organizationId: input.organizationId,
      scopeType: "ai_conversation",
      scopeId: updated.id,
      eventType: "ai_conversation_created",
      payload: {
        conversationId: updated.id,
        title: updated.title,
        visibility: updated.visibility,
        agentObservability: updated.agentObservability,
        rootBranchId: updated.rootBranchId,
        createdById: actorId,
        updatedAt: updated.updatedAt.toISOString(),
      },
      actorType,
      actorId,
    });

    await eventService.create({
      organizationId: input.organizationId,
      scopeType: "ai_conversation",
      scopeId: updated.id,
      eventType: "ai_branch_created",
      payload: {
        branchId: rootBranch.id,
        conversationId: updated.id,
        parentBranchId: null,
        forkTurnId: null,
        label: rootBranch.label,
        createdById: actorId,
      },
      actorType,
      actorId,
    });

    // Publish to conversation subscription topic
    pubsub.publish(topics.conversationEvents(updated.id), {
      conversationEvents: {
        conversationId: updated.id,
        type: "ai_conversation_created",
        payload: {
          conversationId: updated.id,
          title: updated.title,
          visibility: updated.visibility,
          agentObservability: updated.agentObservability,
          rootBranchId: updated.rootBranchId,
          createdById: actorId,
          updatedAt: updated.updatedAt.toISOString(),
        },
        timestamp: new Date().toISOString(),
      },
    });

    return updated;
  }

  /**
   * Verifies the user has access to the conversation that owns this branch.
   * Returns the branch with its conversation for downstream use.
   */
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

    // For ORG visibility, verify user is in the same org
    if (branch.conversation.createdById !== userId) {
      await prisma.orgMember.findUniqueOrThrow({
        where: {
          userId_organizationId: {
            userId,
            organizationId: branch.conversation.organizationId,
          },
        },
      });
    }

    return branch;
  }

  /**
   * Verifies the user has access to a conversation.
   */
  async assertConversationAccess(conversationId: string, userId: string) {
    const conversation = await prisma.aiConversation.findUniqueOrThrow({
      where: { id: conversationId },
    });

    if (conversation.visibility === "PRIVATE" && conversation.createdById !== userId) {
      throw new Error("Conversation not found");
    }

    if (conversation.createdById !== userId) {
      await prisma.orgMember.findUniqueOrThrow({
        where: {
          userId_organizationId: {
            userId,
            organizationId: conversation.organizationId,
          },
        },
      });
    }

    return conversation;
  }

  /**
   * Returns a single conversation with branches and turn counts.
   * Enforces access control: private conversations are only visible to the creator.
   * Returns a uniform "not found" error to avoid leaking existence of private conversations.
   */
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

    // For ORG visibility, verify user is in the same org
    if (conversation.createdById !== requestingUserId) {
      await prisma.orgMember.findUniqueOrThrow({
        where: {
          userId_organizationId: {
            userId: requestingUserId,
            organizationId: conversation.organizationId,
          },
        },
      });
    }

    return conversation;
  }

  /**
   * Returns conversations the user can see:
   * - Their own (any visibility)
   * - ORG-visible ones from their organization
   */
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
    // Verify user belongs to org
    await prisma.orgMember.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    });

    // Build visibility filter: own conversations + ORG-visible ones
    const accessFilter: Prisma.AiConversationWhereInput[] = [
      { createdById: userId },
      { visibility: "ORG" },
    ];

    // If caller requests a specific visibility, narrow the OR accordingly
    const where: Prisma.AiConversationWhereInput = {
      organizationId,
      ...(visibility
        ? {
            OR: accessFilter.filter((f) => {
              // PRIVATE filter: only show own
              if (visibility === "PRIVATE") return "createdById" in f;
              // ORG filter: show own ORG + others' ORG
              return true;
            }),
          }
        : { OR: accessFilter }),
    };

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

  /**
   * Updates the conversation title. Only the creator can update.
   */
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

    // Persist event and broadcast to org-wide stream
    await eventService.create({
      organizationId: conversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: input.conversationId,
      eventType: "ai_conversation_title_updated",
      payload: {
        conversationId: input.conversationId,
        title: input.title,
        updatedAt: updated.updatedAt.toISOString(),
      },
      actorType,
      actorId,
    });

    // Publish to conversation subscription topic
    pubsub.publish(topics.conversationEvents(input.conversationId), {
      conversationEvents: {
        conversationId: input.conversationId,
        type: "ai_conversation_title_updated",
        payload: { title: input.title, updatedAt: updated.updatedAt.toISOString() },
        timestamp: new Date().toISOString(),
      },
    });

    return updated;
  }

  /**
   * Returns a branch with its turns ordered by creation time.
   * Enforces access control through the parent conversation.
   */
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

  /**
   * Returns all branches for a conversation with metadata.
   */
  async getBranches(conversationId: string) {
    const branches = await prisma.aiBranch.findMany({
      where: { conversationId },
      include: {
        _count: { select: { turns: true } },
      },
    });

    // Compute depth for each branch
    const branchMap = new Map<string, { parentBranchId: string | null }>(
      branches.map((b: (typeof branches)[number]) => [b.id, b]),
    );

    return branches.map((branch: (typeof branches)[number]) => ({
      ...branch,
      turnCount: branch._count.turns,
      depth: this.computeDepth(branch.id, branchMap),
    }));
  }

  /**
   * Computes depth of a branch by walking the parent chain. Root = 0.
   */
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

  /**
   * Updates the agent observability level for a conversation.
   */
  async updateObservability(
    input: { conversationId: string; agentObservability: AgentObservability },
    actorType: ActorType,
    actorId: string,
  ) {
    const conversation = await prisma.aiConversation.findUniqueOrThrow({
      where: { id: input.conversationId },
    });

    if (conversation.createdById !== actorId) {
      throw new Error("Only the conversation creator can update observability");
    }

    const updated = await prisma.aiConversation.update({
      where: { id: input.conversationId },
      data: { agentObservability: input.agentObservability },
    });

    await eventService.create({
      organizationId: conversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: input.conversationId,
      eventType: "ai_conversation_observability_changed",
      payload: {
        conversationId: input.conversationId,
        agentObservability: input.agentObservability,
        updatedAt: updated.updatedAt.toISOString(),
      },
      actorType,
      actorId,
    });

    pubsub.publish(topics.conversationEvents(input.conversationId), {
      conversationEvents: {
        conversationId: input.conversationId,
        type: "ai_conversation_observability_changed",
        payload: {
          agentObservability: input.agentObservability,
          updatedAt: updated.updatedAt.toISOString(),
        },
        timestamp: new Date().toISOString(),
      },
    });

    return updated;
  }

  /**
   * Labels a branch. Only the conversation creator can label.
   */
  async labelBranch(
    input: { branchId: string; label: string },
    actorType: ActorType,
    actorId: string,
  ) {
    const branch = await prisma.aiBranch.findUniqueOrThrow({
      where: { id: input.branchId },
      include: { conversation: true },
    });

    // For agent actors, skip ownership check (agent acts on behalf of the system)
    if (actorType === "user" && branch.conversation.createdById !== actorId) {
      throw new Error("Only the conversation creator can label branches");
    }

    const updated = await prisma.aiBranch.update({
      where: { id: input.branchId },
      data: { label: input.label },
    });

    await eventService.create({
      organizationId: branch.conversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: branch.conversationId,
      eventType: "ai_branch_labeled",
      payload: {
        branchId: input.branchId,
        conversationId: branch.conversationId,
        label: input.label,
      },
      actorType,
      actorId,
    });

    pubsub.publish(topics.conversationEvents(branch.conversationId), {
      conversationEvents: {
        conversationId: branch.conversationId,
        type: "ai_branch_labeled",
        payload: { branchId: input.branchId, label: input.label },
        timestamp: new Date().toISOString(),
      },
    });

    return updated;
  }

  /**
   * Forks a new branch from the given turn in the given branch.
   */
  async forkBranch(
    input: { branchId: string; turnId: string; label?: string },
    actorType: ActorType,
    actorId: string,
  ) {
    const branch = await prisma.aiBranch.findUniqueOrThrow({
      where: { id: input.branchId },
      include: { conversation: true },
    });

    // Verify actor has access
    if (actorType === "user") {
      if (
        branch.conversation.visibility === "PRIVATE" &&
        branch.conversation.createdById !== actorId
      ) {
        throw new Error("Conversation not found");
      }
      if (branch.conversation.createdById !== actorId) {
        await prisma.orgMember.findUniqueOrThrow({
          where: {
            userId_organizationId: {
              userId: actorId,
              organizationId: branch.conversation.organizationId,
            },
          },
        });
      }
    }

    // Verify the turn belongs to this branch
    await prisma.aiTurn.findFirstOrThrow({
      where: { id: input.turnId, branchId: input.branchId },
    });

    const newBranch = await prisma.aiBranch.create({
      data: {
        conversationId: branch.conversationId,
        parentBranchId: input.branchId,
        forkTurnId: input.turnId,
        label: input.label ?? null,
        createdById: actorId,
      },
    });

    // Copy turns up to and including the fork point
    const turnsToFork = await prisma.aiTurn.findMany({
      where: { branchId: input.branchId },
      orderBy: { createdAt: "asc" },
    });

    let parentTurnId: string | null = null;
    for (const turn of turnsToFork) {
      const copied: { id: string } = await prisma.aiTurn.create({
        data: {
          branchId: newBranch.id,
          role: turn.role,
          content: turn.content,
          parentTurnId,
        },
        select: { id: true },
      });
      parentTurnId = copied.id;
      if (turn.id === input.turnId) break;
    }

    await eventService.create({
      organizationId: branch.conversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: branch.conversationId,
      eventType: "ai_branch_created",
      payload: {
        branchId: newBranch.id,
        conversationId: branch.conversationId,
        parentBranchId: input.branchId,
        forkTurnId: input.turnId,
        label: newBranch.label,
        createdById: actorId,
      },
      actorType,
      actorId,
    });

    pubsub.publish(topics.conversationEvents(branch.conversationId), {
      conversationEvents: {
        conversationId: branch.conversationId,
        type: "ai_branch_created",
        payload: {
          branchId: newBranch.id,
          conversationId: branch.conversationId,
          parentBranchId: input.branchId,
          forkTurnId: input.turnId,
          label: newBranch.label,
          createdById: actorId,
        },
        timestamp: new Date().toISOString(),
      },
    });

    return newBranch;
  }

  /**
   * Links an external entity (ticket, session, etc.) to a conversation.
   */
  async linkEntity(
    input: { conversationId: string; entityType: string; entityId: string },
    actorType: ActorType,
    actorId: string,
  ) {
    const conversation = await prisma.aiConversation.findUniqueOrThrow({
      where: { id: input.conversationId },
    });

    // For agent actors, skip ownership check
    if (actorType === "user" && conversation.createdById !== actorId) {
      throw new Error("Only the conversation creator can link entities");
    }

    const link = await prisma.aiConversationLinkedEntity.create({
      data: {
        conversationId: input.conversationId,
        entityType: input.entityType,
        entityId: input.entityId,
        createdById: actorId,
      },
    });

    await eventService.create({
      organizationId: conversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: input.conversationId,
      eventType: "ai_conversation_entity_linked",
      payload: {
        conversationId: input.conversationId,
        linkedEntityId: link.id,
        entityType: input.entityType,
        entityId: input.entityId,
        createdById: actorId,
      },
      actorType,
      actorId,
    });

    pubsub.publish(topics.conversationEvents(input.conversationId), {
      conversationEvents: {
        conversationId: input.conversationId,
        type: "ai_conversation_entity_linked",
        payload: {
          linkedEntityId: link.id,
          entityType: input.entityType,
          entityId: input.entityId,
          createdById: actorId,
        },
        timestamp: new Date().toISOString(),
      },
    });

    return link;
  }

  /**
   * Unlinks an external entity from a conversation.
   */
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

    await eventService.create({
      organizationId: conversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: input.conversationId,
      eventType: "ai_conversation_entity_unlinked",
      payload: {
        conversationId: input.conversationId,
        entityType: input.entityType,
        entityId: input.entityId,
      },
      actorType,
      actorId,
    });

    pubsub.publish(topics.conversationEvents(input.conversationId), {
      conversationEvents: {
        conversationId: input.conversationId,
        type: "ai_conversation_entity_unlinked",
        payload: {
          entityType: input.entityType,
          entityId: input.entityId,
        },
        timestamp: new Date().toISOString(),
      },
    });

    return true;
  }

  /**
   * Computes depth from an in-memory branch map (avoids N+1 queries).
   */
  private computeDepth(
    branchId: string,
    branchMap: Map<string, { parentBranchId: string | null }>,
  ): number {
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
