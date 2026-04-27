/**
 * Soul File Resolver — merges soul files from multiple sources into a single
 * resolved string for the planner prompt.
 *
 * Resolution priority (most specific wins):
 *   1. Platform default (always present as fallback)
 *   2. Org-level soul file (overrides platform default)
 *   3. Project-level overrides (optional)
 *   4. Repo-level `.trace/soul.md` (optional)
 *
 * More specific sources fully replace less specific ones. If a more specific
 * source is empty/absent, the next less specific source is used.
 *
 * The resolved soul file is truncated to a token budget (default 2000 tokens)
 * from the bottom up — identity and preamble are preserved, detailed rules
 * at the end are trimmed first.
 *
 * Ticket: #13
 */

import { estimateTokens } from "./context-builder.js";
import { prisma } from "../lib/db.js";

// ---------------------------------------------------------------------------
// Platform default (inlined to avoid build-time asset resolution issues)
// ---------------------------------------------------------------------------

const DEFAULT_SOUL_FILE = `# Trace AI Agent

You are an ambient AI assistant embedded in Trace, a collaborative project management platform. You observe events across channels, tickets, sessions, and chats, and decide when to help.

## Behavioral Defaults

- **Default to no action.** Most events do not require your involvement. When uncertain, do nothing.
- **Prefer suggesting over acting.** Unless the situation is clearly low-risk and high-confidence, suggest rather than execute.
- **Be concise.** Keep any user-facing messages to 1–2 sentences. Avoid filler, hedging, or preamble.
- **Respect the autonomy mode.** In observe mode, only update summaries. In suggest mode, propose but never execute. In act mode, execute only when confidence is high and risk is low.

## Privacy Rules

- **Never share private DM content** in channels, tickets, or other public scopes.
- **Never reference information from one private chat** in a different scope unless the user explicitly shared it there.
- **Treat chat membership as a privacy boundary.** If you observed something in a members-only context, keep it there.

## Priorities

1. Help the team stay aligned — surface blockers, contradictions, and stale work.
2. Reduce toil — automate repetitive bookkeeping (status updates, linking, labeling).
3. Stay out of the way — unhelpful suggestions are worse than silence.
`;

// ---------------------------------------------------------------------------
// Truncation — bottom-up (preserves identity at top, trims rules at bottom)
// ---------------------------------------------------------------------------

function truncateToTokenBudget(text: string, budget: number): string {
  if (estimateTokens(text) <= budget) return text;

  const words = text.split(/\s+/);
  const targetWords = Math.floor(budget / 1.3);
  if (words.length <= targetWords) return text;

  return (
    words.slice(0, targetWords).join(" ") + "\n\n[truncated — soul file exceeded token budget]"
  );
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

export interface SoulFileResolutionInput {
  /** Org-level soul file from AgentIdentity.soulFile (may be empty). */
  orgSoulFile: string;
  /** Optional project-level soul file override. */
  projectSoulFile?: string;
  /** Optional repo-level soul file (from .trace/soul.md). */
  repoSoulFile?: string;
  /** Token budget for the resolved soul file. Default: 2000. */
  tokenBudget?: number;
}

/**
 * Resolve the soul file from multiple sources.
 *
 * The most specific non-empty source wins. Sources are checked in reverse
 * priority order: repo > project > org > platform default.
 */
export function resolveSoulFile(input: SoulFileResolutionInput): string {
  const budget = input.tokenBudget ?? 2000;

  let resolved: string;

  if (input.repoSoulFile?.trim()) {
    resolved = input.repoSoulFile;
  } else if (input.projectSoulFile?.trim()) {
    resolved = input.projectSoulFile;
  } else if (input.orgSoulFile?.trim()) {
    resolved = input.orgSoulFile;
  } else {
    resolved = DEFAULT_SOUL_FILE;
  }

  return truncateToTokenBudget(resolved, budget);
}

// ---------------------------------------------------------------------------
// Project soul file fetcher — looks up the soul file from the project
// linked to the scope entity (channel, session, or ticket).
// ---------------------------------------------------------------------------

/**
 * Fetch the project-level soul file for a given scope.
 *
 * Follows scope → project joins:
 * - channel → ChannelProject → Project
 * - session → SessionProject → Project
 * - ticket → TicketProject → Project
 *
 * Returns the project soul file string, or undefined if not found/empty.
 */
export async function fetchProjectSoulFile(
  organizationId: string,
  scopeType: string,
  scopeId: string,
): Promise<string | undefined> {
  try {
    let project: { soulFile: string } | null = null;

    if (scopeType === "channel") {
      const link = await prisma.channelProject.findFirst({
        where: { channelId: scopeId, project: { organizationId } },
        select: { project: { select: { soulFile: true } } },
      });
      project = link?.project ?? null;
    } else if (scopeType === "session") {
      const link = await prisma.sessionProject.findFirst({
        where: { sessionId: scopeId, project: { organizationId } },
        select: { project: { select: { soulFile: true } } },
      });
      project = link?.project ?? null;
    } else if (scopeType === "ticket") {
      const link = await prisma.ticketProject.findFirst({
        where: { ticketId: scopeId, project: { organizationId } },
        select: { project: { select: { soulFile: true } } },
      });
      project = link?.project ?? null;
    }
    // chat and system scopes don't have project links

    if (project?.soulFile?.trim()) {
      return project.soulFile;
    }
    return undefined;
  } catch {
    // Non-critical — fall back to org/default soul file
    return undefined;
  }
}

/**
 * Fetch the repo ID linked to a scope, for use with loadRepoSoulFile().
 * Follows: session → Repo, channel → Repo, or scope → project → repo.
 */
export async function fetchRepoIdForScope(
  organizationId: string,
  scopeType: string,
  scopeId: string,
): Promise<string | undefined> {
  try {
    // Sessions may have a direct repo link
    if (scopeType === "session") {
      const session = await prisma.session.findUnique({
        where: { id: scopeId },
        select: { repoId: true },
      });
      if (session?.repoId) return session.repoId;
    }

    // Channels may have a direct repo link
    if (scopeType === "channel") {
      const channel = await prisma.channel.findUnique({
        where: { id: scopeId },
        select: { repoId: true },
      });
      if (channel?.repoId) return channel.repoId;
    }

    // Fall back to project → repo
    if (scopeType === "channel") {
      const link = await prisma.channelProject.findFirst({
        where: { channelId: scopeId, project: { organizationId } },
        select: { project: { select: { repoId: true } } },
      });
      if (link?.project?.repoId) return link.project.repoId;
    } else if (scopeType === "session") {
      const link = await prisma.sessionProject.findFirst({
        where: { sessionId: scopeId, project: { organizationId } },
        select: { project: { select: { repoId: true } } },
      });
      if (link?.project?.repoId) return link.project.repoId;
    } else if (scopeType === "ticket") {
      const link = await prisma.ticketProject.findFirst({
        where: { ticketId: scopeId, project: { organizationId } },
        select: { project: { select: { repoId: true } } },
      });
      if (link?.project?.repoId) return link.project.repoId;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Repo soul file loader — reads .trace/soul.md from the repo filesystem
// ---------------------------------------------------------------------------

/** Simple TTL cache for repo soul files to avoid repeated file I/O. */
const repoSoulFileCache = new Map<string, { content: string | undefined; expiresAt: number }>();
const REPO_SOUL_FILE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load the repo-level soul file from `.trace/soul.md` in the repo working directory.
 *
 * This requires the repo to have a local clone accessible from the server.
 * For sessions running on Fly machines, the file may not be accessible — in that
 * case this function returns undefined and the resolver falls back to project/org/default.
 *
 * Results are cached per repoId with a 5-minute TTL.
 */
export async function loadRepoSoulFile(repoId: string): Promise<string | undefined> {
  // Check cache
  const cached = repoSoulFileCache.get(repoId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.content;
  }

  try {
    // Look up the repo to find its clone path
    const repo = await prisma.repo.findUnique({
      where: { id: repoId },
      select: { remoteUrl: true, setupConfig: true },
    });

    if (!repo) {
      cacheRepoSoulFile(repoId, undefined);
      return undefined;
    }

    // The setupConfig may contain a local clone path for repos set up locally
    const config = repo.setupConfig as Record<string, unknown> | null;
    const clonePath = config?.localPath as string | undefined;

    if (!clonePath) {
      // No local path available — can't read from filesystem
      cacheRepoSoulFile(repoId, undefined);
      return undefined;
    }

    // Attempt to read .trace/soul.md from the repo
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    const soulFilePath = join(clonePath, ".trace", "soul.md");

    const content = await readFile(soulFilePath, "utf-8");
    const trimmed = content.trim() || undefined;
    cacheRepoSoulFile(repoId, trimmed);
    return trimmed;
  } catch {
    // File doesn't exist or can't be read — graceful fallback
    cacheRepoSoulFile(repoId, undefined);
    return undefined;
  }
}

function cacheRepoSoulFile(repoId: string, content: string | undefined): void {
  repoSoulFileCache.set(repoId, {
    content,
    expiresAt: Date.now() + REPO_SOUL_FILE_TTL_MS,
  });
}
