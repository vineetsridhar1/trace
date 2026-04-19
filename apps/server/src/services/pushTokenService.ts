import type { PushPlatform } from "@prisma/client";
import { prisma } from "../lib/db.js";

export interface RegisterPushTokenInput {
  userId: string;
  organizationId: string | null;
  token: string;
  platform: PushPlatform;
}

export interface UnregisterPushTokenInput {
  userId: string;
  token: string;
}

export class PushTokenService {
  async register({ userId, organizationId, token, platform }: RegisterPushTokenInput): Promise<boolean> {
    const now = new Date();
    await prisma.pushToken.upsert({
      where: { userId_token: { userId, token } },
      create: { userId, organizationId, token, platform, lastSeenAt: now },
      update: { organizationId, platform, lastSeenAt: now },
    });
    return true;
  }

  async unregister({ userId, token }: UnregisterPushTokenInput): Promise<boolean> {
    const result = await prisma.pushToken.deleteMany({ where: { userId, token } });
    return result.count > 0;
  }

  async listActiveTokensForUser(userId: string, organizationId: string | null) {
    return prisma.pushToken.findMany({
      where: {
        userId,
        OR: [{ organizationId }, { organizationId: null }],
      },
      orderBy: { lastSeenAt: "desc" },
    });
  }
}

export const pushTokenService = new PushTokenService();
