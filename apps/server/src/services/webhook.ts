import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { apiTokenService } from "./api-token.js";
import { eventService } from "./event.js";

const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL ?? "http://localhost:4000";

/** Extract owner/repo from a GitHub remote URL (HTTPS or SSH). */
function parseGitHubRepo(remoteUrl: string): { owner: string; repo: string } | null {
  const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (match) return { owner: match[1], repo: match[2] };

  return null;
}

export class WebhookService {
  async registerGitHubWebhook(repoId: string, userId: string, organizationId: string) {
    const repo = await prisma.repo.findUniqueOrThrow({ where: { id: repoId } });

    if (repo.organizationId !== organizationId) {
      throw new Error("Repo does not belong to the current organization");
    }

    if (repo.webhookId) {
      throw new Error("Webhook already registered for this repo");
    }

    const parsed = parseGitHubRepo(repo.remoteUrl);
    if (!parsed) {
      throw new Error("Cannot parse GitHub owner/repo from remote URL: " + repo.remoteUrl);
    }

    const tokens = await apiTokenService.getDecryptedTokens(userId);
    const githubToken = tokens.github;
    if (!githubToken) {
      throw new Error("No GitHub token configured. Please add a GitHub API token first.");
    }

    const secret = randomBytes(32).toString("hex");
    const callbackUrl = `${WEBHOOK_BASE_URL}/webhooks/github`;

    const response = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/hooks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "web",
          active: true,
          events: ["pull_request"],
          config: {
            url: callbackUrl,
            content_type: "json",
            secret,
          },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${body}`);
    }

    const hook = (await response.json()) as { id: number };

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const repo = await tx.repo.update({
        where: { id: repoId },
        data: {
          webhookId: String(hook.id),
          webhookSecret: secret,
        },
      });

      await eventService.create(
        {
          organizationId: repo.organizationId,
          scopeType: "system",
          scopeId: repo.id,
          eventType: "repo_updated",
          payload: {
            repo: {
              id: repo.id,
              name: repo.name,
              remoteUrl: repo.remoteUrl,
              defaultBranch: repo.defaultBranch,
              webhookActive: true,
            },
          },
          actorType: "user",
          actorId: userId,
        },
        tx,
      );

      return repo;
    });

    return updated;
  }

  async unregisterGitHubWebhook(repoId: string, userId: string, organizationId: string) {
    const repo = await prisma.repo.findUniqueOrThrow({ where: { id: repoId } });

    if (repo.organizationId !== organizationId) {
      throw new Error("Repo does not belong to the current organization");
    }

    if (!repo.webhookId) {
      throw new Error("No webhook registered for this repo");
    }

    const parsed = parseGitHubRepo(repo.remoteUrl);
    if (!parsed) {
      throw new Error("Cannot parse GitHub owner/repo from remote URL: " + repo.remoteUrl);
    }

    const tokens = await apiTokenService.getDecryptedTokens(userId);
    const githubToken = tokens.github;
    if (!githubToken) {
      throw new Error("No GitHub token configured.");
    }

    const response = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/hooks/${repo.webhookId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
        },
      },
    );

    // 404 is fine — webhook may have already been removed on GitHub's side
    if (!response.ok && response.status !== 404) {
      const body = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${body}`);
    }

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const repo = await tx.repo.update({
        where: { id: repoId },
        data: {
          webhookId: null,
          webhookSecret: null,
        },
      });

      await eventService.create(
        {
          organizationId: repo.organizationId,
          scopeType: "system",
          scopeId: repo.id,
          eventType: "repo_updated",
          payload: {
            repo: {
              id: repo.id,
              name: repo.name,
              remoteUrl: repo.remoteUrl,
              defaultBranch: repo.defaultBranch,
              webhookActive: false,
            },
          },
          actorType: "user",
          actorId: userId,
        },
        tx,
      );

      return repo;
    });

    return updated;
  }
}

export const webhookService = new WebhookService();
export { parseGitHubRepo };
