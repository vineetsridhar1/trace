import { NotFoundError } from "../lib/errors.js";
import {
  githubRepoService,
  GitHubApiError,
  parseGitHubRepo,
  type GitHubRepoRef,
} from "./github-repo.js";

export interface ReviewProviderFile {
  path: string;
  previousPath: string | null;
  status: string;
  additions: number;
  deletions: number;
  patch: string;
  baseBlobId: string | null;
  headBlobId: string | null;
}

export interface ResolvedPullRequest {
  provider: "github";
  remoteId: string;
  number: number;
  url: string;
  title: string;
  description: string;
  repository: GitHubRepoRef;
  baseSha: string;
  headSha: string;
  baseRef: string;
  headRef: string;
  files: ReviewProviderFile[];
}

export interface ProviderReviewComment {
  threadId: string;
  body: string;
  path?: string;
  side?: "LEFT" | "RIGHT";
  line?: number;
  startLine?: number;
  startSide?: "LEFT" | "RIGHT";
  subjectType?: "file";
}

export interface ProviderDeliveryResult {
  reviewId: string;
  commentIds: Record<string, string>;
}

export interface ReviewProviderAdapter {
  readFileAtCommit(
    pullRequestUrl: string,
    commit: string,
    filePath: string,
    token: string,
  ): Promise<string>;
  resolvePullRequest(url: string, token: string): Promise<ResolvedPullRequest>;
  submitReview(input: {
    pullRequest: ResolvedPullRequest;
    token: string;
    disposition: "comment" | "approve" | "request_changes";
    body?: string | null;
    comments: ProviderReviewComment[];
    idempotencyKey: string;
  }): Promise<ProviderDeliveryResult>;
}

interface GitHubPullResponse {
  id?: number;
  number?: number;
  html_url?: string;
  title?: string;
  body?: string | null;
  base?: { sha?: string; ref?: string };
  head?: { sha?: string; ref?: string };
}

interface GitHubFileResponse {
  filename?: string;
  previous_filename?: string;
  status?: string;
  additions?: number;
  deletions?: number;
  patch?: string;
  sha?: string;
}

interface GitHubReviewResponse {
  id?: number;
  body?: string;
  comments_url?: string;
}

interface GitHubReviewCommentResponse {
  id?: number;
  body?: string;
}

const API_VERSION = "2022-11-28";
const PER_PAGE = 100;
const MAX_PAGES = 30;

export function parseGitHubPullRequestUrl(
  url: string,
): { repo: GitHubRepoRef; number: number } | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.hostname.toLowerCase() !== "github.com") return null;
    const match = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/.exec(parsed.pathname);
    if (!match) return null;
    const repo = parseGitHubRepo(`https://github.com/${match[1]}/${match[2]}`);
    const number = Number.parseInt(match[3]!, 10);
    return repo && number > 0 ? { repo, number } : null;
  } catch {
    return null;
  }
}

export class GitHubReviewProvider implements ReviewProviderAdapter {
  async readFileAtCommit(
    pullRequestUrl: string,
    commit: string,
    filePath: string,
    token: string,
  ): Promise<string> {
    const target = parseGitHubPullRequestUrl(pullRequestUrl);
    if (!target) throw new Error("Invalid pull request URL");
    try {
      return await githubRepoService.readFile(target.repo, commit, filePath, token);
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) {
        throw new NotFoundError("Snapshot file", filePath);
      }
      throw error;
    }
  }

  async resolvePullRequest(url: string, token: string): Promise<ResolvedPullRequest> {
    const target = parseGitHubPullRequestUrl(url);
    if (!target) throw new Error("A canonical GitHub pull request URL is required");
    const pull = await this.request<GitHubPullResponse>(
      target.repo,
      `/pulls/${target.number}`,
      token,
    );
    if (
      typeof pull.id !== "number" ||
      typeof pull.number !== "number" ||
      typeof pull.html_url !== "string" ||
      typeof pull.title !== "string" ||
      typeof pull.base?.sha !== "string" ||
      typeof pull.head?.sha !== "string"
    ) {
      throw new Error("GitHub returned incomplete pull request metadata");
    }
    const files = await this.fetchFiles(target.repo, target.number, token);
    return {
      provider: "github",
      remoteId: String(pull.id),
      number: pull.number,
      url: pull.html_url,
      title: pull.title,
      description: typeof pull.body === "string" ? pull.body : "",
      repository: target.repo,
      baseSha: pull.base.sha,
      headSha: pull.head.sha,
      baseRef: typeof pull.base.ref === "string" ? pull.base.ref : "",
      headRef: typeof pull.head.ref === "string" ? pull.head.ref : "",
      files,
    };
  }

  async submitReview(input: {
    pullRequest: ResolvedPullRequest;
    token: string;
    disposition: "comment" | "approve" | "request_changes";
    body?: string | null;
    comments: ProviderReviewComment[];
    idempotencyKey: string;
  }): Promise<ProviderDeliveryResult> {
    const marker = `<!-- trace-review-delivery:${input.idempotencyKey} -->`;
    const existing = await this.findExistingReview(
      input.pullRequest.repository,
      input.pullRequest.number,
      marker,
      input.token,
    );
    if (existing) return existing;

    const response = await this.request<GitHubReviewResponse>(
      input.pullRequest.repository,
      `/pulls/${input.pullRequest.number}/reviews`,
      input.token,
      {
        method: "POST",
        body: JSON.stringify({
          commit_id: input.pullRequest.headSha,
          event:
            input.disposition === "approve"
              ? "APPROVE"
              : input.disposition === "request_changes"
                ? "REQUEST_CHANGES"
                : "COMMENT",
          body: `${input.body?.trim() ?? ""}\n\n${marker}`.trim(),
          comments: input.comments.map((comment) => ({
            path: comment.path,
            body: `${comment.body}\n\n<!-- trace-thread:${comment.threadId} -->`,
            ...(comment.subjectType ? { subject_type: comment.subjectType } : {}),
            ...(comment.line ? { line: comment.line, side: comment.side ?? "RIGHT" } : {}),
            ...(comment.startLine && comment.startLine !== comment.line
              ? {
                  start_line: comment.startLine,
                  start_side: comment.startSide ?? comment.side ?? "RIGHT",
                }
              : {}),
          })),
        }),
      },
    );
    if (typeof response.id !== "number") throw new Error("GitHub did not return a review id");
    return this.reviewResult(
      input.pullRequest.repository,
      input.pullRequest.number,
      response.id,
      input.token,
    );
  }

  private async fetchFiles(repo: GitHubRepoRef, number: number, token: string) {
    const files: ReviewProviderFile[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const response = await this.request<GitHubFileResponse[]>(
        repo,
        `/pulls/${number}/files?per_page=${PER_PAGE}&page=${page}`,
        token,
      );
      for (const file of response) {
        if (typeof file.filename !== "string") continue;
        files.push({
          path: file.filename,
          previousPath: typeof file.previous_filename === "string" ? file.previous_filename : null,
          status: typeof file.status === "string" ? file.status : "modified",
          additions: typeof file.additions === "number" ? file.additions : 0,
          deletions: typeof file.deletions === "number" ? file.deletions : 0,
          patch: typeof file.patch === "string" ? file.patch : "",
          baseBlobId: null,
          headBlobId: typeof file.sha === "string" ? file.sha : null,
        });
      }
      if (response.length < PER_PAGE) break;
    }
    return files;
  }

  /**
   * The delivery marker is what makes a retry safe, so every page has to be searched: missing it
   * because the match sat on page two would publish the review a second time.
   */
  private async findExistingReview(
    repo: GitHubRepoRef,
    number: number,
    marker: string,
    token: string,
  ): Promise<ProviderDeliveryResult | null> {
    for await (const review of this.paginate<GitHubReviewResponse>(
      repo,
      `/pulls/${number}/reviews`,
      token,
    )) {
      if (typeof review.body === "string" && review.body.includes(marker)) {
        return typeof review.id === "number"
          ? this.reviewResult(repo, number, review.id, token)
          : null;
      }
    }
    return null;
  }

  private async *paginate<T>(repo: GitHubRepoRef, path: string, token: string): AsyncGenerator<T> {
    const separator = path.includes("?") ? "&" : "?";
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const response = await this.request<T[]>(
        repo,
        `${path}${separator}per_page=${PER_PAGE}&page=${page}`,
        token,
      );
      for (const item of response) yield item;
      if (response.length < PER_PAGE) return;
    }
  }

  private async reviewResult(
    repo: GitHubRepoRef,
    number: number,
    reviewId: number,
    token: string,
  ): Promise<ProviderDeliveryResult> {
    const commentIds: Record<string, string> = {};
    // Paginated so a large review still records a provider id for every thread it delivered —
    // a thread marked delivered without one can never be reconciled back to its GitHub comment.
    for await (const comment of this.paginate<GitHubReviewCommentResponse>(
      repo,
      `/pulls/${number}/reviews/${reviewId}/comments`,
      token,
    )) {
      const match =
        typeof comment.body === "string"
          ? /<!-- trace-thread:([^ ]+) -->/.exec(comment.body)
          : null;
      if (match && typeof comment.id === "number") commentIds[match[1]!] = String(comment.id);
    }
    return { reviewId: String(reviewId), commentIds };
  }

  private async request<T>(
    repo: GitHubRepoRef,
    path: string,
    token: string,
    init?: RequestInit,
  ): Promise<T> {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}${path}`,
      {
        ...init,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": API_VERSION,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      },
    );
    if (!response.ok) throw new GitHubApiError(response.status, await response.text());
    return (await response.json()) as T;
  }
}

export const githubReviewProvider = new GitHubReviewProvider();
