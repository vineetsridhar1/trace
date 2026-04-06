import type { AiConversationVisibility, Prisma } from "@prisma/client";
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
   * Creates a new branch forking from an existing turn.
   * The new branch inherits context from the parent branch up to the fork turn.
   */
  async forkBranch(
    input: { turnId: string; label?: string },
    actorType: ActorType,
    actorId: string,
  ) {
    // Load the turn and its branch to determine the parent
    const forkTurn = await prisma.aiTurn.findUniqueOrThrow({
      where: { id: input.turnId },
      include: {
        branch: {
          include: { conversation: true },
        },
      },
    });

    const parentBranch = forkTurn.branch;
    const conversation = parentBranch.conversation;

    // Verify access: user must belong to org and have conversation access
    await prisma.orgMember.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: actorId,
          organizationId: conversation.organizationId,
        },
      },
    });

    if (conversation.visibility === "PRIVATE" && conversation.createdById !== actorId) {
      throw new Error("Conversation not found");
    }

    // Compute depth
    const parentDepth = await this.getBranchDepth(parentBranch.id);

    // Create the new branch
    const newBranch = await prisma.aiBranch.create({
      data: {
        conversationId: conversation.id,
        parentBranchId: parentBranch.id,
        forkTurnId: input.turnId,
        label: input.label ?? null,
        createdById: actorId,
      },
    });

    // Update conversation updatedAt
    await prisma.aiConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    // Emit branch created event
    const organizationId = conversation.organizationId;
    await eventService.create({
      organizationId,
      scopeType: "ai_conversation",
      scopeId: conversation.id,
      eventType: "ai_branch_created",
      payload: {
        branchId: newBranch.id,
        conversationId: conversation.id,
        parentBranchId: parentBranch.id,
        forkTurnId: input.turnId,
        label: newBranch.label,
        createdById: actorId,
        depth: parentDepth + 1,
      },
      actorType,
      actorId,
    });

    // Publish to conversation subscription topic
    pubsub.publish(topics.conversationEvents(conversation.id), {
      conversationEvents: {
        conversationId: conversation.id,
        type: "ai_branch_created",
        payload: {
          branchId: newBranch.id,
          conversationId: conversation.id,
          parentBranchId: parentBranch.id,
          forkTurnId: input.turnId,
          label: newBranch.label,
          createdById: actorId,
          depth: parentDepth + 1,
        },
        timestamp: new Date().toISOString(),
      },
    });

    return newBranch;
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
