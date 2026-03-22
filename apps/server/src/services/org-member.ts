import type { UserRole } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";

export class OrgMemberService {
  async addMember({
    organizationId,
    userId,
    role = "member",
    actorType,
    actorId,
  }: {
    organizationId: string;
    userId: string;
    role?: UserRole;
    actorType: "user" | "agent" | "system";
    actorId: string;
  }) {
    // Verify user exists
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true },
    });

    const member = await prisma.orgMember.create({
      data: {
        userId: user.id,
        organizationId,
        role,
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        organization: { select: { id: true, name: true } },
      },
    });

    await eventService.create({
      organizationId,
      scopeType: "system",
      scopeId: organizationId,
      eventType: "member_joined",
      payload: {
        userId: user.id,
        userName: user.name,
        role,
      },
      actorType,
      actorId,
    });

    return member;
  }

  async removeMember({
    organizationId,
    userId,
    actorType,
    actorId,
  }: {
    organizationId: string;
    userId: string;
    actorType: "user" | "agent" | "system";
    actorId: string;
  }) {
    await prisma.orgMember.delete({
      where: { userId_organizationId: { userId, organizationId } },
    });

    await eventService.create({
      organizationId,
      scopeType: "system",
      scopeId: organizationId,
      eventType: "member_left",
      payload: { userId },
      actorType,
      actorId,
    });

    return true;
  }

  async updateRole({
    organizationId,
    userId,
    role,
  }: {
    organizationId: string;
    userId: string;
    role: UserRole;
  }) {
    return prisma.orgMember.update({
      where: { userId_organizationId: { userId, organizationId } },
      data: { role },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        organization: { select: { id: true, name: true } },
      },
    });
  }

  async getMembers(organizationId: string) {
    return prisma.orgMember.findMany({
      where: { organizationId },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        organization: { select: { id: true, name: true } },
      },
      orderBy: { joinedAt: "asc" },
    });
  }

  async getUserOrgs(userId: string) {
    return prisma.orgMember.findMany({
      where: { userId },
      include: {
        organization: { select: { id: true, name: true } },
      },
      orderBy: { joinedAt: "asc" },
    });
  }

  async assertMembership(userId: string, organizationId: string) {
    const membership = await prisma.orgMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (!membership) {
      throw new Error("Not a member of this organization");
    }
    return membership;
  }
}

export const orgMemberService = new OrgMemberService();
