/**
 * Eval Scorer — computes comparison metrics between an original execution
 * and a replay execution.
 *
 * Metrics:
 * - Disposition match: exact match of disposition (boolean)
 * - Confidence delta: replay confidence minus original confidence
 * - Action set overlap: Jaccard similarity of proposed action types
 * - Composite: weighted combination of all metrics
 */

import type { EvalScores } from "./eval-types.js";

// ---------------------------------------------------------------------------
// Weights for composite score
// ---------------------------------------------------------------------------

const WEIGHTS = {
  dispositionMatch: 0.5,
  confidenceSimilarity: 0.2,
  actionSetOverlap: 0.3,
} as const;

// ---------------------------------------------------------------------------
// Scorer
// ---------------------------------------------------------------------------

export function scoreEval(input: {
  originalDisposition: string;
  replayDisposition: string;
  originalConfidence: number;
  replayConfidence: number;
  originalActions: string[];
  replayActions: string[];
}): EvalScores {
  const dispositionMatch = input.originalDisposition === input.replayDisposition;
  const confidenceDelta = input.replayConfidence - input.originalConfidence;
  const actionSetOverlap = jaccardSimilarity(input.originalActions, input.replayActions);

  // Confidence similarity: 1.0 when delta is 0, decays linearly
  const confidenceSimilarity = Math.max(0, 1 - Math.abs(confidenceDelta));

  const composite =
    (dispositionMatch ? WEIGHTS.dispositionMatch : 0) +
    confidenceSimilarity * WEIGHTS.confidenceSimilarity +
    actionSetOverlap * WEIGHTS.actionSetOverlap;

  return {
    dispositionMatch,
    confidenceDelta,
    actionSetOverlap,
    composite,
  };
}

// ---------------------------------------------------------------------------
// Jaccard similarity — |intersection| / |union|
// ---------------------------------------------------------------------------

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1.0; // both empty = identical
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1.0 : intersection / union;
}
