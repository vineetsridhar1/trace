import type { Context } from "../context.js";
import type { CreateRepoInput, UpdateRepoInput, CreateProjectInput, EntityType, UserRole } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { organizationService } from "../services/organization.js";
import { webhookService } from "../services/webhook.js";
import { orgMemberService } from "../services/org-member.js";
import { requireOrgContext } from "../lib/require-org.js";

const projectInclude = {
  repo: true,
  channels: { include: { channel: true } },
  sessions: { include: { session: true } },
  tickets: { include: { ticket: true } },
} as const;

export const organizationQueries = {
  organization: async (_: unknown, args: { id: string }, ctx: Context) => {
    // Verify the user is a member of this org
    await orgMemberService.assertMembership(ctx.userId, args.id);
    return prisma.organization.findUnique({
      where: { id: args.id },
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
  },
  myOrganizations: async (_: unknown, _args: Record<string, never>, ctx: Context) => {
    return orgMemberService.getUserOrgs(ctx.userId);
  },
  repos: (_: unknown, args: { organizationId: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    if (args.organizationId !== orgId) {
      throw new Error("Not authorized for this organization");
    }
    return prisma.repo.findMany({
      where: { organizationId: args.organizationId },
      include: { projects: true, sessions: true },
    });
  },
  repo: (_: unknown, args: { id: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return prisma.repo.findFirst({
      where: { id: args.id, organizationId: orgId },
      include: { projects: true, sessions: true },
    });
  },
  projects: (_: unknown, args: { organizationId: string; repoId?: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    if (args.organizationId !== orgId) {
      throw new Error("Not authorized for this organization");
    }
    return prisma.project.findMany({
      where: { organizationId: args.organizationId, ...(args.repoId && { repoId: args.repoId }) },
      include: projectInclude,
    });
  },
  project: (_: unknown, args: { id: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return prisma.project.findFirst({
      where: { id: args.id, organizationId: orgId },
      include: projectInclude,
    });
  },
};

export const organizationMutations = {
  createRepo: (_: unknown, args: { input: CreateRepoInput }, ctx: Context) => {
    return organizationService.createRepo(args.input, ctx.actorType, ctx.userId);
  },
  updateRepo: (_: unknown, args: { id: string; input: UpdateRepoInput }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return organizationService.updateRepo(
      args.id,
      orgId,
      args.input,
      ctx.actorType,
      ctx.userId,
    );
  },
  createProject: (_: unknown, args: { input: CreateProjectInput }, ctx: Context) => {
    return organizationService.createProject(args.input, ctx.actorType, ctx.userId);
  },
  linkEntityToProject: (
    _: unknown,
    args: { entityType: EntityType; entityId: string; projectId: string },
    ctx: Context,
  ) => {
    return organizationService.linkEntityToProject(
      args.entityType,
      args.entityId,
      args.projectId,
      ctx.actorType,
      ctx.userId,
    );
  },
  registerRepoWebhook: (_: unknown, args: { repoId: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return webhookService.registerGitHubWebhook(args.repoId, ctx.userId, orgId);
  },
  unregisterRepoWebhook: (_: unknown, args: { repoId: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return webhookService.unregisterGitHubWebhook(args.repoId, ctx.userId, orgId);
  },
  addOrgMember: async (
    _: unknown,
    args: { organizationId: string; userId: string; role?: UserRole },
    ctx: Context,
  ) => {
    // Only admins can add members
    await orgMemberService.assertMembership(ctx.userId, args.organizationId);
    return orgMemberService.addMember({
      organizationId: args.organizationId,
      userId: args.userId,
      role: args.role ?? "member",
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  removeOrgMember: async (
    _: unknown,
    args: { organizationId: string; userId: string },
    ctx: Context,
  ) => {
    await orgMemberService.assertMembership(ctx.userId, args.organizationId);
    return orgMemberService.removeMember({
      organizationId: args.organizationId,
      userId: args.userId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  updateOrgMemberRole: async (
    _: unknown,
    args: { organizationId: string; userId: string; role: UserRole },
    ctx: Context,
  ) => {
    await orgMemberService.assertMembership(ctx.userId, args.organizationId);
    return orgMemberService.updateRole({
      organizationId: args.organizationId,
      userId: args.userId,
      role: args.role,
    });
  },
};

export const organizationTypeResolvers = {
  Organization: {
    members: (org: { id: string }) => {
      return orgMemberService.getMembers(org.id);
    },
  },
  OrgMember: {
    user: async (member: { userId: string; user?: { id: string; name: string; email: string; avatarUrl: string | null } }) => {
      if (member.user) return member.user;
      return prisma.user.findUniqueOrThrow({
        where: { id: member.userId },
        select: { id: true, name: true, email: true, avatarUrl: true },
      });
    },
    organization: async (member: { organizationId: string; organization?: { id: string; name: string } }) => {
      if (member.organization) return member.organization;
      return prisma.organization.findUniqueOrThrow({
        where: { id: member.organizationId },
        select: { id: true, name: true },
      });
    },
  },
};

export const repoResolvers = {
  Repo: {
    webhookActive: (repo: { webhookId?: string | null }) => !!repo.webhookId,
  },
};
