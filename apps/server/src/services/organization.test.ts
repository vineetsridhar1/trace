import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateRepoInput } from "@trace/gql";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn(),
    publishCreated: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { TRACE_AI_USER_ID } from "../lib/ai-user.js";
import { eventService } from "./event.js";
import { OrganizationService } from "./organization.js";

const prismaMock = prisma as any;
const eventServiceMock = eventService as any;

describe("OrganizationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValue({ userId: "user-1" });
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

  it("allows first organization creation without an existing membership", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({ id: "user-1" });
    prismaMock.user.upsert.mockResolvedValueOnce({ id: "00000000-0000-4000-a000-000000000001" });
    prismaMock.organization.create.mockResolvedValueOnce({ id: "org-1", name: "First Org" });
    prismaMock.orgMember.create
      .mockResolvedValueOnce({
        organizationId: "org-1",
        userId: "user-1",
        role: "admin",
        organization: { id: "org-1", name: "First Org" },
      })
      .mockResolvedValueOnce({
        organizationId: "org-1",
        userId: "00000000-0000-4000-a000-000000000001",
        role: "member",
    });

    const service = new OrganizationService();
    await expect(
      service.createOrganization({ name: "First Org" }, "user-1"),
    ).resolves.toMatchObject({
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
    expect(prismaMock.channel.create).not.toHaveBeenCalled();
  });

  it("hides managed repos from ordinary repo lists", async () => {
    const service = new OrganizationService();
    prismaMock.repo.findMany.mockResolvedValueOnce([]);

    await service.listRepos("org-1");

    expect(prismaMock.repo.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", provider: "github" },
      include: { projects: true, sessions: true },
    });
  });

  it("creates repos, creates a coding channel, and emits events", async () => {
    const joinedAt = new Date("2026-04-03T00:00:00.000Z");
    prismaMock.repo.findUnique.mockResolvedValueOnce(null);
    prismaMock.repo.create.mockResolvedValueOnce({
      id: "repo-1",
      organizationId: "org-1",
      name: "trace",
      remoteUrl: "https://github.com/acme/trace.git",
      defaultBranch: "main",
      webhookId: null,
    });
    prismaMock.channel.findFirst.mockResolvedValueOnce({ position: 2 });
    prismaMock.channelGroup.findFirst.mockResolvedValueOnce({ position: 4 });
    prismaMock.channel.create.mockResolvedValueOnce({
      id: "channel-1",
      organizationId: "org-1",
      name: "trace",
      type: "coding",
      visibility: "public",
      ownerId: "user-1",
      position: 5,
      groupId: null,
      repoId: "repo-1",
      baseBranch: "main",
    });
    prismaMock.orgMember.findUnique.mockResolvedValueOnce({
      userId: TRACE_AI_USER_ID,
    });
    prismaMock.channelMember.findMany.mockResolvedValueOnce([
      { channelId: "channel-1", userId: "user-1", joinedAt, leftAt: null },
      { channelId: "channel-1", userId: TRACE_AI_USER_ID, joinedAt, leftAt: null },
    ]);
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "user-1", name: "User One", avatarUrl: null },
      { id: TRACE_AI_USER_ID, name: "Trace AI", avatarUrl: null },
    ]);
    eventServiceMock.create
      .mockResolvedValueOnce({ id: "event-repo" })
      .mockResolvedValueOnce({ id: "event-channel" });

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
    expect(prismaMock.channel.create).toHaveBeenCalledWith({
      data: {
        name: "trace",
        type: "coding",
        visibility: "public",
        ownerId: "user-1",
        position: 5,
        organizationId: "org-1",
        groupId: null,
        repoId: "repo-1",
        baseBranch: "main",
      },
    });
    expect(prismaMock.channelMember.create).toHaveBeenNthCalledWith(1, {
      data: { channelId: "channel-1", userId: "user-1" },
    });
    expect(prismaMock.channelMember.create).toHaveBeenNthCalledWith(2, {
      data: { channelId: "channel-1", userId: TRACE_AI_USER_ID },
    });
    expect(eventServiceMock.create).toHaveBeenNthCalledWith(
      1,
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
        deferPublish: true,
      },
      prismaMock,
    );
    expect(eventServiceMock.create).toHaveBeenNthCalledWith(
      2,
      {
        organizationId: "org-1",
        scopeType: "channel",
        scopeId: "channel-1",
        eventType: "channel_created",
        payload: {
          channel: {
            id: "channel-1",
            name: "trace",
            type: "coding",
            visibility: "public",
            ownerId: "user-1",
            position: 5,
            groupId: null,
            repoId: "repo-1",
            baseBranch: "main",
            repo: { id: "repo-1", name: "trace" },
            members: [
              {
                user: { id: "user-1", name: "User One", avatarUrl: null },
                joinedAt: joinedAt.toISOString(),
              },
              {
                user: { id: TRACE_AI_USER_ID, name: "Trace AI", avatarUrl: null },
                joinedAt: joinedAt.toISOString(),
              },
            ],
          },
        },
        actorType: "user",
        actorId: "user-1",
        deferPublish: true,
      },
      prismaMock,
    );
    expect(eventServiceMock.publishCreated).toHaveBeenNthCalledWith(1, { id: "event-repo" });
    expect(eventServiceMock.publishCreated).toHaveBeenNthCalledWith(2, { id: "event-channel" });
  });

  it("does not emit repo_created when automatic channel creation fails", async () => {
    prismaMock.repo.findUnique.mockResolvedValueOnce(null);
    prismaMock.repo.create.mockResolvedValueOnce({
      id: "repo-1",
      organizationId: "org-1",
      name: "trace",
      remoteUrl: "https://github.com/acme/trace.git",
      defaultBranch: "main",
      webhookId: null,
    });
    prismaMock.channel.findFirst.mockResolvedValueOnce(null);
    prismaMock.channelGroup.findFirst.mockResolvedValueOnce(null);
    prismaMock.channel.create.mockRejectedValueOnce(new Error("channel create failed"));

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
    ).rejects.toThrow("channel create failed");

    expect(eventServiceMock.create).not.toHaveBeenCalled();
    expect(eventServiceMock.publishCreated).not.toHaveBeenCalled();
  });

  it("creates repos without remote urls", async () => {
    const joinedAt = new Date("2026-04-03T00:00:00.000Z");
    prismaMock.repo.create.mockResolvedValueOnce({
      id: "repo-1",
      organizationId: "org-1",
      name: "local-only",
      remoteUrl: null,
      defaultBranch: "main",
      webhookId: null,
    });
    prismaMock.channel.findFirst.mockResolvedValueOnce(null);
    prismaMock.channelGroup.findFirst.mockResolvedValueOnce(null);
    prismaMock.channel.create.mockResolvedValueOnce({
      id: "channel-1",
      organizationId: "org-1",
      name: "local-only",
      type: "coding",
      position: 1,
      groupId: null,
      repoId: "repo-1",
      baseBranch: "main",
    });
    prismaMock.orgMember.findUnique.mockResolvedValueOnce({
      userId: TRACE_AI_USER_ID,
    });
    prismaMock.channelMember.findMany.mockResolvedValueOnce([
      { channelId: "channel-1", userId: "user-1", joinedAt, leftAt: null },
      { channelId: "channel-1", userId: TRACE_AI_USER_ID, joinedAt, leftAt: null },
    ]);
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "user-1", name: "User One", avatarUrl: null },
      { id: TRACE_AI_USER_ID, name: "Trace AI", avatarUrl: null },
    ]);
    eventServiceMock.create
      .mockResolvedValueOnce({ id: "event-repo" })
      .mockResolvedValueOnce({ id: "event-channel" });

    const service = new OrganizationService();
    const input: CreateRepoInput = {
      organizationId: "org-1",
      name: "local-only",
    };
    const repo = await service.createRepo(input, "user", "user-1");

    expect(repo.id).toBe("repo-1");
    expect(prismaMock.repo.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.repo.create).toHaveBeenCalledWith({
      data: {
        name: "local-only",
        provider: "github",
        remoteUrl: null,
        defaultBranch: "main",
        organizationId: "org-1",
      },
      include: { projects: true, sessions: true },
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          repo: expect.objectContaining({ remoteUrl: null }),
        }),
      }),
      prismaMock,
    );
    expect(eventServiceMock.publishCreated).toHaveBeenNthCalledWith(1, { id: "event-repo" });
    expect(eventServiceMock.publishCreated).toHaveBeenNthCalledWith(2, { id: "event-channel" });
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
    prismaMock.project.create.mockResolvedValueOnce({
      id: "project-1",
      organizationId: "org-1",
      name: "Roadmap",
    });
    prismaMock.project.findUniqueOrThrow
      .mockResolvedValueOnce({ organizationId: "org-1" })
      .mockResolvedValueOnce({ id: "project-1", name: "Roadmap" })
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
    await expect(
      service.linkEntityToProject("chat", "chat-1", "project-1", "user", "user-1"),
    ).rejects.toThrow("Chats cannot be linked to projects");
  });

  it("requires project repos to belong to the project organization", async () => {
    prismaMock.repo.findFirstOrThrow.mockRejectedValueOnce(new Error("Not found"));

    const service = new OrganizationService();
    await expect(
      service.createProject(
        { organizationId: "org-1", name: "Roadmap", repoId: "repo-cross-org" } as any,
        "user",
        "user-1",
      ),
    ).rejects.toThrow("Not found");

    expect(prismaMock.repo.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: "repo-cross-org", organizationId: "org-1" },
      select: { id: true },
    });
    expect(prismaMock.project.create).not.toHaveBeenCalled();
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
