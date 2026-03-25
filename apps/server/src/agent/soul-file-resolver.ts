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

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Platform default (loaded once at startup)
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOUL_FILE_PATH = resolve(__dirname, "default-soul.md");

let cachedDefault: string | null = null;

function getDefaultSoulFile(): string {
  if (cachedDefault !== null) return cachedDefault;
  let content: string;
  try {
    content = readFileSync(DEFAULT_SOUL_FILE_PATH, "utf-8");
  } catch {
    // Fallback if file is missing (shouldn't happen in production)
    content =
      "You are an ambient AI assistant. Default to no action. Prefer suggesting over acting. Be concise.";
  }
  cachedDefault = content;
  return content;
}

/** Visible for testing — reset the cached default. */
export function resetDefaultSoulFileCache(): void {
  cachedDefault = null;
}

// ---------------------------------------------------------------------------
// Token estimation (mirrors context-builder's logic)
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  if (!text) return 0;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * 1.3);
}

// ---------------------------------------------------------------------------
// Truncation — bottom-up (preserves identity at top, trims rules at bottom)
// ---------------------------------------------------------------------------

/**
 * Truncate text to fit within a token budget. Keeps the beginning of the text
 * (identity, preamble) and trims from the bottom.
 */
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

  // Pick the most specific non-empty source
  let resolved: string;

  if (input.repoSoulFile?.trim()) {
    resolved = input.repoSoulFile;
  } else if (input.projectSoulFile?.trim()) {
    resolved = input.projectSoulFile;
  } else if (input.orgSoulFile?.trim()) {
    resolved = input.orgSoulFile;
  } else {
    resolved = getDefaultSoulFile();
  }

  // Truncate to budget (bottom-up — identity preserved, rules trimmed)
  return truncateToTokenBudget(resolved, budget);
}

/**
 * Get the platform default soul file content.
 * Useful for displaying in the UI as a reference.
 */
export function getDefaultSoulFileContent(): string {
  return getDefaultSoulFile();
}
