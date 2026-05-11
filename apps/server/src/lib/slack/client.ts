import { WebClient } from "@slack/web-api";
import { prisma } from "../db.js";
import { decryptSecret } from "../encryption.js";

const clientCache = new Map<string, WebClient>();

export async function getSlackClient(slackTeamId: string): Promise<WebClient | null> {
  const cached = clientCache.get(slackTeamId);
  if (cached) return cached;

  const install = await prisma.slackInstall.findUnique({
    where: { slackTeamId },
    select: { encryptedBotToken: true, iv: true },
  });
  if (!install) return null;

  const token = decryptSecret(install.encryptedBotToken, install.iv);
  const client = new WebClient(token);
  clientCache.set(slackTeamId, client);
  return client;
}

export function invalidateSlackClient(slackTeamId: string): void {
  clientCache.delete(slackTeamId);
}
