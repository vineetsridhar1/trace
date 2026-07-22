import type { CodexAuthMethod } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { decryptSecret, encryptSecret } from "../lib/encryption.js";

export class CodexCredentialService {
  async getStatus(userId: string) {
    return prisma.codexCredential.findUnique({
      where: { userId },
      select: { method: true, updatedAt: true },
    });
  }

  async getDecryptedCredential(userId: string) {
    const credential = await prisma.codexCredential.findUnique({ where: { userId } });
    if (!credential) return null;
    return { method: credential.method, credential: decryptSecret(credential.encryptedCredential, credential.iv) };
  }

  async set(userId: string, method: CodexAuthMethod, credential: string) {
    const { encrypted, iv } = encryptSecret(credential);
    const record = await prisma.codexCredential.upsert({
      where: { userId },
      create: { userId, method, encryptedCredential: encrypted, iv },
      update: { method, encryptedCredential: encrypted, iv },
    });
    return { method: record.method, updatedAt: record.updatedAt };
  }

  async delete(userId: string): Promise<boolean> {
    const record = await prisma.codexCredential.findUnique({ where: { userId }, select: { id: true } });
    if (!record) return false;
    await prisma.codexCredential.delete({ where: { userId } });
    return true;
  }
}

export const codexCredentialService = new CodexCredentialService();
