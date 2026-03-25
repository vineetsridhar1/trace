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

  return words.slice(0, targetWords).join(" ") + "\n\n[truncated — soul file exceeded token budget]";
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
