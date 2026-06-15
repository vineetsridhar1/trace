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
import { assertActorOrgAccess } from "./actor-auth.js";
import { createChannelInTransaction } from "./channel-create.js";
import { repoApplicationConfigService } from "./repo-application-config.js";
import { ValidationError } from "../lib/errors.js";

const PROJECT_INCLUDE = {
  repo: true,
  channels: { include: { channel: true } },
  sessions: { include: { session: true } },
  tickets: { include: { ticket: true } },
} as const;

export class OrganizationService {
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

  async createRepo(input: CreateRepoInput, actorType: ActorType, actorId: string) {
    await prisma.$transaction((tx: Prisma.TransactionClient) =>
      assertActorOrgAccess(tx, input.organizationId, actorType, actorId),
    );

    const remoteUrl = input.remoteUrl?.trim() || null;

    // Deduplicate by remote URL within the org — if it already exists, return it
    if (remoteUrl) {
      const existing = await prisma.repo.findUnique({
        where: {
          organizationId_remoteUrl: {
            organizationId: input.organizationId,
            remoteUrl,
          },
        },
        include: { projects: true, sessions: true },
      });

      if (existing) return existing;
    }

    const [repo, repoEvent, channelEvent] = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const repo = await tx.repo.create({
          data: {
            name: input.name,
            remoteUrl,
            defaultBranch: input.defaultBranch ?? "main",
            organizationId: input.organizationId,
          },
          include: { projects: true, sessions: true },
        });

        const { channel, channelPayload } = await createChannelInTransaction(tx, {
          organizationId: input.organizationId,
          name: repo.name,
          type: "coding",
          actorType,
          actorId,
          repo: { id: repo.id, name: repo.name },
          baseBranch: repo.defaultBranch,
        });

        const repoEvent = await eventService.create(
          {
            organizationId: input.organizationId,
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
            deferPublish: true,
          },
          tx,
        );

        const channelEvent = await eventService.create(
          {
            organizationId: input.organizationId,
            scopeType: "channel",
            scopeId: channel.id,
            eventType: "channel_created",
            payload: {
              channel: channelPayload,
            },
            actorType,
            actorId,
            deferPublish: true,
          },
          tx,
        );

        return [repo, repoEvent, channelEvent] as const;
      },
    );

    eventService.publishCreated(repoEvent);
    eventService.publishCreated(channelEvent);

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
      const existing = await tx.repo.findFirstOrThrow({
        where: { id, organizationId },
        select: { id: true, name: true, remoteUrl: true, setupConfig: true },
      });

      if (input.applicationConfig != null && repoApplicationConfigService.isHardcoded(existing)) {
        throw new ValidationError(
          "This repo's application config is managed by the internal fork and cannot be edited.",
        );
      }

      const repo = await tx.repo.update({
        where: { id },
        data: {
          ...(input.name != null && { name: input.name }),
          ...(input.defaultBranch != null && { defaultBranch: input.defaultBranch }),
          ...(input.applicationConfig != null && {
            setupConfig: repoApplicationConfigService.mergeIntoSetupConfig(
              existing.setupConfig,
              input.applicationConfig,
            ),
          }),
        },
        include: { projects: true, sessions: true },
      });

      const applicationConfig = repoApplicationConfigService.toPublicConfig(
        repoApplicationConfigService.resolveApplicationConfig(repo),
      );

      const event = await eventService.create(
        {
          organizationId: repo.organizationId,
          scopeType: "system",
          scopeId: repo.id,
          eventType: input.applicationConfig != null ? "application_config_updated" : "repo_updated",
          payload: {
            repo: {
              id: repo.id,
              name: repo.name,
              remoteUrl: repo.remoteUrl,
              defaultBranch: repo.defaultBranch,
              webhookActive: !!repo.webhookId,
              applicationConfig,
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

  async createProject(input: CreateProjectInput, actorType: ActorType, actorId: string) {
    const [project] = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertActorOrgAccess(tx, input.organizationId, actorType, actorId);

      if (input.repoId) {
        await tx.repo.findFirstOrThrow({
          where: { id: input.repoId, organizationId: input.organizationId },
          select: { id: true },
        });
      }

      const project = await tx.project.create({
        data: {
          name: input.name,
          organizationId: input.organizationId,
          ...(input.repoId && { repoId: input.repoId }),
        },
        include: PROJECT_INCLUDE,
      });

      const event = await eventService.create(
        {
          organizationId: input.organizationId,
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
    actorType: ActorType,
    actorId: string,
  ) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const project = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { organizationId: true },
      });
      await assertActorOrgAccess(tx, project.organizationId, actorType, actorId);

      const joinOps: Record<EntityType, () => Promise<unknown>> = {
        session: async () => {
          await tx.session.findFirstOrThrow({
            where: { id: entityId, organizationId: project.organizationId },
            select: { id: true },
          });
          return tx.sessionProject.create({ data: { sessionId: entityId, projectId } });
        },
        ticket: async () => {
          await tx.ticket.findFirstOrThrow({
            where: { id: entityId, organizationId: project.organizationId },
            select: { id: true },
          });
          return tx.ticketProject.create({ data: { ticketId: entityId, projectId } });
        },
        channel: async () => {
          await tx.channel.findFirstOrThrow({
            where: { id: entityId, organizationId: project.organizationId },
            select: { id: true },
          });
          return tx.channelProject.create({ data: { channelId: entityId, projectId } });
        },
        chat: () => {
          throw new Error("Chats cannot be linked to projects");
        },
        message: () => {
          throw new Error("Messages cannot be linked to projects");
        },
      };

      await joinOps[entityType]();

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

      return tx.project.findUniqueOrThrow({
        where: { id: projectId },
        include: PROJECT_INCLUDE,
      });
    });
  }
}

export const organizationService = new OrganizationService();
