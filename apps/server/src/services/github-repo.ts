import { Buffer } from "buffer";

export interface GitHubRepoRef {
  owner: string;
  repo: string;
}

export interface GitHubBranchDiffFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

interface GitHubTreeResponse {
  tree?: Array<{
    path?: unknown;
    type?: unknown;
  }>;
  truncated?: unknown;
}

interface GitHubContentResponse {
  type?: unknown;
  content?: unknown;
  encoding?: unknown;
  download_url?: unknown;
}

interface GitHubCompareResponse {
  files?: Array<{
    filename?: unknown;
    status?: unknown;
    additions?: unknown;
    deletions?: unknown;
  }>;
}

const GITHUB_API_VERSION = "2022-11-28";

export function parseGitHubRepo(remoteUrl: string): GitHubRepoRef | null {
  const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!match) return null;

  return { owner: match[1], repo: match[2] };
}

export class GitHubRepoService {
  async listFiles(repo: GitHubRepoRef, ref: string, token: string): Promise<string[]> {
    const response = await this.request<GitHubTreeResponse>(
      repo,
      `/git/trees/${encodeURIComponent(ref)}?recursive=1`,
      token,
    );

    return (response.tree ?? [])
      .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
      .map((entry) => entry.path as string)
      .sort((a, b) => a.localeCompare(b));
  }

  async readFile(repo: GitHubRepoRef, ref: string, filePath: string, token: string): Promise<string> {
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    const response = await this.request<GitHubContentResponse>(
      repo,
      `/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
      token,
    );

    if (response.type !== "file") {
      throw new Error("GitHub path is not a file");
    }

    if (response.encoding === "base64" && typeof response.content === "string") {
      return Buffer.from(response.content.replace(/\s/g, ""), "base64").toString("utf8");
    }

    if (typeof response.download_url === "string") {
      const raw = await fetch(response.download_url, {
        headers: this.headers(token),
      });
      if (!raw.ok) {
        throw new Error(`GitHub API error (${raw.status}): ${await raw.text()}`);
      }
      return raw.text();
    }

    return "";
  }

  async branchDiff(
    repo: GitHubRepoRef,
    baseRef: string,
    headRef: string,
    token: string,
  ): Promise<GitHubBranchDiffFile[]> {
    const basehead = encodeURIComponent(`${baseRef}...${headRef}`);
    const response = await this.request<GitHubCompareResponse>(repo, `/compare/${basehead}`, token);

    return (response.files ?? [])
      .filter((file) => typeof file.filename === "string")
      .map((file) => ({
        path: file.filename as string,
        status: this.toStatusCode(typeof file.status === "string" ? file.status : "modified"),
        additions: typeof file.additions === "number" ? file.additions : 0,
        deletions: typeof file.deletions === "number" ? file.deletions : 0,
      }));
  }

  private async request<T>(repo: GitHubRepoRef, path: string, token: string): Promise<T> {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(
        repo.repo,
      )}${path}`,
      { headers: this.headers(token) },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${body}`);
    }

    return (await response.json()) as T;
  }

  private headers(token: string): HeadersInit {
    return {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    };
  }

  private toStatusCode(status: string): string {
    switch (status) {
      case "added":
        return "A";
      case "removed":
        return "D";
      case "renamed":
        return "R";
      default:
        return "M";
    }
  }
}

export const githubRepoService = new GitHubRepoService();
