import { prisma } from "../lib/db.js";
import { apiTokenService } from "./api-token.js";
import { parseGitHubRepo } from "./webhook.js";

type GitHubPullRequestResponse = {
  number: number;
  title: string;
  html_url: string;
  draft?: boolean;
  updated_at: string;
  user: {
    login: string;
  } | null;
  head: {
    ref: string;
    repo: {
      full_name: string;
    } | null;
  };
};

export type PullRequestSummary = {
  number: number;
  title: string;
  branch: string;
  url: string;
  author: string;
  isDraft: boolean;
  updatedAt: string;
};

export class GitHubService {
  async listOpenPullRequests({
    repoId,
    userId,
    organizationId,
  }: {
    repoId: string;
    userId: string;
    organizationId: string;
  }): Promise<PullRequestSummary[]> {
    const repo = await prisma.repo.findUniqueOrThrow({ where: { id: repoId } });

    if (repo.organizationId !== organizationId) {
      throw new Error("Repo does not belong to the current organization");
    }

    if (!repo.remoteUrl) return [];

    const parsed = parseGitHubRepo(repo.remoteUrl);
    if (!parsed) return [];

    const tokens = await apiTokenService.getDecryptedTokens(userId);
    const githubToken = tokens.github;
    if (!githubToken) {
      throw new Error("No GitHub token configured. Please add a GitHub API token first.");
    }

    const response = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls?state=open&per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
        },
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${body}`);
    }

    const pullRequests = (await response.json()) as GitHubPullRequestResponse[];
    const fullName = `${parsed.owner}/${parsed.repo}`.toLowerCase();

    return pullRequests
      .filter((pullRequest) => pullRequest.head.repo?.full_name.toLowerCase() === fullName)
      .map((pullRequest) => ({
        number: pullRequest.number,
        title: pullRequest.title,
        branch: pullRequest.head.ref,
        url: pullRequest.html_url,
        author: pullRequest.user?.login ?? "unknown",
        isDraft: pullRequest.draft ?? false,
        updatedAt: pullRequest.updated_at,
      }));
  }
}

export const githubService = new GitHubService();
