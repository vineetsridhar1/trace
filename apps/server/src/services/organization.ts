import type { CreateRepoInput, UpdateRepoInput, CreateProjectInput, EntityType, ActorType } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";

const PROJECT_INCLUDE = {
  repo: true,
  channels: { include: { channel: true } },
  sessions: { include: { session: true } },
  tickets: { include: { ticket: true } },
} as const;

export class OrganizationService {
  async createRepo(input: CreateRepoInput, actorType: ActorType, actorId: string) {
    // Deduplicate by remote URL within the org — if it already exists, return it
    const existing = await prisma.repo.findUnique({
      where: {
        organizationId_remoteUrl: {
          organizationId: input.organizationId,
          remoteUrl: input.remoteUrl,
        },
      },
      include: { projects: true, sessions: true },
    });

    if (existing) return existing;

    const [repo] = await prisma.$transaction(async (tx) => {
      const repo = await tx.repo.create({
        data: {
          name: input.name,
          remoteUrl: input.remoteUrl,
          defaultBranch: input.defaultBranch ?? "main",
          organizationId: input.organizationId,
        },
        include: { projects: true, sessions: true },
      });

      const event = await eventService.create({
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
          },
        },
        actorType,
        actorId,
      }, tx);

      return [repo, event] as const;
    });

    return repo;
  }

  async updateRepo(id: string, organizationId: string, input: UpdateRepoInput, actorType: ActorType, actorId: string) {
    const [repo] = await prisma.$transaction(async (tx) => {
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

      const event = await eventService.create({
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
          },
        },
        actorType,
        actorId,
      }, tx);

      return [repo, event] as const;
    });

    return repo;
  }

  async createProject(input: CreateProjectInput, actorType: ActorType, actorId: string) {
    const [project] = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: input.name,
          organizationId: input.organizationId,
          ...(input.repoId && { repoId: input.repoId }),
        },
        include: PROJECT_INCLUDE,
      });

      const event = await eventService.create({
        organizationId: input.organizationId,
        scopeType: "system",
        scopeId: project.id,
        eventType: "entity_linked",
        payload: { type: "project_created", projectId: project.id, name: project.name },
        actorType,
        actorId,
      }, tx);

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
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { organizationId: true },
      });

      const joinOps: Record<EntityType, () => Promise<unknown>> = {
        session: () => tx.sessionProject.create({ data: { sessionId: entityId, projectId } }),
        ticket: () => tx.ticketProject.create({ data: { ticketId: entityId, projectId } }),
        channel: () => tx.channelProject.create({ data: { channelId: entityId, projectId } }),
      };

      await joinOps[entityType]();

      await eventService.create({
        organizationId: project.organizationId,
        scopeType: "system",
        scopeId: projectId,
        eventType: "entity_linked",
        payload: { entityType, entityId, projectId },
        actorType,
        actorId,
      }, tx);

      return tx.project.findUniqueOrThrow({
        where: { id: projectId },
        include: PROJECT_INCLUDE,
      });
    });
  }
}

export const organizationService = new OrganizationService();
