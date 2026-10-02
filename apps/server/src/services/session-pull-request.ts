import type { SessionPullRequestStatus } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { visibleSessionGroupWhere } from "./access.js";
import { apiTokenService } from "./api-token.js";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parsePullRequestStatus(value: unknown, prUrl: string): SessionPullRequestStatus {
  const result: SessionPullRequestStatus = { prUrl, review: "unknown", checks: "unknown" };
  const body = record(value);
  if (body?.errors) return result;
  const pr = record(record(record(body?.data)?.repository)?.pullRequest);
  if (!pr) return result;
  switch (pr.reviewDecision) {
    case "APPROVED":
      result.review = "approved";
      break;
    case "CHANGES_REQUESTED":
      result.review = "changes_requested";
      break;
    case "REVIEW_REQUIRED":
      result.review = "pending";
      break;
    default: {
      // Repositories without required reviews can have a null reviewDecision.
      const reviews = record(pr.latestOpinionatedReviews);
      if (record(reviews?.pageInfo)?.hasNextPage === false && Array.isArray(reviews?.nodes)) {
        const states = reviews.nodes.map((node: unknown) => record(node)?.state);
        result.review = states.includes("CHANGES_REQUESTED")
          ? "changes_requested"
          : states.includes("APPROVED")
            ? "approved"
            : "pending";
      }
    }
  }
  switch (record(pr.statusCheckRollup)?.state) {
    case "SUCCESS":
      result.checks = "success";
      break;
    case "FAILURE":
    case "ERROR":
      result.checks = "failure";
      break;
    case "PENDING":
    case "EXPECTED":
      result.checks = "pending";
      break;
  }
  return result;
}

export const sessionPullRequestService = {
  async getStatus(id: string, organizationId: string, userId: string) {
    return (await this.getStatuses([id], organizationId, userId))[0] ?? null;
  },

  async getStatuses(
    ids: string[],
    organizationId: string,
    userId: string,
  ): Promise<SessionPullRequestStatus[]> {
    if (ids.length > 100) throw new Error("At most 100 workspaces may be requested");
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) return [];
    const groups = await prisma.sessionGroup.findMany({
      where: { id: { in: uniqueIds }, organizationId, ...visibleSessionGroupWhere(userId) },
      select: { id: true, prUrl: true },
    });
    // Authorize the entire batch before reading credentials or contacting GitHub.
    if (groups.length !== uniqueIds.length)
      throw new Error("Not authorized for this session group");
    const urls = [...new Set(groups.flatMap((group) => (group.prUrl ? [group.prUrl] : [])))];
    const results = new Map<string, SessionPullRequestStatus>(
      urls.map((prUrl) => [prUrl, { prUrl, review: "unknown", checks: "unknown" }]),
    );
    const prs = urls.flatMap((prUrl) => {
      const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/.exec(prUrl);
      return match ? [{ prUrl, owner: match[1], repo: match[2], number: Number(match[3]) }] : [];
    });
    if (!prs.length) return [...results.values()];
    const tokens = await apiTokenService.getDecryptedTokens(userId);
    if (!tokens.github) return [...results.values()];

    // Bound query cost and deduplicate PRs shared by multiple workspaces.
    for (let offset = 0; offset < prs.length; offset += 25) {
      const batch = prs.slice(offset, offset + 25);
      const fields = batch
        .map(
          (pr, index) => `
        pr${index}: repository(owner: ${JSON.stringify(pr.owner)}, name: ${JSON.stringify(pr.repo)}) {
          pullRequest(number: ${pr.number}) {
            reviewDecision
            latestOpinionatedReviews(first: 100) { nodes { state } pageInfo { hasNextPage } }
            statusCheckRollup { state }
          }
        }`,
        )
        .join("\n");
      try {
        const response = await fetch("https://api.github.com/graphql", {
          method: "POST",
          headers: { Authorization: `Bearer ${tokens.github}`, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(10_000),
          body: JSON.stringify({ query: `query { ${fields} }` }),
        });
        if (!response.ok) break;
        const body = record(await response.json());
        const data = record(body?.data);
        for (const [index, pr] of batch.entries()) {
          // Preserve successful aliases when another repository is inaccessible.
          const alias = `pr${index}`;
          const errors = Array.isArray(body?.errors)
            ? body.errors.filter((error: unknown) => {
                const path = record(error)?.path;
                return !Array.isArray(path) || path[0] === alias;
              })
            : [];
          results.set(
            pr.prUrl,
            parsePullRequestStatus(
              {
                data: { repository: data?.[alias] },
                ...(errors.length ? { errors } : {}),
              },
              pr.prUrl,
            ),
          );
        }
        // Do not issue additional requests after provider errors, including rate limits.
        if (body?.errors) break;
      } catch {
        break;
      }
    }
    return [...results.values()];
  },
};
