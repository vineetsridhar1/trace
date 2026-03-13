import type { Context } from "../context.js";
import type { CreateRepoInput, CreateProjectInput, EntityType } from "@trace/gql";
import { prisma } from "../lib/db.js";

const projectInclude = {
  repo: true,
  channels: { include: { channel: true } },
  sessions: { include: { session: true } },
  tickets: { include: { ticket: true } },
} as const;

export const organizationQueries = {
  organization: (_: unknown, args: { id: string }, _ctx: Context) => {
    return prisma.organization.findUnique({
      where: { id: args.id },
      include: { members: true, repos: true, projects: true, channels: true },
    });
  },
  repos: (_: unknown, args: { organizationId: string }, _ctx: Context) => {
    return prisma.repo.findMany({
      where: { organizationId: args.organizationId },
      include: { projects: true, sessions: true },
    });
  },
  repo: (_: unknown, args: { id: string }, _ctx: Context) => {
    return prisma.repo.findUnique({
      where: { id: args.id },
      include: { projects: true, sessions: true },
    });
  },
  projects: (_: unknown, args: { organizationId: string; repoId?: string }, _ctx: Context) => {
    return prisma.project.findMany({
      where: { organizationId: args.organizationId, ...(args.repoId && { repoId: args.repoId }) },
      include: projectInclude,
    });
  },
  project: (_: unknown, args: { id: string }, _ctx: Context) => {
    return prisma.project.findUnique({
      where: { id: args.id },
      include: projectInclude,
    });
  },
};

export const organizationMutations = {
  createRepo: (_: unknown, args: { input: CreateRepoInput }, _ctx: Context) => {
    return prisma.repo.create({
      data: {
        name: args.input.name,
        remoteUrl: args.input.remoteUrl,
        defaultBranch: args.input.defaultBranch ?? "main",
        organizationId: args.input.organizationId,
      },
      include: { projects: true, sessions: true },
    });
  },
  createProject: (_: unknown, args: { input: CreateProjectInput }, _ctx: Context) => {
    return prisma.project.create({
      data: {
        name: args.input.name,
        organizationId: args.input.organizationId,
        ...(args.input.repoId && { repoId: args.input.repoId }),
      },
      include: projectInclude,
    });
  },
  linkEntityToProject: (_: unknown, args: { entityType: EntityType; entityId: string; projectId: string }, _ctx: Context) => {
    const joinOps: Record<EntityType, () => Promise<unknown>> = {
      session: () => prisma.sessionProject.create({ data: { sessionId: args.entityId, projectId: args.projectId } }),
      ticket: () => prisma.ticketProject.create({ data: { ticketId: args.entityId, projectId: args.projectId } }),
      channel: () => prisma.channelProject.create({ data: { channelId: args.entityId, projectId: args.projectId } }),
    };
    return joinOps[args.entityType]().then(() =>
      prisma.project.findUniqueOrThrow({
        where: { id: args.projectId },
        include: projectInclude,
      }),
    );
  },
};
