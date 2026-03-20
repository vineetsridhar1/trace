import type { ParticipantScope } from "@prisma/client";
import { prisma } from "../lib/db.js";

export class ParticipantService {
  async subscribe({
    userId,
    scopeType,
    scopeId,
    organizationId,
  }: {
    userId: string;
    scopeType: ParticipantScope;
    scopeId: string;
    organizationId: string;
  }) {
    return prisma.participant.upsert({
      where: {
        userId_scopeType_scopeId: { userId, scopeType, scopeId },
      },
      create: { userId, scopeType, scopeId, organizationId },
      update: { organizationId },
    });
  }

  async unsubscribe({
    userId,
    scopeType,
    scopeId,
    organizationId,
  }: {
    userId: string;
    scopeType: ParticipantScope;
    scopeId: string;
    organizationId: string;
  }) {
    await prisma.participant.deleteMany({
      where: { userId, scopeType, scopeId, organizationId },
    });
  }

  async mute({
    userId,
    scopeType,
    scopeId,
  }: {
    userId: string;
    scopeType: ParticipantScope;
    scopeId: string;
    organizationId: string;
  }) {
    return prisma.participant.update({
      where: {
        userId_scopeType_scopeId: { userId, scopeType, scopeId },
      },
      data: { mutedAt: new Date() },
    });
  }

  async unmute({
    userId,
    scopeType,
    scopeId,
  }: {
    userId: string;
    scopeType: ParticipantScope;
    scopeId: string;
    organizationId: string;
  }) {
    return prisma.participant.update({
      where: {
        userId_scopeType_scopeId: { userId, scopeType, scopeId },
      },
      data: { mutedAt: null },
    });
  }

  async getParticipants(scopeType: ParticipantScope, scopeId: string, organizationId: string) {
    return prisma.participant.findMany({
      where: { scopeType, scopeId, organizationId },
    });
  }

  async isParticipant(userId: string, scopeType: ParticipantScope, scopeId: string, organizationId: string) {
    const p = await prisma.participant.findFirst({
      where: { userId, scopeType, scopeId, organizationId },
    });
    return p !== null;
  }
}

export const participantService = new ParticipantService();
