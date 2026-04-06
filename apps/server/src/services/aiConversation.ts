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
   * Builds the full context for a branch by collecting all turns from the
   * branch and its ancestors (walking the parent chain). Returns a flat,
   * chronologically-ordered list of turns.
   */
  async buildContext(branchId: string): Promise<
    Array<{ id: string; role: string; content: string; parentTurnId: string | null; createdAt: Date }>
  > {
    const branch = await prisma.aiBranch.findUniqueOrThrow({
      where: { id: branchId },
    });

    // Collect ancestor context first (recursive)
    const ancestorTurns: Array<{
      id: string;
      role: string;
      content: string;
      parentTurnId: string | null;
      createdAt: Date;
    }> = [];

    if (branch.parentBranchId && branch.forkTurnId) {
      const parentContext = await this.buildContext(branch.parentBranchId);
      // Include turns up to and including the fork turn
      for (const turn of parentContext) {
        ancestorTurns.push(turn);
        if (turn.id === branch.forkTurnId) break;
      }
    }

    // Fetch local turns for this branch
    const localTurns = await prisma.aiTurn.findMany({
      where: { branchId },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true, parentTurnId: true, createdAt: true },
    });

    return [...ancestorTurns, ...localTurns];
  }

  /**
   * Forks a branch from a shared (ORG-visible) conversation into a new
   * private conversation owned by the requesting user. Deep copies all
   * turns from the branch context into the new conversation's root branch.
   */
  async forkAiConversation(
    input: { branchId: string },
    actorType: ActorType,
    actorId: string,
  ) {
    // Load the source branch and its conversation
    const sourceBranch = await prisma.aiBranch.findUniqueOrThrow({
      where: { id: input.branchId },
      include: { conversation: true },
    });

    const sourceConversation = sourceBranch.conversation;

    // Validate source conversation is ORG-visible
    if (sourceConversation.visibility !== "ORG") {
      throw new Error("Can only fork ORG-visible conversations");
    }

    // Verify user belongs to the same org
    await prisma.orgMember.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: actorId,
          organizationId: sourceConversation.organizationId,
        },
      },
    });

    // Build full context (ancestor + local turns) for the source branch
    const contextTurns = await this.buildContext(input.branchId);

    // Create new conversation with deep-copied turns in a transaction
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const conversation = await tx.aiConversation.create({
        data: {
          organizationId: sourceConversation.organizationId,
          createdById: actorId,
          title: sourceConversation.title ? `${sourceConversation.title} (fork)` : "(fork)",
          visibility: "PRIVATE",
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

      // Deep copy turns into the new root branch with new IDs, preserving order
      let previousTurnId: string | null = null;
      for (const turn of contextTurns) {
        const newTurn: { id: string } = await tx.aiTurn.create({
          data: {
            branchId: rootBranch.id,
            role: turn.role as "USER" | "ASSISTANT",
            content: turn.content,
            parentTurnId: previousTurnId,
          },
        });
        previousTurnId = newTurn.id;
      }

      return { conversation: updated, rootBranch };
    });

    const { conversation: updated, rootBranch } = result;

    // Emit events after transaction commits
    await eventService.create({
      organizationId: sourceConversation.organizationId,
      scopeType: "ai_conversation",
      scopeId: updated.id,
      eventType: "ai_conversation_created",
      payload: {
        conversationId: updated.id,
        title: updated.title,
        visibility: updated.visibility,
        rootBranchId: updated.rootBranchId,
        createdById: actorId,
        forkedFromConversationId: sourceConversation.id,
        forkedFromBranchId: input.branchId,
        updatedAt: updated.updatedAt.toISOString(),
      },
      actorType,
      actorId,
    });

    await eventService.create({
      organizationId: sourceConversation.organizationId,
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
          forkedFromConversationId: sourceConversation.id,
          forkedFromBranchId: input.branchId,
          updatedAt: updated.updatedAt.toISOString(),
        },
        timestamp: new Date().toISOString(),
      },
    });

    return updated;
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
