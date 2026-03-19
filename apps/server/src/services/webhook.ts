import { randomBytes } from "crypto";
import { prisma } from "../lib/db.js";
import { apiTokenService } from "./api-token.js";

const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL ?? "https://trace-rgsa.onrender.com";

/** Extract owner/repo from a GitHub remote URL (HTTPS or SSH). */
function parseGitHubRepo(remoteUrl: string): { owner: string; repo: string } | null {
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };

  // SSH: git@github.com:owner/repo.git
  const sshMatch = remoteUrl.match(/github\.com:([^/]+)\/([^/.]+)/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

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

    const updated = await prisma.repo.update({
      where: { id: repoId },
      data: {
        webhookId: String(hook.id),
        webhookSecret: secret,
      },
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

    const updated = await prisma.repo.update({
      where: { id: repoId },
      data: {
        webhookId: null,
        webhookSecret: null,
      },
    });

    return updated;
  }
}

export const webhookService = new WebhookService();
export { parseGitHubRepo };
