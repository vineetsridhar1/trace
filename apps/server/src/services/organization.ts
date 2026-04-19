import type {
  CreateRepoInput,
  UpdateRepoInput,
  CreateProjectInput,
  EntityType,
  ActorType,
} from "@trace/gql";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { TRACE_AI_USER_ID } from "../lib/ai-user.js";
import { eventService } from "./event.js";

const PROJECT_INCLUDE = {
  repo: true,
  channels: { include: { channel: true } },
  sessions: { include: { session: true } },
  tickets: { include: { ticket: true } },
} as const;

export class OrganizationService {
  private async assertActorOrgMembership(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    if (actorType === "system") return;

    await tx.orgMember.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: actorId,
          organizationId,
        },
      },
      select: { userId: true },
    });
  }

  private async assertProjectLinkTargetInOrg(
    tx: Prisma.TransactionClient,
    entityType: EntityType,
    entityId: string,
    organizationId: string,
  ) {
    switch (entityType) {
      case "session":
        await tx.session.findFirstOrThrow({
          where: { id: entityId, organizationId },
          select: { id: true },
        });
        return;
      case "ticket":
        await tx.ticket.findFirstOrThrow({
          where: { id: entityId, organizationId },
          select: { id: true },
        });
        return;
      case "channel":
        await tx.channel.findFirstOrThrow({
          where: { id: entityId, organizationId },
          select: { id: true },
        });
        return;
      case "chat":
        throw new Error("Chats cannot be linked to projects");
      case "message":
        throw new Error("Messages cannot be linked to projects");
    }
  }

  async getOrganization(id: string, userId: string) {
    await prisma.orgMember.findUniqueOrThrow({
      where: { userId_organizationId: { userId, organizationId: id } },
    });

    return prisma.organization.findUnique({
      where: { id },
      include: {
        orgMembers: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
            organization: { select: { id: true, name: true } },
          },
        },
        repos: true,
        projects: true,
        channels: true,
      },
    });
  }

  async listRepos(organizationId: string) {
    return prisma.repo.findMany({
      where: { organizationId },
      include: { projects: true, sessions: true },
    });
  }

  async getRepo(id: string, organizationId: string) {
    return prisma.repo.findFirst({
      where: { id, organizationId },
      include: { projects: true, sessions: true },
    });
  }

  async getRepoById(id: string) {
    return prisma.repo.findUnique({
      where: { id },
      include: { projects: true, sessions: true },
    });
  }

  async listProjects(organizationId: string, repoId?: string) {
    return prisma.project.findMany({
      where: { organizationId, ...(repoId ? { repoId } : {}) },
      include: PROJECT_INCLUDE,
    });
  }

  async getProject(id: string, organizationId: string) {
    return prisma.project.findFirst({
      where: { id, organizationId },
      include: PROJECT_INCLUDE,
    });
  }

  async getUserProfile(userId: string) {
    return prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });
  }

  async getOrganizationSummary(organizationId: string) {
    return prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { id: true, name: true },
    });
  }

  async searchUsers(query: string, organizationId: string) {
    if (query.length < 2) return [];

    return prisma.user.findMany({
      where: {
        id: { not: TRACE_AI_USER_ID },
        orgMemberships: {
          none: { organizationId },
        },
        OR: [
          { email: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, email: true, avatarUrl: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 10,
    });
  }

  async createRepo(
    input: CreateRepoInput,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    if (input.organizationId !== organizationId) {
      throw new Error("Not authorized for this organization");
    }

    const [repo] = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.assertActorOrgMembership(tx, organizationId, actorType, actorId);

      const existing = await tx.repo.findUnique({
        where: {
          organizationId_remoteUrl: {
            organizationId,
            remoteUrl: input.remoteUrl,
          },
        },
        include: { projects: true, sessions: true },
      });

      if (existing) {
        return [existing] as const;
      }

      const repo = await tx.repo.create({
        data: {
          name: input.name,
          remoteUrl: input.remoteUrl,
          defaultBranch: input.defaultBranch ?? "main",
          organizationId,
        },
        include: { projects: true, sessions: true },
      });

      const event = await eventService.create(
        {
          organizationId,
          scopeType: "system",
          scopeId: repo.id,
          eventType: "repo_created",
          payload: {
            repo: {
              id: repo.id,
              name: repo.name,
              remoteUrl: repo.remoteUrl,
              defaultBranch: repo.defaultBranch,
              webhookActive: !!repo.webhookId,
            },
          },
          actorType,
          actorId,
        },
        tx,
      );

      return [repo, event] as const;
    });

    return repo;
  }

  async updateRepo(
    id: string,
    organizationId: string,
    input: UpdateRepoInput,
    actorType: ActorType,
    actorId: string,
  ) {
    const [repo] = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Verify repo belongs to caller's org before updating
      await tx.repo.findFirstOrThrow({
        where: { id, organizationId },
        select: { id: true },
      });

      const repo = await tx.repo.update({
        where: { id },
        data: {
          ...(input.name != null && { name: input.name }),
          ...(input.defaultBranch != null && { defaultBranch: input.defaultBranch }),
        },
        include: { projects: true, sessions: true },
      });

      const event = await eventService.create(
        {
          organizationId: repo.organizationId,
          scopeType: "system",
          scopeId: repo.id,
          eventType: "repo_updated",
          payload: {
            repo: {
              id: repo.id,
              name: repo.name,
              remoteUrl: repo.remoteUrl,
              defaultBranch: repo.defaultBranch,
              webhookActive: !!repo.webhookId,
            },
          },
          actorType,
          actorId,
        },
        tx,
      );

      return [repo, event] as const;
    });

    return repo;
  }

  async createProject(
    input: CreateProjectInput,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    if (input.organizationId !== organizationId) {
      throw new Error("Not authorized for this organization");
    }

    const [project] = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.assertActorOrgMembership(tx, organizationId, actorType, actorId);

      if (input.repoId) {
        await tx.repo.findFirstOrThrow({
          where: { id: input.repoId, organizationId },
          select: { id: true },
        });
      }

      const project = await tx.project.create({
        data: {
          name: input.name,
          organizationId,
          ...(input.repoId && { repoId: input.repoId }),
        },
        include: PROJECT_INCLUDE,
      });

      const event = await eventService.create(
        {
          organizationId,
          scopeType: "system",
          scopeId: project.id,
          eventType: "entity_linked",
          payload: { type: "project_created", projectId: project.id, name: project.name },
          actorType,
          actorId,
        },
        tx,
      );

      return [project, event] as const;
    });

    return project;
  }

  async linkEntityToProject(
    entityType: EntityType,
    entityId: string,
    projectId: string,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.assertActorOrgMembership(tx, organizationId, actorType, actorId);

      const project = await tx.project.findFirstOrThrow({
        where: { id: projectId, organizationId },
        select: { organizationId: true },
      });
      await this.assertProjectLinkTargetInOrg(tx, entityType, entityId, organizationId);

      if (entityType === "session") {
        await tx.sessionProject.create({ data: { sessionId: entityId, projectId } });
      } else if (entityType === "ticket") {
        await tx.ticketProject.create({ data: { ticketId: entityId, projectId } });
      } else if (entityType === "channel") {
        await tx.channelProject.create({ data: { channelId: entityId, projectId } });
      }

      await eventService.create(
        {
          organizationId: project.organizationId,
          scopeType: "system",
          scopeId: projectId,
          eventType: "entity_linked",
          payload: { entityType, entityId, projectId },
          actorType,
          actorId,
        },
        tx,
      );

      return tx.project.findFirstOrThrow({
        where: { id: projectId, organizationId },
        include: PROJECT_INCLUDE,
      });
    });
  }
}

export const organizationService = new OrganizationService();
