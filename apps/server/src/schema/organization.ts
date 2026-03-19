import type { Context } from "../context.js";
import type { CreateRepoInput, UpdateRepoInput, CreateProjectInput, EntityType } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { organizationService } from "../services/organization.js";
import { webhookService } from "../services/webhook.js";

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
  createRepo: (_: unknown, args: { input: CreateRepoInput }, ctx: Context) => {
    return organizationService.createRepo(args.input, ctx.actorType, ctx.userId);
  },
  updateRepo: (_: unknown, args: { id: string; input: UpdateRepoInput }, ctx: Context) => {
    return organizationService.updateRepo(args.id, ctx.organizationId, args.input, ctx.actorType, ctx.userId);
  },
  createProject: (_: unknown, args: { input: CreateProjectInput }, ctx: Context) => {
    return organizationService.createProject(args.input, ctx.actorType, ctx.userId);
  },
  linkEntityToProject: (_: unknown, args: { entityType: EntityType; entityId: string; projectId: string }, ctx: Context) => {
    return organizationService.linkEntityToProject(args.entityType, args.entityId, args.projectId, ctx.actorType, ctx.userId);
  },
  registerRepoWebhook: (_: unknown, args: { repoId: string }, ctx: Context) => {
    return webhookService.registerGitHubWebhook(args.repoId, ctx.userId);
  },
  unregisterRepoWebhook: (_: unknown, args: { repoId: string }, ctx: Context) => {
    return webhookService.unregisterGitHubWebhook(args.repoId, ctx.userId);
  },
};

export const repoResolvers = {
  Repo: {
    webhookActive: (repo: { webhookId?: string | null }) => !!repo.webhookId,
  },
};
