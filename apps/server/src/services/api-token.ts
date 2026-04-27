import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import type { ApiTokenProvider } from "@prisma/client";
import { prisma } from "../lib/db.js";

const ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY ?? "";

function getKey(): Buffer {
  if (!ENCRYPTION_KEY) {
    throw new Error("TOKEN_ENCRYPTION_KEY env var is required for API token encryption");
  }
  return Buffer.from(ENCRYPTION_KEY, "hex");
}

function encrypt(plaintext: string): { encrypted: string; iv: string } {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return {
    encrypted: encrypted + ":" + authTag,
    iv: iv.toString("hex"),
  };
}

function decrypt(encryptedWithTag: string, ivHex: string): string {
  const [encrypted, authTag] = encryptedWithTag.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

const ALL_PROVIDERS: ApiTokenProvider[] = ["anthropic", "openai", "github", "ssh_key"];

export class ApiTokenService {
  async list(userId: string) {
    const tokens = await prisma.apiToken.findMany({
      where: { userId },
      select: { provider: true, updatedAt: true },
    });

    const setProviders = new Map(
      tokens.map(
        (t: { provider: ApiTokenProvider; updatedAt: Date }) => [t.provider, t.updatedAt] as const,
      ),
    );

    return ALL_PROVIDERS.map((provider) => ({
      provider,
      isSet: setProviders.has(provider),
      updatedAt: setProviders.get(provider) ?? null,
    }));
  }

  async set(userId: string, provider: ApiTokenProvider, plainToken: string) {
    const { encrypted, iv } = encrypt(plainToken);

    const token = await prisma.apiToken.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, encryptedToken: encrypted, iv },
      update: { encryptedToken: encrypted, iv },
    });

    return { provider: token.provider, isSet: true, updatedAt: token.updatedAt };
  }

  async delete(userId: string, provider: ApiTokenProvider): Promise<boolean> {
    const existing = await prisma.apiToken.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (!existing) return false;

    await prisma.apiToken.delete({
      where: { userId_provider: { userId, provider } },
    });
    return true;
  }

  /**
   * Retrieve decrypted tokens for a user, keyed by provider.
   * Used internally when injecting tokens into cloud containers.
   */
  async getDecryptedTokens(userId: string): Promise<Partial<Record<ApiTokenProvider, string>>> {
    const tokens = await prisma.apiToken.findMany({ where: { userId } });
    const result: Partial<Record<ApiTokenProvider, string>> = {};
    for (const token of tokens) {
      result[token.provider] = decrypt(token.encryptedToken, token.iv);
    }
    return result;
  }
}

export const apiTokenService = new ApiTokenService();
