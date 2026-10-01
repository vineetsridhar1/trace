import { GitHubApiError, parseGitHubRepo, type GitHubRepoRef } from "./github-repo.js";

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
    for (let page = 1; page <= 30; page += 1) {
      const response = await this.request<GitHubFileResponse[]>(
        repo,
        `/pulls/${number}/files?per_page=100&page=${page}`,
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
      if (response.length < 100) break;
    }
    return files;
  }

  private async findExistingReview(
    repo: GitHubRepoRef,
    number: number,
    marker: string,
    token: string,
  ): Promise<ProviderDeliveryResult | null> {
    const reviews = await this.request<GitHubReviewResponse[]>(
      repo,
      `/pulls/${number}/reviews?per_page=100`,
      token,
    );
    const match = reviews.find(
      (review) => typeof review.body === "string" && review.body.includes(marker),
    );
    return typeof match?.id === "number" ? this.reviewResult(repo, number, match.id, token) : null;
  }

  private async reviewResult(
    repo: GitHubRepoRef,
    number: number,
    reviewId: number,
    token: string,
  ): Promise<ProviderDeliveryResult> {
    const comments = await this.request<GitHubReviewCommentResponse[]>(
      repo,
      `/pulls/${number}/reviews/${reviewId}/comments?per_page=100`,
      token,
    );
    const commentIds: Record<string, string> = {};
    for (const comment of comments) {
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
