import { prisma } from "../lib/db.js";
import { apiTokenService } from "./api-token.js";

/** Extract owner/repo from a GitHub remote URL (HTTPS or SSH). */
function parseGitHubRepo(remoteUrl: string): { owner: string; repo: string } | null {
  const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (match) return { owner: match[1], repo: match[2] };
  return null;
}

interface GitHubApiOptions {
  token: string;
  owner: string;
  repo: string;
}

async function githubGet(path: string, token: string): Promise<unknown> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${body}`);
  }
  return response.json();
}

interface GitHubPR {
  number: number;
  title: string;
  state: string;
  html_url: string;
  user: { login: string } | null;
  head: { ref: string };
  base: { ref: string };
  draft: boolean;
  additions: number;
  deletions: number;
  created_at: string;
  updated_at: string;
}

interface GitHubIssueRaw {
  number: number;
  title: string;
  state: string;
  html_url: string;
  user: { login: string } | null;
  labels: Array<{ name: string }>;
  pull_request?: unknown;
  created_at: string;
  updated_at: string;
}

interface GitHubWorkflowRunRaw {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  head_branch: string;
  event: string;
  created_at: string;
  updated_at: string;
}

export class GitHubService {
  async getRepoInfo(repoId: string, userId: string, branch?: string | null) {
    const repo = await prisma.repo.findUniqueOrThrow({ where: { id: repoId } });
    const parsed = parseGitHubRepo(repo.remoteUrl);
    if (!parsed) {
      throw new Error("Cannot parse GitHub owner/repo from remote URL: " + repo.remoteUrl);
    }

    const tokens = await apiTokenService.getDecryptedTokens(userId);
    const githubToken = tokens.github;
    if (!githubToken) {
      throw new Error("No GitHub token configured. Please add a GitHub API token in Settings.");
    }

    const { owner, repo: repoName } = parsed;

    const [pullRequests, issues, workflowRuns] = await Promise.all([
      this.getPullRequests({ token: githubToken, owner, repo: repoName }, branch),
      this.getIssues({ token: githubToken, owner, repo: repoName }),
      this.getWorkflowRuns({ token: githubToken, owner, repo: repoName }, branch),
    ]);

    return { pullRequests, issues, workflowRuns };
  }

  private async getPullRequests(opts: GitHubApiOptions, branch?: string | null) {
    const params = new URLSearchParams({ state: "open", per_page: "20", sort: "updated" });
    if (branch) params.set("head", `${opts.owner}:${branch}`);
    const data = (await githubGet(
      `/repos/${opts.owner}/${opts.repo}/pulls?${params}`,
      opts.token,
    )) as GitHubPR[];

    return data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      url: pr.html_url,
      author: pr.user?.login ?? "unknown",
      branch: pr.head.ref,
      baseBranch: pr.base.ref,
      draft: pr.draft,
      additions: pr.additions ?? 0,
      deletions: pr.deletions ?? 0,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
    }));
  }

  private async getIssues(opts: GitHubApiOptions) {
    const params = new URLSearchParams({ state: "open", per_page: "20", sort: "updated" });
    const data = (await githubGet(
      `/repos/${opts.owner}/${opts.repo}/issues?${params}`,
      opts.token,
    )) as GitHubIssueRaw[];

    // GitHub API returns PRs as issues too — filter them out
    return data
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        url: issue.html_url,
        author: issue.user?.login ?? "unknown",
        labels: issue.labels.map((l) => l.name),
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
      }));
  }

  private async getWorkflowRuns(opts: GitHubApiOptions, branch?: string | null) {
    const params = new URLSearchParams({ per_page: "10" });
    if (branch) params.set("branch", branch);
    const data = (await githubGet(
      `/repos/${opts.owner}/${opts.repo}/actions/runs?${params}`,
      opts.token,
    )) as { workflow_runs: GitHubWorkflowRunRaw[] };

    return (data.workflow_runs ?? []).map((run) => ({
      id: String(run.id),
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      url: run.html_url,
      branch: run.head_branch,
      event: run.event,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
    }));
  }
}

export const githubService = new GitHubService();
