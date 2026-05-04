import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { OrganizationService } from "./organization.js";

const prismaMock = prisma as any;
const eventServiceMock = eventService as any;
const projectTimestamp = new Date("2026-05-04T12:00:00.000Z");

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "user@example.com",
    name: "User",
    avatarUrl: null,
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    name: "Worker",
    agentStatus: "active",
    sessionStatus: "in_progress",
    tool: "codex",
    model: null,
    reasoningEffort: null,
    hosting: "local",
    createdBy: makeUser(),
    repo: null,
    branch: null,
    workdir: null,
    toolSessionId: null,
    sessionGroupId: null,
    endpoints: null,
    connection: null,
    prUrl: null,
    worktreeDeleted: false,
    lastUserMessageAt: null,
    lastMessageAt: null,
    createdAt: projectTimestamp,
    updatedAt: projectTimestamp,
    ...overrides,
  };
}

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "project-1",
    organizationId: "org-1",
    name: "Roadmap",
    repoId: null,
    repo: null,
    aiMode: null,
    soulFile: "",
    channels: [],
    sessions: [],
    tickets: [],
    members: [],
    createdAt: projectTimestamp,
    updatedAt: projectTimestamp,
    ...overrides,
  };
}

describe("OrganizationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValue({ userId: "user-1", role: "admin" });
    prismaMock.orgMember.count.mockResolvedValue(1);
  });

  it("creates organizations with the creator as admin and emits organization_created", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({ id: "user-1" });
    prismaMock.user.upsert.mockResolvedValueOnce({ id: "00000000-0000-4000-a000-000000000001" });
    prismaMock.organization.create.mockResolvedValueOnce({ id: "org-1", name: "Acme" });
    prismaMock.orgMember.create
      .mockResolvedValueOnce({
        organizationId: "org-1",
        userId: "user-1",
        role: "admin",
        organization: { id: "org-1", name: "Acme" },
      })
      .mockResolvedValueOnce({
        organizationId: "org-1",
        userId: "00000000-0000-4000-a000-000000000001",
        role: "member",
      });

    const service = new OrganizationService();
    const member = await service.createOrganization({ name: " Acme " }, "user-1");

    expect(member).toMatchObject({
      organizationId: "org-1",
      userId: "user-1",
      role: "admin",
      organization: { id: "org-1", name: "Acme" },
    });
    expect(prismaMock.organization.create).toHaveBeenCalledWith({
      data: { name: "Acme" },
      select: { id: true, name: true },
    });
    expect(prismaMock.user.upsert).toHaveBeenCalledWith({
      where: { id: "00000000-0000-4000-a000-000000000001" },
      update: {
        email: "ai@trace.dev",
        name: "Trace AI",
        avatarUrl: null,
        githubId: null,
      },
      create: {
        id: "00000000-0000-4000-a000-000000000001",
        email: "ai@trace.dev",
        name: "Trace AI",
      },
      select: { id: true },
    });
    expect(prismaMock.orgMember.create).toHaveBeenNthCalledWith(2, {
      data: {
        userId: "00000000-0000-4000-a000-000000000001",
        organizationId: "org-1",
        role: "member",
      },
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      {
        organizationId: "org-1",
        scopeType: "system",
        scopeId: "org-1",
        eventType: "organization_created",
        payload: {
          organization: { id: "org-1", name: "Acme" },
          member: {
            userId: "user-1",
            role: "admin",
          },
        },
        actorType: "user",
        actorId: "user-1",
      },
      prismaMock,
    );
  });

  it("rejects organization creation for users without an existing organization", async () => {
    prismaMock.orgMember.count.mockResolvedValueOnce(0);

    const service = new OrganizationService();
    await expect(service.createOrganization({ name: "Acme" }, "user-1")).rejects.toThrow(
      "You must be invited to an organization before creating one.",
    );

    expect(prismaMock.organization.create).not.toHaveBeenCalled();
    expect(prismaMock.orgMember.create).not.toHaveBeenCalled();
    expect(eventServiceMock.create).not.toHaveBeenCalled();
  });

  it("allows first organization creation in local mode", async () => {
    vi.stubEnv("TRACE_LOCAL_MODE", "1");
    prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({ id: "user-1" });
    prismaMock.user.upsert.mockResolvedValueOnce({ id: "00000000-0000-4000-a000-000000000001" });
    prismaMock.organization.create.mockResolvedValueOnce({ id: "org-1", name: "Local" });
    prismaMock.orgMember.create
      .mockResolvedValueOnce({
        organizationId: "org-1",
        userId: "user-1",
        role: "admin",
        organization: { id: "org-1", name: "Local" },
      })
      .mockResolvedValueOnce({
        organizationId: "org-1",
        userId: "00000000-0000-4000-a000-000000000001",
        role: "member",
      });

    const service = new OrganizationService();
    await expect(service.createOrganization({ name: "Local" }, "user-1")).resolves.toMatchObject({
      organizationId: "org-1",
      userId: "user-1",
      role: "admin",
    });
    expect(prismaMock.orgMember.count).not.toHaveBeenCalled();
  });

  it("deduplicates repos by remote url within an org", async () => {
    prismaMock.repo.findUnique.mockResolvedValueOnce({ id: "repo-1" });

    const service = new OrganizationService();
    await expect(
      service.createRepo(
        {
          organizationId: "org-1",
          name: "trace",
          remoteUrl: "https://github.com/acme/trace.git",
        } as any,
        "user",
        "user-1",
      ),
    ).resolves.toEqual({ id: "repo-1" });

    expect(prismaMock.repo.create).not.toHaveBeenCalled();
  });

  it("creates repos and emits repo_created events", async () => {
    prismaMock.repo.findUnique.mockResolvedValueOnce(null);
    prismaMock.repo.create.mockResolvedValueOnce({
      id: "repo-1",
      organizationId: "org-1",
      name: "trace",
      remoteUrl: "https://github.com/acme/trace.git",
      defaultBranch: "main",
      webhookId: null,
    });

    const service = new OrganizationService();
    const repo = await service.createRepo(
      {
        organizationId: "org-1",
        name: "trace",
        remoteUrl: "https://github.com/acme/trace.git",
      } as any,
      "user",
      "user-1",
    );

    expect(repo.id).toBe("repo-1");
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      {
        organizationId: "org-1",
        scopeType: "system",
        scopeId: "repo-1",
        eventType: "repo_created",
        payload: {
          repo: {
            id: "repo-1",
            name: "trace",
            remoteUrl: "https://github.com/acme/trace.git",
            defaultBranch: "main",
            webhookActive: false,
          },
        },
        actorType: "user",
        actorId: "user-1",
      },
      prismaMock,
    );
  });

  it("updates repos, creates projects, and links entities", async () => {
    prismaMock.repo.findFirstOrThrow.mockResolvedValueOnce({ id: "repo-1" });
    prismaMock.repo.update.mockResolvedValueOnce({
      id: "repo-1",
      organizationId: "org-1",
      name: "trace-renamed",
      remoteUrl: "https://github.com/acme/trace.git",
      defaultBranch: "develop",
      webhookId: "123",
    });
    prismaMock.project.create.mockResolvedValueOnce(makeProject({ repoId: "repo-1" }));
    prismaMock.project.findUniqueOrThrow
      .mockResolvedValueOnce({ organizationId: "org-1" })
      .mockResolvedValueOnce(makeProject({ sessions: [{ session: makeSession() }] }))
      .mockResolvedValueOnce({ organizationId: "org-1" });
    prismaMock.session.findFirstOrThrow.mockResolvedValueOnce({ id: "session-1" });

    const service = new OrganizationService();
    await service.updateRepo(
      "repo-1",
      "org-1",
      { name: "trace-renamed", defaultBranch: "develop" } as any,
      "user",
      "user-1",
    );
    await service.createProject(
      { organizationId: "org-1", name: "Roadmap", repoId: "repo-1" } as any,
      "user",
      "user-1",
    );
    await service.linkEntityToProject("session", "session-1", "project-1", "user", "user-1");

    expect(prismaMock.sessionProject.create).toHaveBeenCalledWith({
      data: { sessionId: "session-1", projectId: "project-1" },
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeType: "project",
        eventType: "entity_linked",
        payload: expect.objectContaining({
          project: expect.objectContaining({
            sessions: [
              expect.objectContaining({
                id: "session-1",
                agentStatus: "active",
                createdBy: expect.objectContaining({ id: "user-1", organizations: [] }),
                gitCheckpoints: [],
                projects: [],
                tickets: [],
                queuedMessages: [],
              }),
            ],
          }),
        }),
      }),
      prismaMock,
    );
    await expect(
      service.linkEntityToProject("chat", "chat-1", "project-1", "user", "user-1"),
    ).rejects.toThrow("Chats cannot be linked to projects");
  });

  it("creates project members and emits project-scoped project events", async () => {
    prismaMock.project.create.mockResolvedValueOnce(
      makeProject({
        members: [
          {
            userId: "user-1",
            role: "admin",
            joinedAt: projectTimestamp,
            leftAt: null,
            user: {
              id: "user-1",
              email: "user@example.com",
              name: "User",
              avatarUrl: null,
            },
          },
        ],
      }),
    );

    const service = new OrganizationService();
    await service.createProject({ organizationId: "org-1", name: "Roadmap" }, "user", "user-1");

    expect(prismaMock.project.create).toHaveBeenCalledWith({
      data: {
        name: "Roadmap",
        organizationId: "org-1",
        members: { create: { userId: "user-1", role: "admin" } },
      },
      include: expect.objectContaining({
        members: expect.objectContaining({ where: { leftAt: null } }),
      }),
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        scopeType: "project",
        scopeId: "project-1",
        eventType: "project_created",
        payload: expect.objectContaining({
          project: expect.objectContaining({
            id: "project-1",
            members: [
              expect.objectContaining({
                user: expect.objectContaining({ id: "user-1" }),
                role: "admin",
              }),
            ],
          }),
        }),
      }),
      prismaMock,
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeType: "system",
        eventType: "entity_linked",
        payload: { type: "project_created", projectId: "project-1", name: "Roadmap" },
      }),
      prismaMock,
    );
  });

  it("adds and removes project members with project-scoped events", async () => {
    prismaMock.project.findUniqueOrThrow.mockResolvedValue({ organizationId: "org-1" });
    prismaMock.orgMember.findUniqueOrThrow
      .mockResolvedValueOnce({ userId: "user-1", role: "admin" })
      .mockResolvedValueOnce({ userId: "user-2" })
      .mockResolvedValueOnce({ userId: "user-1", role: "admin" });
    prismaMock.projectMember.upsert.mockResolvedValueOnce({
      projectId: "project-1",
      userId: "user-2",
      role: "member",
      joinedAt: projectTimestamp,
      leftAt: null,
      user: {
        id: "user-2",
        email: "other@example.com",
        name: "Other",
        avatarUrl: null,
      },
    });
    prismaMock.projectMember.update.mockResolvedValueOnce({
      projectId: "project-1",
      userId: "user-2",
      role: "member",
      joinedAt: projectTimestamp,
      leftAt: projectTimestamp,
      user: {
        id: "user-2",
        email: "other@example.com",
        name: "Other",
        avatarUrl: null,
      },
    });

    const service = new OrganizationService();
    await service.addProjectMember("project-1", "user-2", "member", "user", "user-1");
    await service.removeProjectMember("project-1", "user-2", "user", "user-1");

    expect(prismaMock.projectMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId_userId: { projectId: "project-1", userId: "user-2" } },
        update: expect.objectContaining({ role: "member", leftAt: null }),
        create: expect.objectContaining({ projectId: "project-1", userId: "user-2" }),
      }),
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeType: "project",
        eventType: "project_member_added",
        payload: expect.objectContaining({ projectId: "project-1" }),
      }),
      prismaMock,
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeType: "project",
        eventType: "project_member_removed",
        payload: expect.objectContaining({ projectId: "project-1", userId: "user-2" }),
      }),
      prismaMock,
    );
  });

  it("rejects project member writes for non-admin project members", async () => {
    prismaMock.project.findUniqueOrThrow.mockResolvedValueOnce({ organizationId: "org-1" });
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValueOnce({
      userId: "user-1",
      role: "member",
    });
    prismaMock.projectMember.findUnique.mockResolvedValueOnce({ role: "member", leftAt: null });

    const service = new OrganizationService();
    await expect(
      service.addProjectMember("project-1", "user-2", "member", "user", "user-1"),
    ).rejects.toThrow("Only project admins can perform this action");

    expect(prismaMock.projectMember.upsert).not.toHaveBeenCalled();
    expect(eventServiceMock.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "project_member_added" }),
      prismaMock,
    );
  });

  it("fails closed for cross-org writes when the actor is not a member", async () => {
    prismaMock.orgMember.findUniqueOrThrow.mockRejectedValueOnce(new Error("Not found"));

    const service = new OrganizationService();
    await expect(
      service.createRepo(
        {
          organizationId: "org-2",
          name: "trace",
          remoteUrl: "https://github.com/acme/trace.git",
        } as any,
        "user",
        "user-1",
      ),
    ).rejects.toThrow("Not found");

    expect(prismaMock.repo.create).not.toHaveBeenCalled();
    expect(prismaMock.repo.findUnique).not.toHaveBeenCalled();
  });

  it("searches users outside the active organization only", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "user-2", name: "Bob", email: "bob@example.com", avatarUrl: null },
    ]);

    const service = new OrganizationService();
    const users = await service.searchUsers("bob", "org-1");

    expect(users).toEqual([
      { id: "user-2", name: "Bob", email: "bob@example.com", avatarUrl: null },
    ]);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { not: "00000000-0000-4000-a000-000000000001" },
        orgMemberships: {
          none: { organizationId: "org-1" },
        },
        OR: [
          { email: { contains: "bob", mode: "insensitive" } },
          { name: { contains: "bob", mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, email: true, avatarUrl: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 10,
    });
  });

  it("does not query for short search terms", async () => {
    const service = new OrganizationService();

    await expect(service.searchUsers("a", "org-1")).resolves.toEqual([]);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });
});
