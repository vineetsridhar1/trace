import type { AiConversationVisibility, Prisma } from "@prisma/client";
import type { ActorType } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { pubsub, topics } from "../lib/pubsub.js";

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
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      return updated;
    });
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

    pubsub.publish(topics.conversationEvents(input.conversationId), {
      conversationEvents: {
        conversationId: input.conversationId,
        type: "title_updated",
        payload: { title: input.title },
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

  async getRootBranch(conversationId: string, rootBranchId: string | null) {
    if (rootBranchId) {
      return prisma.aiBranch.findUniqueOrThrow({ where: { id: rootBranchId } });
    }

    return prisma.aiBranch.findFirst({
      where: { conversationId, parentBranchId: null },
    });
  }

  async countConversationBranches(conversationId: string) {
    return prisma.aiBranch.count({
      where: { conversationId },
    });
  }

  async getChildBranches(branchId: string) {
    return prisma.aiBranch.findMany({
      where: { parentBranchId: branchId },
    });
  }

  async countBranchTurns(branchId: string) {
    return prisma.aiTurn.count({
      where: { branchId },
    });
  }

  async countTurnBranches(turnId: string) {
    return prisma.aiBranch.count({
      where: { forkTurnId: turnId },
    });
  }

  async getTurnChildBranches(turnId: string) {
    return prisma.aiBranch.findMany({
      where: { forkTurnId: turnId },
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
