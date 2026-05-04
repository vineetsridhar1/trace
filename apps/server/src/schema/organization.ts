import type { Context } from "../context.js";
import type {
  CreateOrganizationInput,
  CreateRepoInput,
  UpdateRepoInput,
  CreateProjectInput,
  CreateProjectFromGoalInput,
  CreateProjectRunInput,
  UpdateProjectInput,
  UpdateProjectRunInput,
  AddProjectMemberInput,
  RemoveProjectMemberInput,
  EntityType,
  UserRole,
} from "@trace/gql";
import { organizationService } from "../services/organization.js";
import { projectRunService } from "../services/project-run.js";
import { agentEnvironmentService } from "../services/agent-environment.js";
import { webhookService } from "../services/webhook.js";
import { orgMemberService } from "../services/org-member.js";
import { assertOrgAccess, requireOrgContext } from "../lib/require-org.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { assertScopeAccess } from "../services/access.js";
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
  projectRuns: (_: unknown, args: { projectId: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return projectRunService.listProjectRuns(args.projectId, orgId);
  },
};

export const organizationMutations = {
  createOrganization: (_: unknown, args: { input: CreateOrganizationInput }, ctx: Context) => {
    return organizationService.createOrganization(args.input, ctx.userId);
  },
  createRepo: (_: unknown, args: { input: CreateRepoInput }, ctx: Context) => {
    assertOrgAccess(ctx, args.input.organizationId);
    return organizationService.createRepo(args.input, ctx.actorType, ctx.userId);
  },
  updateRepo: (_: unknown, args: { id: string; input: UpdateRepoInput }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return organizationService.updateRepo(args.id, orgId, args.input, ctx.actorType, ctx.userId);
  },
  createProject: (_: unknown, args: { input: CreateProjectInput }, ctx: Context) => {
    assertOrgAccess(ctx, args.input.organizationId);
    return organizationService.createProject(args.input, ctx.actorType, ctx.userId);
  },
  updateProject: (_: unknown, args: { id: string; input: UpdateProjectInput }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return organizationService.updateProject(args.id, orgId, args.input, ctx.actorType, ctx.userId);
  },
  createProjectFromGoal: (
    _: unknown,
    args: { input: CreateProjectFromGoalInput },
    ctx: Context,
  ) => {
    assertOrgAccess(ctx, args.input.organizationId);
    return projectRunService.createProjectFromGoal(args.input, ctx.actorType, ctx.userId);
  },
  createProjectRun: (_: unknown, args: { input: CreateProjectRunInput }, ctx: Context) => {
    return projectRunService.createProjectRun(args.input, ctx.actorType, ctx.userId);
  },
  updateProjectRun: (
    _: unknown,
    args: { id: string; input: UpdateProjectRunInput },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);
    return projectRunService.updateProjectRun(
      args.id,
      orgId,
      args.input,
      ctx.actorType,
      ctx.userId,
    );
  },
  addProjectMember: (_: unknown, args: { input: AddProjectMemberInput }, ctx: Context) => {
    return organizationService.addProjectMember(
      args.input.projectId,
      args.input.userId,
      args.input.role ?? "member",
      ctx.actorType,
      ctx.userId,
    );
  },
  removeProjectMember: async (
    _: unknown,
    args: { input: RemoveProjectMemberInput },
    ctx: Context,
  ) => {
    await organizationService.removeProjectMember(
      args.input.projectId,
      args.input.userId,
      ctx.actorType,
      ctx.userId,
    );
    return true;
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

export const projectSubscriptions = {
  projectEvents: {
    subscribe: async (
      _: unknown,
      args: { projectId: string; organizationId: string },
      ctx: Context,
    ) => {
      const orgId = requireOrgContext(ctx);
      if (orgId !== args.organizationId) {
        throw new Error("Not authorized for this organization");
      }
      await assertScopeAccess("project", args.projectId, ctx.userId, orgId);
      return pubsub.asyncIterator(topics.projectEvents(args.projectId));
    },
  },
};

type ProjectMemberRow = {
  userId: string;
  user?: { id: string; name: string; email: string; avatarUrl: string | null };
  role: UserRole;
  joinedAt: Date;
  leftAt?: Date | null;
};

type ProjectRelationRow<T> = {
  [key: string]: T | undefined;
};

export const organizationTypeResolvers = {
  Organization: {
    members: (org: { id: string }) => {
      return orgMemberService.getMembers(org.id);
    },
    agentEnvironments: (org: { id: string }, _args: unknown, ctx: Context) => {
      return agentEnvironmentService.list(org.id, ctx.actorType, ctx.userId);
    },
  },
  Project: {
    repo: (project: { repo?: unknown; repoId?: string | null }) => {
      if ("repo" in project) return project.repo ?? null;
      if (!project.repoId) return null;
      return organizationService.getRepoById(project.repoId);
    },
    members: (project: { id: string; members?: ProjectMemberRow[] }) => {
      if (project.members) return project.members;
      return organizationService.getProjectMembers(project.id);
    },
    channels: (project: { id: string; channels?: Array<ProjectRelationRow<unknown>> }) => {
      if (project.channels) return project.channels.map((link) => link.channel).filter(Boolean);
      return organizationService.getProjectChannels(project.id);
    },
    sessions: (project: { id: string; sessions?: Array<ProjectRelationRow<unknown>> }) => {
      if (project.sessions) return project.sessions.map((link) => link.session).filter(Boolean);
      return organizationService.getProjectSessions(project.id);
    },
    tickets: (project: { id: string; tickets?: Array<ProjectRelationRow<unknown>> }) => {
      if (project.tickets) return project.tickets.map((link) => link.ticket).filter(Boolean);
      return organizationService.getProjectTickets(project.id);
    },
    runs: (project: { id: string; runs?: unknown[] }) => {
      if (project.runs) return project.runs;
      return projectRunService.getProjectRunsForProject(project.id);
    },
  },
  ProjectMember: {
    user: async (member: ProjectMemberRow) => {
      if (member.user) return member.user;
      return organizationService.getUserProfile(member.userId);
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
