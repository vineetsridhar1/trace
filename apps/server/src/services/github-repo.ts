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
const GITHUB_REPO_HOST = "github.com";

class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`GitHub API error (${status}): ${body}`);
  }
}

export function parseGitHubRepo(remoteUrl: string): GitHubRepoRef | null {
  const trimmed = remoteUrl.trim();
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  try {
    const url = new URL(trimmed);
    if (url.hostname !== GITHUB_REPO_HOST) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/i, "") };
  } catch {
    return null;
  }
}

export class GitHubRepoService {
  async listFiles(repo: GitHubRepoRef, ref: string, token: string): Promise<string[]> {
    const response = await this.request<GitHubTreeResponse>(
      repo,
      `/git/trees/${encodeURIComponent(ref)}?recursive=1`,
      token,
    );

    if (response.truncated === true) {
      throw new Error("GitHub file tree is too large to list completely.");
    }

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
    const files: GitHubCompareResponse["files"] = [];
    let compareNotFound = false;
    let compared = false;

    for (const path of this.comparePaths(baseRef, headRef)) {
      try {
        const responses = await this.requestAllPages<GitHubCompareResponse>(repo, path, token);
        compared = true;
        for (const response of responses) {
          files.push(...(response.files ?? []));
        }
        break;
      } catch (error) {
        if (error instanceof GitHubApiError && error.status === 404) {
          compareNotFound = true;
          continue;
        }
        throw error;
      }
    }

    if (!compared && compareNotFound) {
      throw new Error(
        `GitHub branch diff unavailable: could not compare "${baseRef}" to "${headRef}". ` +
          "Make sure the session branch has been pushed to GitHub and your token can access the repo.",
      );
    }

    if (!compared) {
      throw new Error("GitHub branch diff unavailable.");
    }

    return files
      .filter((file) => typeof file.filename === "string")
      .map((file) => ({
        path: file.filename as string,
        status: this.toStatusCode(typeof file.status === "string" ? file.status : "modified"),
        additions: typeof file.additions === "number" ? file.additions : 0,
        deletions: typeof file.deletions === "number" ? file.deletions : 0,
      }));
  }

  private async request<T>(repo: GitHubRepoRef, path: string, token: string): Promise<T> {
    const { data } = await this.requestPage<T>(repo, path, token);
    return data;
  }

  private async requestAllPages<T>(
    repo: GitHubRepoRef,
    path: string,
    token: string,
  ): Promise<T[]> {
    const pages: T[] = [];
    let nextPathOrUrl: string | null = path;

    while (nextPathOrUrl) {
      const page: { data: T; next: string | null } = await this.requestPage<T>(
        repo,
        nextPathOrUrl,
        token,
      );
      pages.push(page.data);
      nextPathOrUrl = page.next;
    }

    return pages;
  }

  private async requestPage<T>(
    repo: GitHubRepoRef,
    pathOrUrl: string,
    token: string,
  ): Promise<{ data: T; next: string | null }> {
    const url = pathOrUrl.startsWith("https://")
      ? pathOrUrl
      : `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(
          repo.repo,
        )}${pathOrUrl}`;

    const response = await fetch(url, { headers: this.headers(token) });

    if (!response.ok) {
      const body = await response.text();
      throw new GitHubApiError(response.status, body);
    }

    const data = (await response.json()) as T;
    const next: string | null = this.nextLink(response.headers.get("link"));
    return { data, next };
  }

  private nextLink(linkHeader: string | null): string | null {
    if (!linkHeader) return null;

    for (const part of linkHeader.split(",")) {
      const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
      if (match?.[2] === "next") return match[1];
    }

    return null;
  }

  private comparePaths(baseRef: string, headRef: string): string[] {
    const encodedBasehead = `/compare/${encodeURIComponent(`${baseRef}...${headRef}`)}`;
    const pathBasehead = `/compare/${this.encodePathRef(baseRef)}...${this.encodePathRef(headRef)}`;
    const paths = [encodedBasehead, pathBasehead];

    if (!headRef.startsWith("heads/")) {
      paths.push(`/compare/${this.encodePathRef(baseRef)}...heads/${this.encodePathRef(headRef)}`);
    }

    return Array.from(new Set(paths));
  }

  private encodePathRef(ref: string): string {
    return ref.split("/").map(encodeURIComponent).join("/");
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
