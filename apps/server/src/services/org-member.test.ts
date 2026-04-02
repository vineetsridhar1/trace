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

const prismaMock = prisma as any;
const eventServiceMock = eventService as any;

describe("OrgMemberService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
