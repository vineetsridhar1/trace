import { prisma } from "../lib/db.js";
import { decryptSecret, encryptSecret } from "../lib/encryption.js";

export class OrgSecretService {
  async set(organizationId: string, name: string, plaintext: string) {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error("Secret name is required");

    const { encrypted, iv } = encryptSecret(plaintext);
    return prisma.orgSecret.upsert({
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
      select: { id: true, organizationId: true, name: true, updatedAt: true },
    });
  }

  async getDecryptedValue(organizationId: string, id: string): Promise<string | null> {
    const secret = await prisma.orgSecret.findFirst({
      where: { id, organizationId },
    });
    if (!secret) return null;
    return decryptSecret(secret.encryptedValue, secret.iv);
  }

  async delete(organizationId: string, id: string): Promise<boolean> {
    const existing = await prisma.orgSecret.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) return false;

    await prisma.orgSecret.delete({ where: { id } });
    return true;
  }
}

export const orgSecretService = new OrgSecretService();
