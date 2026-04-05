/**
 * Eval types — defines the structure for replay-based eval cases, results, and scores.
 *
 * The eval system replays stored context packets through current prompt blocks
 * to measure the impact of prompt changes on agent behavior.
 */

import type { ExecutionDisposition } from "@prisma/client";

// ---------------------------------------------------------------------------
// Eval case — a single test case derived from a stored execution log
// ---------------------------------------------------------------------------

export interface EvalCase {
  /** The execution log ID this case was derived from. */
  executionLogId: string;
  /** Organization ID for context. */
  organizationId: string;
  /** The stored replay packet (structured context). */
  replayPacket: Record<string, unknown>;
  /** Prompt block versions used in the original execution. */
  originalPromptVersions: Record<string, number> | null;
  /** The original planner disposition. */
  originalDisposition: ExecutionDisposition;
  /** The original confidence score. */
  originalConfidence: number;
  /** The original planned actions (action type names). */
  originalActions: string[];
}

// ---------------------------------------------------------------------------
// Eval result — the outcome of replaying a case with current prompt blocks
// ---------------------------------------------------------------------------

export interface EvalResult {
  caseId: string;
  /** Disposition from the replay run. */
  replayDisposition: string;
  /** Confidence from the replay run. */
  replayConfidence: number;
  /** Actions proposed in the replay run. */
  replayActions: string[];
  /** Current prompt block versions used in replay. */
  currentPromptVersions: Record<string, number>;
  /** Scores comparing original vs replay. */
  scores: EvalScores;
  /** Time taken for the replay planner call. */
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Scoring metrics
// ---------------------------------------------------------------------------

export interface EvalScores {
  /** Whether the disposition matched exactly. */
  dispositionMatch: boolean;
  /** Confidence delta (replay - original). Positive = more confident. */
  confidenceDelta: number;
  /** Jaccard similarity of action sets (intersection / union). */
  actionSetOverlap: number;
  /** Overall composite score (0-1). */
  composite: number;
}

// ---------------------------------------------------------------------------
// Eval run summary — aggregates across multiple cases
// ---------------------------------------------------------------------------

export interface EvalRunSummary {
  /** Total cases evaluated. */
  totalCases: number;
  /** Cases where disposition matched. */
  dispositionMatchCount: number;
  /** Average confidence delta across all cases. */
  avgConfidenceDelta: number;
  /** Average action set overlap (Jaccard). */
  avgActionSetOverlap: number;
  /** Average composite score. */
  avgComposite: number;
  /** Per-case results. */
  results: EvalResult[];
  /** Prompt versions used in this eval run. */
  promptVersions: Record<string, number>;
  /** Timestamp of the eval run. */
  timestamp: string;
}
