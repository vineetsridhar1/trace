import type {
  CreateOrganizationInput,
  CreateRepoInput,
  UpdateRepoInput,
  CreateProjectInput,
  EntityType,
  ActorType,
} from "@trace/gql";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { TRACE_AI_EMAIL, TRACE_AI_NAME, TRACE_AI_USER_ID } from "../lib/ai-user.js";
import { eventService } from "./event.js";
import { assertActorOrgAccess } from "./actor-auth.js";
import { createChannelInTransaction } from "./channel-create.js";
import { repoApplicationConfigService } from "./repo-application-config.js";
import { loadCloudConfig, seedCloudForOrg } from "./cloud-bootstrap.js";
import { isLocalMode } from "../lib/mode.js";
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
    // Managed repos are durability plumbing for design/app sessions — hide them
    // from normal repo lists and pickers. Session services resolve
    // them directly by id and are unaffected by this filter.
    return prisma.repo.findMany({
      where: { organizationId, provider: "github" },
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

  async listProjectsForChannels(channelIds: readonly string[], organizationId: string) {
    return prisma.channelProject.findMany({
      where: {
        channelId: { in: [...channelIds] },
        project: { organizationId },
      },
      select: {
        channelId: true,
        project: { include: { repo: true } },
      },
    });
  }

  async listProjectsForSessions(sessionIds: readonly string[], organizationId: string) {
    return prisma.sessionProject.findMany({
      where: {
        sessionId: { in: [...sessionIds] },
        project: { organizationId },
      },
      select: {
        sessionId: true,
        project: { include: { repo: true } },
      },
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

  async createOrganization(input: CreateOrganizationInput, actorId: string) {
    const name = input.name.trim();
    if (!name) {
      throw new Error("Organization name is required");
    }

    const member = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.findUniqueOrThrow({
        where: { id: actorId },
        select: { id: true },
      });
      await tx.user.upsert({
        where: { id: TRACE_AI_USER_ID },
        update: {
          email: TRACE_AI_EMAIL,
          name: TRACE_AI_NAME,
          avatarUrl: null,
          githubId: null,
        },
        create: {
          id: TRACE_AI_USER_ID,
          email: TRACE_AI_EMAIL,
          name: TRACE_AI_NAME,
        },
        select: { id: true },
      });

      const organization = await tx.organization.create({
        data: { name },
        select: { id: true, name: true },
      });

      const member = await tx.orgMember.create({
        data: {
          userId: actorId,
          organizationId: organization.id,
          role: "admin",
        },
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          organization: { select: { id: true, name: true } },
        },
      });

      await tx.orgMember.create({
        data: {
          userId: TRACE_AI_USER_ID,
          organizationId: organization.id,
          role: "member",
        },
      });

      await eventService.create(
        {
          organizationId: organization.id,
          scopeType: "system",
          scopeId: organization.id,
          eventType: "organization_created",
          payload: {
            organization,
            member: {
              userId: actorId,
              role: "admin",
            },
          },
          actorType: "user",
          actorId,
        },
        tx,
      );

      return member;
    });

    // Inherit the shared cloud (if configured) so the new org can host cloud
    // sessions immediately. Runs after commit so it never blocks org creation.
    const cloudConfig = loadCloudConfig();
    if (cloudConfig && !isLocalMode()) {
      await seedCloudForOrg(member.organizationId, cloudConfig).catch((err: unknown) => {
        console.error(
          `[cloud-config] failed to seed cloud for new org ${member.organizationId}: ${(err as Error).message}`,
        );
      });
    }

    return member;
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
                provider: repo.provider,
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
    const name = input.name?.trim();
    const defaultBranch = input.defaultBranch?.trim();
    const remoteUrl = input.remoteUrl === undefined ? undefined : input.remoteUrl?.trim() || null;
    if (input.name != null && !name) throw new ValidationError("Repository name is required");
    if (input.defaultBranch != null && !defaultBranch) {
      throw new ValidationError("Default branch is required");
    }

    const [repo] = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Verify repo belongs to caller's org before updating
      const existing = await tx.repo.findFirstOrThrow({
        where: { id, organizationId },
        select: { id: true, setupConfig: true, remoteUrl: true, webhookId: true },
      });

      if (remoteUrl !== undefined && remoteUrl !== existing.remoteUrl && existing.webhookId) {
        throw new ValidationError(
          "Disconnect the repository webhook before changing its remote URL",
        );
      }

      const repo = await tx.repo.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(remoteUrl !== undefined && { remoteUrl }),
          ...(defaultBranch !== undefined && { defaultBranch }),
          ...(input.applicationConfig != null && {
            setupConfig: repoApplicationConfigService.mergeIntoSetupConfig(
              existing.setupConfig,
              input.applicationConfig,
            ),
          }),
        },
        include: { projects: true, sessions: true },
      });

      const applicationConfig = repoApplicationConfigService.parseApplicationConfig(
        repo.setupConfig,
      );

      const event = await eventService.create(
        {
          organizationId: repo.organizationId,
          scopeType: "system",
          scopeId: repo.id,
          eventType:
            input.applicationConfig != null ? "application_config_updated" : "repo_updated",
          payload: {
            repo: {
              id: repo.id,
              name: repo.name,
              provider: repo.provider,
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

  async attachRepoRemote(
    id: string,
    organizationId: string,
    remoteUrlInput: string,
    actorType: ActorType,
    actorId: string,
  ) {
    const remoteUrl = remoteUrlInput.trim();
    if (!remoteUrl) throw new ValidationError("Remote URL is required");

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.repo.findFirstOrThrow({
        where: { id, organizationId },
        select: { id: true, remoteUrl: true },
      });

      if (existing.remoteUrl) {
        if (existing.remoteUrl !== remoteUrl) {
          throw new ValidationError(
            "Repository already has a remote URL; remove it before attaching another",
          );
        }
        return tx.repo.findUniqueOrThrow({
          where: { id },
          include: { projects: true, sessions: true },
        });
      }

      const duplicate = await tx.repo.findUnique({
        where: { organizationId_remoteUrl: { organizationId, remoteUrl } },
        select: { id: true },
      });
      if (duplicate) {
        throw new ValidationError("Another repository in this organization uses that remote URL");
      }

      const result = await tx.repo.updateMany({
        where: { id, organizationId, remoteUrl: null },
        data: { remoteUrl },
      });
      const repo = await tx.repo.findUniqueOrThrow({
        where: { id },
        include: { projects: true, sessions: true },
      });
      if (result.count === 0) {
        if (repo.remoteUrl !== remoteUrl) {
          throw new ValidationError(
            "Repository already has a remote URL; remove it before attaching another",
          );
        }
        return repo;
      }
      const applicationConfig = repoApplicationConfigService.parseApplicationConfig(
        repo.setupConfig,
      );

      await eventService.create(
        {
          organizationId: repo.organizationId,
          scopeType: "system",
          scopeId: repo.id,
          eventType: "repo_updated",
          payload: {
            repo: {
              id: repo.id,
              name: repo.name,
              provider: repo.provider,
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

      return repo;
    });
  }

  async deleteRepo(
    id: string,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ): Promise<boolean> {
    const event = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const repo = await tx.repo.findFirstOrThrow({
        where: { id, organizationId, provider: "github" },
        select: {
          id: true,
          channels: { select: { id: true } },
          projects: { select: { id: true } },
          sessions: { select: { id: true } },
          sessionGroups: { select: { id: true } },
        },
      });

      await Promise.all([
        tx.channel.updateMany({ where: { repoId: id }, data: { repoId: null } }),
        tx.project.updateMany({ where: { repoId: id }, data: { repoId: null } }),
        tx.session.updateMany({ where: { repoId: id }, data: { repoId: null } }),
        tx.sessionGroup.updateMany({ where: { repoId: id }, data: { repoId: null } }),
      ]);
      await tx.repo.delete({ where: { id } });

      return eventService.create(
        {
          organizationId,
          scopeType: "system",
          scopeId: id,
          eventType: "repo_deleted",
          payload: {
            repoId: id,
            channelIds: repo.channels.map(({ id: entityId }) => entityId),
            projectIds: repo.projects.map(({ id: entityId }) => entityId),
            sessionIds: repo.sessions.map(({ id: entityId }) => entityId),
            sessionGroupIds: repo.sessionGroups.map(({ id: entityId }) => entityId),
          },
          actorType,
          actorId,
          deferPublish: true,
        },
        tx,
      );
    });

    eventService.publishCreated(event);
    return true;
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
