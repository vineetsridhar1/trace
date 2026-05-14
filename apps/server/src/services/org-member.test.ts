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
import { OrgMemberService } from "./org-member.js";
import type { createPrismaMock } from "../../test/helpers.js";

type PrismaMock = ReturnType<typeof createPrismaMock>;

const prismaMock = prisma as unknown as PrismaMock;
const eventServiceMock = eventService as unknown as { create: ReturnType<typeof vi.fn> };

describe("OrgMemberService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: PrismaMock) => Promise<unknown>) => callback(prismaMock),
    );
  });

  it("promotes the first human org member to admin", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: "user-1",
      name: "Vineet",
    });
    prismaMock.orgMember.count.mockResolvedValueOnce(0);
    prismaMock.orgMember.create.mockResolvedValueOnce({
      user: { id: "user-1", name: "Vineet", email: "vineet@example.com", avatarUrl: null },
      role: "admin",
    });

    const service = new OrgMemberService();
    await service.addMember({
      organizationId: "org-1",
      userId: "user-1",
      role: "member",
      actorType: "user",
      actorId: "admin-1",
    });

    expect(prismaMock.orgMember.count).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        userId: { not: "00000000-0000-4000-a000-000000000001" },
      },
    });
    expect(prismaMock.orgMember.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        organizationId: "org-1",
        role: "admin",
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        organization: { select: { id: true, name: true } },
      },
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith({
      organizationId: "org-1",
      scopeType: "system",
      scopeId: "org-1",
      eventType: "member_joined",
      payload: {
        userId: "user-1",
        userName: "Vineet",
        role: "admin",
      },
      actorType: "user",
      actorId: "admin-1",
    });
  });

  it("keeps later members at the requested role", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: "user-2",
      name: "Teammate",
    });
    prismaMock.orgMember.count.mockResolvedValueOnce(1);
    prismaMock.orgMember.create.mockResolvedValueOnce({
      user: { id: "user-2", name: "Teammate", email: "team@example.com", avatarUrl: null },
      role: "member",
    });

    const service = new OrgMemberService();
    await service.addMember({
      organizationId: "org-1",
      userId: "user-2",
      role: "member",
      actorType: "user",
      actorId: "admin-1",
    });

    expect(prismaMock.orgMember.create).toHaveBeenCalledWith({
      data: {
        userId: "user-2",
        organizationId: "org-1",
        role: "member",
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        organization: { select: { id: true, name: true } },
      },
    });
  });

  it("hides the Trace AI user from org member listings", async () => {
    prismaMock.orgMember.findMany.mockResolvedValueOnce([]);

    const service = new OrgMemberService();
    await service.getMembers("org-1");

    expect(prismaMock.orgMember.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        userId: { not: "00000000-0000-4000-a000-000000000001" },
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        organization: { select: { id: true, name: true } },
      },
      orderBy: { joinedAt: "asc" },
    });
  });

  it("removes a human org member and emits a member_left event", async () => {
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValueOnce({ role: "member" });
    prismaMock.orgMember.delete.mockResolvedValueOnce({});
    eventServiceMock.create.mockResolvedValueOnce({});

    const service = new OrgMemberService();
    const removed = await service.removeMember({
      organizationId: "org-1",
      userId: "user-2",
      actorType: "user",
      actorId: "admin-1",
    });

    expect(removed).toBe(true);
    expect(prismaMock.orgMember.delete).toHaveBeenCalledWith({
      where: { userId_organizationId: { userId: "user-2", organizationId: "org-1" } },
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith({
      organizationId: "org-1",
      scopeType: "system",
      scopeId: "org-1",
      eventType: "member_left",
      payload: { userId: "user-2" },
      actorType: "user",
      actorId: "admin-1",
    });
  });

  it("rejects removing the last human admin", async () => {
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValueOnce({ role: "admin" });
    prismaMock.orgMember.count.mockResolvedValueOnce(1);

    const service = new OrgMemberService();
    await expect(
      service.removeMember({
        organizationId: "org-1",
        userId: "admin-1",
        actorType: "user",
        actorId: "admin-1",
      }),
    ).rejects.toThrow("Cannot remove the last organization admin");

    expect(prismaMock.orgMember.count).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        role: "admin",
        userId: { not: "00000000-0000-4000-a000-000000000001" },
      },
    });
    expect(prismaMock.orgMember.delete).not.toHaveBeenCalled();
    expect(eventServiceMock.create).not.toHaveBeenCalled();
  });

  it("allows removing an admin when another human admin remains", async () => {
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValueOnce({ role: "admin" });
    prismaMock.orgMember.count.mockResolvedValueOnce(2);
    prismaMock.orgMember.delete.mockResolvedValueOnce({});
    eventServiceMock.create.mockResolvedValueOnce({});

    const service = new OrgMemberService();
    await service.removeMember({
      organizationId: "org-1",
      userId: "admin-2",
      actorType: "user",
      actorId: "admin-1",
    });

    expect(prismaMock.orgMember.delete).toHaveBeenCalledWith({
      where: { userId_organizationId: { userId: "admin-2", organizationId: "org-1" } },
    });
  });

  it("rejects demoting the last human admin", async () => {
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValueOnce({ role: "admin" });
    prismaMock.orgMember.count.mockResolvedValueOnce(1);

    const service = new OrgMemberService();
    await expect(
      service.updateRole({
        organizationId: "org-1",
        userId: "admin-1",
        role: "member",
      }),
    ).rejects.toThrow("Cannot demote the last organization admin");

    expect(prismaMock.orgMember.update).not.toHaveBeenCalled();
  });
});
