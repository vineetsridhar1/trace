import { prisma } from "../lib/db.js";
import { decryptSecret, encryptSecret } from "../lib/encryption.js";
import { assertActorOrgAdmin } from "./actor-auth.js";
import type { ActorType } from "@trace/gql";

export class OrgSecretService {
  async list(organizationId: string, actorType: ActorType, actorId: string) {
    return prisma.$transaction(async (tx) => {
      await assertActorOrgAdmin(tx, organizationId, actorType, actorId);
      return tx.orgSecret.findMany({
        where: { organizationId },
        orderBy: { name: "asc" },
        select: { id: true, organizationId: true, name: true, createdAt: true, updatedAt: true },
      });
    });
  }

  async set(
    organizationId: string,
    name: string,
    plaintext: string,
    actorType: ActorType,
    actorId: string,
  ) {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error("Secret name is required");
    if (!plaintext) throw new Error("Secret value is required");

    const { encrypted, iv } = encryptSecret(plaintext);
    return prisma.$transaction(async (tx) => {
      await assertActorOrgAdmin(tx, organizationId, actorType, actorId);
      return tx.orgSecret.upsert({
        where: { organizationId_name: { organizationId, name: normalizedName } },
        create: {
          organizationId,
          name: normalizedName,
          encryptedValue: encrypted,
          iv,
        },
        update: {
          encryptedValue: encrypted,
          iv,
        },
        select: { id: true, organizationId: true, name: true, createdAt: true, updatedAt: true },
      });
    });
  }

  async getDecryptedValue(organizationId: string, id: string): Promise<string | null> {
    const secret = await prisma.orgSecret.findFirst({
      where: { id, organizationId },
    });
    if (!secret) return null;
    return decryptSecret(secret.encryptedValue, secret.iv);
  }

  async delete(
    organizationId: string,
    id: string,
    actorType: ActorType,
    actorId: string,
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      await assertActorOrgAdmin(tx, organizationId, actorType, actorId);
      const existing = await tx.orgSecret.findFirst({
        where: { id, organizationId },
        select: { id: true },
      });
      if (!existing) return false;

      await tx.orgSecret.delete({ where: { id } });
      return true;
    });
  }
}

export const orgSecretService = new OrgSecretService();
