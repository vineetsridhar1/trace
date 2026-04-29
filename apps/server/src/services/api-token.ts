import type { ApiTokenProvider } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { decryptSecret, encryptSecret } from "../lib/encryption.js";

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
    const { encrypted, iv } = encryptSecret(plainToken);

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
      result[token.provider] = decryptSecret(token.encryptedToken, token.iv);
    }
    return result;
  }
}

export const apiTokenService = new ApiTokenService();
