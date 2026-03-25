import type { AiConversationVisibility, Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";

export class AiConversationService {
  /**
   * Creates a conversation and its root branch atomically.
   * Returns the conversation with the root branch included.
   */
  async createConversation({
    organizationId,
    createdById,
    title,
    visibility,
  }: {
    organizationId: string;
    createdById: string;
    title?: string;
    visibility?: AiConversationVisibility;
  }) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Verify user belongs to org
      await tx.orgMember.findUniqueOrThrow({
        where: {
          userId_organizationId: {
            userId: createdById,
            organizationId,
          },
        },
      });

      const conversation = await tx.aiConversation.create({
        data: {
          organizationId,
          createdById,
          title: title ?? null,
          visibility: visibility ?? "PRIVATE",
        },
      });

      const rootBranch = await tx.aiBranch.create({
        data: {
          conversationId: conversation.id,
          createdById,
          parentBranchId: null,
          forkTurnId: null,
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
   * Returns a single conversation with branches and turn counts.
   * Enforces access control: private conversations are only visible to the creator.
   */
  async getConversation(id: string, requestingUserId: string) {
    const conversation = await prisma.aiConversation.findUniqueOrThrow({
      where: { id },
      include: {
        branches: {
          include: {
            _count: { select: { turns: true } },
          },
        },
      },
    });

    if (
      conversation.visibility === "PRIVATE" &&
      conversation.createdById !== requestingUserId
    ) {
      throw new Error("Not authorized to view this conversation");
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
    // User can see: own conversations + ORG-visible ones in the same org
    const where: Prisma.AiConversationWhereInput = {
      organizationId,
      OR: [
        { createdById: userId },
        { visibility: "ORG" },
      ],
      ...(visibility ? { visibility } : {}),
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
    conversationId: string,
    title: string,
    requestingUserId: string,
  ) {
    const conversation = await prisma.aiConversation.findUniqueOrThrow({
      where: { id: conversationId },
    });

    if (conversation.createdById !== requestingUserId) {
      throw new Error("Only the conversation creator can update the title");
    }

    return prisma.aiConversation.update({
      where: { id: conversationId },
      data: { title },
    });
  }

  /**
   * Returns a branch with its turns ordered by creation time.
   */
  async getBranch(branchId: string) {
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
      branches.map((b: typeof branches[number]) => [b.id, b]),
    );

    return branches.map((branch: typeof branches[number]) => ({
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
      const current: { parentBranchId: string | null } =
        await prisma.aiBranch.findUniqueOrThrow({
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
