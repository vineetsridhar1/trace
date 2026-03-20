import { prisma } from "../lib/db.js";

export class ParticipantService {
  async subscribe({
    userId,
    scopeType,
    scopeId,
    organizationId,
  }: {
    userId: string;
    scopeType: string;
    scopeId: string;
    organizationId: string;
  }) {
    return prisma.participant.upsert({
      where: {
        userId_scopeType_scopeId: { userId, scopeType, scopeId },
      },
      create: { userId, scopeType, scopeId, organizationId },
      update: {},
    });
  }

  async unsubscribe({
    userId,
    scopeType,
    scopeId,
  }: {
    userId: string;
    scopeType: string;
    scopeId: string;
  }) {
    await prisma.participant.deleteMany({
      where: { userId, scopeType, scopeId },
    });
  }

  async mute({
    userId,
    scopeType,
    scopeId,
  }: {
    userId: string;
    scopeType: string;
    scopeId: string;
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
    scopeType: string;
    scopeId: string;
  }) {
    return prisma.participant.update({
      where: {
        userId_scopeType_scopeId: { userId, scopeType, scopeId },
      },
      data: { mutedAt: null },
    });
  }

  async getParticipants(scopeType: string, scopeId: string) {
    return prisma.participant.findMany({
      where: { scopeType, scopeId },
    });
  }

  async isParticipant(userId: string, scopeType: string, scopeId: string) {
    const p = await prisma.participant.findUnique({
      where: {
        userId_scopeType_scopeId: { userId, scopeType, scopeId },
      },
    });
    return p !== null;
  }
}

export const participantService = new ParticipantService();
