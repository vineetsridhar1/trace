import type {
  CreateOrganizationInput,
  CreateRepoInput,
  UpdateRepoInput,
  CreateProjectInput,
  UpdateProjectInput,
  EntityType,
  ActorType,
  UserRole,
} from "@trace/gql";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { TRACE_AI_EMAIL, TRACE_AI_NAME, TRACE_AI_USER_ID } from "../lib/ai-user.js";
import { eventService } from "./event.js";
import { assertActorOrgAccess } from "./actor-auth.js";
import { isLocalMode } from "../lib/mode.js";

const USER_SELECT = { id: true, email: true, name: true, avatarUrl: true } as const;

const PROJECT_INCLUDE = {
  repo: true,
  channels: { include: { channel: { include: { repo: true } } } },
  sessions: { include: { session: { include: { createdBy: { select: USER_SELECT }, repo: true } } } },
  tickets: {
    include: {
      ticket: {
        include: {
          createdBy: { select: USER_SELECT },
          assignees: { include: { user: { select: USER_SELECT } } },
          links: true,
        },
      },
    },
  },
  members: {
    where: { leftAt: null },
    include: { user: { select: USER_SELECT } },
  },
} as const;

type ProjectWithRelations = Prisma.ProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>;
type ProjectUser = { id: string; email: string; name: string | null; avatarUrl: string | null };

type ProjectMemberWithUser = {
  userId: string;
  role: UserRole;
  joinedAt: Date;
  leftAt: Date | null;
  user: ProjectUser;
};

function dateToJson(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function userPayload(user: ProjectUser): Prisma.InputJsonObject {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? "",
    avatarUrl: user.avatarUrl,
    organizations: [],
  };
}

function repoPayload(repo: NonNullable<ProjectWithRelations["repo"]>): Prisma.InputJsonObject {
  return {
    id: repo.id,
    name: repo.name,
    remoteUrl: repo.remoteUrl,
    defaultBranch: repo.defaultBranch,
    webhookActive: Boolean(repo.webhookId),
    projects: [],
    sessions: [],
  };
}

function projectMemberPayload(member: ProjectMemberWithUser): Prisma.InputJsonObject {
  return {
    user: userPayload(member.user),
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
    leftAt: member.leftAt ? member.leftAt.toISOString() : null,
  };
}

function channelPayload(
  channel: ProjectWithRelations["channels"][number]["channel"],
): Prisma.InputJsonObject {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    position: channel.position,
    groupId: channel.groupId,
    baseBranch: channel.baseBranch,
    repo: channel.repo ? repoPayload(channel.repo) : null,
    aiMode: channel.aiMode,
    setupScript: channel.setupScript,
    runScripts: channel.runScripts ?? null,
    members: [],
    projects: [],
    messages: [],
  };
}

function sessionPayload(
  session: ProjectWithRelations["sessions"][number]["session"],
): Prisma.InputJsonObject {
  return {
    id: session.id,
    name: session.name,
    agentStatus: session.agentStatus,
    sessionStatus: session.sessionStatus,
    tool: session.tool,
    model: session.model,
    reasoningEffort: session.reasoningEffort,
    hosting: session.hosting,
    createdBy: userPayload(session.createdBy),
    repo: session.repo ? repoPayload(session.repo) : null,
    branch: session.branch,
    workdir: session.workdir,
    toolSessionId: session.toolSessionId,
    channel: null,
    sessionGroupId: session.sessionGroupId,
    sessionGroup: null,
    gitCheckpoints: [],
    projects: [],
    tickets: [],
    endpoints: session.endpoints ?? null,
    connection: session.connection ?? null,
    prUrl: session.prUrl,
    worktreeDeleted: session.worktreeDeleted,
    lastUserMessageAt: dateToJson(session.lastUserMessageAt),
    lastMessageAt: dateToJson(session.lastMessageAt),
    queuedMessages: [],
    createdAt: dateToJson(session.createdAt),
    updatedAt: dateToJson(session.updatedAt),
  };
}

function ticketPayload(ticket: ProjectWithRelations["tickets"][number]["ticket"]): Prisma.InputJsonObject {
  return {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    createdBy: userPayload(ticket.createdBy),
    assignees: ticket.assignees.map((assignee) => userPayload(assignee.user)),
    labels: ticket.labels,
    origin: null,
    channel: null,
    aiMode: ticket.aiMode,
    projects: [],
    sessions: [],
    links: ticket.links.map((link) => ({
      id: link.id,
      entityType: link.entityType,
      entityId: link.entityId,
      createdAt: dateToJson(link.createdAt),
    })),
    createdAt: dateToJson(ticket.createdAt),
    updatedAt: dateToJson(ticket.updatedAt),
  };
}

function projectPayload(
  project: ProjectWithRelations,
  members: Prisma.InputJsonObject[] = project.members.map(projectMemberPayload),
): Prisma.InputJsonObject {
  return {
    id: project.id,
    name: project.name,
    organizationId: project.organizationId,
    repoId: project.repoId,
    repo: project.repo ? repoPayload(project.repo) : null,
    aiMode: project.aiMode,
    soulFile: project.soulFile,
    members,
    channels: project.channels.map((link) => channelPayload(link.channel)),
    sessions: project.sessions.map((link) => sessionPayload(link.session)),
    tickets: project.tickets.map((link) => ticketPayload(link.ticket)),
    createdAt: dateToJson(project.createdAt),
    updatedAt: dateToJson(project.updatedAt),
  };
}

async function assertActorProjectAdmin(
  tx: Prisma.TransactionClient,
  projectId: string,
  organizationId: string,
  actorType: ActorType,
  actorId: string,
): Promise<void> {
  if (actorType === "system") return;
  if (actorType === "agent") {
    throw new Error("Only project admins can perform this action");
  }

  const orgMember = await tx.orgMember.findUniqueOrThrow({
    where: { userId_organizationId: { userId: actorId, organizationId } },
    select: { userId: true, role: true },
  });
  if (orgMember.role === "admin") return;

  const projectMember = await tx.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: actorId } },
    select: { role: true, leftAt: true },
  });
  if (projectMember?.role === "admin" && projectMember.leftAt === null) return;

  throw new Error("Only project admins can perform this action");
}

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

  async createOrganization(input: CreateOrganizationInput, actorId: string) {
    const name = input.name.trim();
    if (!name) {
      throw new Error("Organization name is required");
    }

    if (!isLocalMode()) {
      const existingMemberships = await prisma.orgMember.count({
        where: { userId: actorId },
      });
      if (existingMemberships === 0) {
        throw new Error("You must be invited to an organization before creating one.");
      }
    }

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
  }

  async createRepo(input: CreateRepoInput, actorType: ActorType, actorId: string) {
    await prisma.$transaction((tx: Prisma.TransactionClient) =>
      assertActorOrgAccess(tx, input.organizationId, actorType, actorId),
    );

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

    const [repo] = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const repo = await tx.repo.create({
        data: {
          name: input.name,
          remoteUrl: input.remoteUrl,
          defaultBranch: input.defaultBranch ?? "main",
          organizationId: input.organizationId,
        },
        include: { projects: true, sessions: true },
      });

      const event = await eventService.create(
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

  async createProject(input: CreateProjectInput, actorType: ActorType, actorId: string) {
    const name = input.name.trim();
    if (!name) {
      throw new Error("Project name is required");
    }

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
          name,
          organizationId: input.organizationId,
          ...(input.repoId && { repoId: input.repoId }),
          ...(actorType === "user" && {
            members: { create: { userId: actorId, role: "admin" } },
          }),
        },
        include: PROJECT_INCLUDE,
      });

      const projectEvent = await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "project",
          scopeId: project.id,
          eventType: "project_created",
          payload: { project: projectPayload(project) },
          actorType,
          actorId,
        },
        tx,
      );

      const compatibilityEvent = await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "system",
          scopeId: project.id,
          eventType: "entity_linked",
          payload: { type: "project_created", projectId: project.id, name },
          actorType,
          actorId,
        },
        tx,
      );

      return [project, projectEvent, compatibilityEvent] as const;
    });

    return project;
  }

  async updateProject(
    id: string,
    organizationId: string,
    input: UpdateProjectInput,
    actorType: ActorType,
    actorId: string,
  ) {
    const name = input.name?.trim();
    if (input.name != null && !name) {
      throw new Error("Project name is required");
    }

    const [project] = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertActorOrgAccess(tx, organizationId, actorType, actorId);

      const existingProject = await tx.project.findFirstOrThrow({
        where: { id, organizationId },
        select: { id: true },
      });

      if (input.repoId) {
        await tx.repo.findFirstOrThrow({
          where: { id: input.repoId, organizationId },
          select: { id: true },
        });
      }

      const updateData: Prisma.ProjectUncheckedUpdateInput = {};
      if (name != null) updateData.name = name;
      if (input.repoId !== undefined) updateData.repoId = input.repoId;
      if (input.aiMode !== undefined) updateData.aiMode = input.aiMode;
      if (input.soulFile != null) updateData.soulFile = input.soulFile;

      const project = (await tx.project.update({
        where: { id: existingProject.id },
        data: updateData,
        include: PROJECT_INCLUDE,
      })) as ProjectWithRelations;

      await eventService.create(
        {
          organizationId,
          scopeType: "project",
          scopeId: project.id,
          eventType: "project_updated",
          payload: { project: projectPayload(project) },
          actorType,
          actorId,
        },
        tx,
      );

      return [project] as const;
    });

    return project;
  }

  async addProjectMember(
    projectId: string,
    userId: string,
    role: UserRole,
    actorType: ActorType,
    actorId: string,
  ) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const project = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { organizationId: true },
      });
      await assertActorProjectAdmin(tx, projectId, project.organizationId, actorType, actorId);
      await tx.orgMember.findUniqueOrThrow({
        where: {
          userId_organizationId: {
            userId,
            organizationId: project.organizationId,
          },
        },
        select: { userId: true },
      });

      const joinedAt = new Date();
      const member = await tx.projectMember.upsert({
        where: { projectId_userId: { projectId, userId } },
        update: { role, joinedAt, leftAt: null },
        create: { projectId, userId, role, joinedAt },
        include: {
          user: { select: { id: true, email: true, name: true, avatarUrl: true } },
        },
      });

      await eventService.create(
        {
          organizationId: project.organizationId,
          scopeType: "project",
          scopeId: projectId,
          eventType: "project_member_added",
          payload: {
            projectId,
            member: projectMemberPayload(member),
          },
          actorType,
          actorId,
        },
        tx,
      );

      return member;
    });
  }

  async removeProjectMember(
    projectId: string,
    userId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const project = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { organizationId: true },
      });
      await assertActorProjectAdmin(tx, projectId, project.organizationId, actorType, actorId);

      const leftAt = new Date();
      const member = await tx.projectMember.update({
        where: { projectId_userId: { projectId, userId } },
        data: { leftAt },
        include: {
          user: { select: { id: true, email: true, name: true, avatarUrl: true } },
        },
      });

      await eventService.create(
        {
          organizationId: project.organizationId,
          scopeType: "project",
          scopeId: projectId,
          eventType: "project_member_removed",
          payload: {
            projectId,
            userId,
            leftAt: leftAt.toISOString(),
          },
          actorType,
          actorId,
        },
        tx,
      );

      return member;
    });
  }

  async getProjectMembers(projectId: string) {
    return prisma.projectMember.findMany({
      where: { projectId, leftAt: null },
      include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
    });
  }

  async getProjectChannels(projectId: string) {
    const links = await prisma.channelProject.findMany({
      where: { projectId },
      include: { channel: true },
    });
    return links.map((link) => link.channel);
  }

  async getProjectSessions(projectId: string) {
    const links = await prisma.sessionProject.findMany({
      where: { projectId },
      include: { session: true },
    });
    return links.map((link) => link.session);
  }

  async getProjectTickets(projectId: string) {
    const links = await prisma.ticketProject.findMany({
      where: { projectId },
      include: { ticket: true },
    });
    return links.map((link) => link.ticket);
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

      const updatedProject = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        include: PROJECT_INCLUDE,
      });

      await eventService.create(
        {
          organizationId: project.organizationId,
          scopeType: "project",
          scopeId: projectId,
          eventType: "entity_linked",
          payload: {
            entityType,
            entityId,
            projectId,
            project: projectPayload(updatedProject),
          },
          actorType,
          actorId,
        },
        tx,
      );

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

      return updatedProject;
    });
  }
}

export const organizationService = new OrganizationService();
