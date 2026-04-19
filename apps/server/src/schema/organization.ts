import type { Context } from "../context.js";
import type {
  CreateRepoInput,
  UpdateRepoInput,
  CreateProjectInput,
  EntityType,
  UserRole,
} from "@trace/gql";
import { organizationService } from "../services/organization.js";
import { webhookService } from "../services/webhook.js";
import { orgMemberService } from "../services/org-member.js";
import { requireOrgContext } from "../lib/require-org.js";
export const organizationQueries = {
  organization: (_: unknown, args: { id: string }, ctx: Context) =>
    organizationService.getOrganization(args.id, ctx.userId),
  myOrganizations: async (_: unknown, _args: Record<string, never>, ctx: Context) => {
    return orgMemberService.getUserOrgs(ctx.userId);
  },
  searchUsers: async (_: unknown, args: { query: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    await orgMemberService.assertAdmin(ctx.userId, orgId);
    return organizationService.searchUsers(args.query.trim(), orgId);
  },
  repos: (_: unknown, args: { organizationId: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    if (args.organizationId !== orgId) {
      throw new Error("Not authorized for this organization");
    }
    return organizationService.listRepos(args.organizationId);
  },
  repo: (_: unknown, args: { id: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return organizationService.getRepo(args.id, orgId);
  },
  projects: (_: unknown, args: { organizationId: string; repoId?: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    if (args.organizationId !== orgId) {
      throw new Error("Not authorized for this organization");
    }
    return organizationService.listProjects(args.organizationId, args.repoId);
  },
  project: (_: unknown, args: { id: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return organizationService.getProject(args.id, orgId);
  },
};

export const organizationMutations = {
  createRepo: (_: unknown, args: { input: CreateRepoInput }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    if (args.input.organizationId !== orgId) {
      throw new Error("Not authorized for this organization");
    }
    return organizationService.createRepo(args.input, orgId, ctx.actorType, ctx.userId);
  },
  updateRepo: (_: unknown, args: { id: string; input: UpdateRepoInput }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return organizationService.updateRepo(args.id, orgId, args.input, ctx.actorType, ctx.userId);
  },
  createProject: (_: unknown, args: { input: CreateProjectInput }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    if (args.input.organizationId !== orgId) {
      throw new Error("Not authorized for this organization");
    }
    return organizationService.createProject(args.input, orgId, ctx.actorType, ctx.userId);
  },
  linkEntityToProject: (
    _: unknown,
    args: { entityType: EntityType; entityId: string; projectId: string },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);
    return organizationService.linkEntityToProject(
      args.entityType,
      args.entityId,
      args.projectId,
      orgId,
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
    await orgMemberService.assertAdmin(ctx.userId, args.organizationId);
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
    await orgMemberService.assertAdmin(ctx.userId, args.organizationId);
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
    await orgMemberService.assertAdmin(ctx.userId, args.organizationId);
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
    user: async (member: {
      userId: string;
      user?: { id: string; name: string; email: string; avatarUrl: string | null };
    }) => {
      if (member.user) return member.user;
      return organizationService.getUserProfile(member.userId);
    },
    organization: async (member: {
      organizationId: string;
      organization?: { id: string; name: string };
    }) => {
      if (member.organization) return member.organization;
      return organizationService.getOrganizationSummary(member.organizationId);
    },
  },
};

export const repoResolvers = {
  Repo: {
    webhookActive: (repo: { webhookId?: string | null }) => !!repo.webhookId,
  },
};
