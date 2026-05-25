import { WebClient } from "@slack/web-api";
import { prisma } from "../db.js";
import { decryptSecret } from "../encryption.js";

const clientCache = new Map<string, WebClient>();

export async function getSlackBotToken(slackTeamId: string): Promise<string | null> {
  const install = await prisma.slackInstall.findUnique({
    where: { slackTeamId },
    select: { encryptedBotToken: true, iv: true },
  });
  if (!install) return null;
  return decryptSecret(install.encryptedBotToken, install.iv);
}

export async function getSlackClient(slackTeamId: string): Promise<WebClient | null> {
  const cached = clientCache.get(slackTeamId);
  if (cached) return cached;

  const token = await getSlackBotToken(slackTeamId);
  if (!token) return null;
  const client = new WebClient(token);
  clientCache.set(slackTeamId, client);
  return client;
}

export function invalidateSlackClient(slackTeamId: string): void {
  clientCache.delete(slackTeamId);
}
