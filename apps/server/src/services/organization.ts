import type { CreateRepoInput, CreateProjectInput, EntityType, ActorType } from "@trace/gql";
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
        eventType: "entity_linked",
        payload: { type: "repo_created", repoId: repo.id, name: repo.name },
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
