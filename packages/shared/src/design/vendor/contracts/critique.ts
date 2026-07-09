export const PANELIST_ROLES = ["designer", "critic", "brand", "a11y", "copy"] as const;
export type PanelistRole = (typeof PANELIST_ROLES)[number];

export type CritiqueConfig = {
  enabled: boolean;
  cast: PanelistRole[];
  maxRounds: number;
  scoreScale: number;
  scoreThreshold: number;
  weights: Record<PanelistRole, number>;
  perRoundTimeoutMs: number;
  totalTimeoutMs: number;
  parserMaxBlockBytes: number;
  fallbackPolicy: "ship_best" | "ship_last" | "fail";
  protocolVersion: number;
  maxConcurrentRuns: number;
};

export function defaultCritiqueConfig(): CritiqueConfig {
  return {
    enabled: false,
    cast: [...PANELIST_ROLES],
    maxRounds: 3,
    scoreScale: 10,
    scoreThreshold: 8,
    weights: { designer: 0, critic: 0.4, brand: 0.2, a11y: 0.2, copy: 0.2 },
    perRoundTimeoutMs: 90_000,
    totalTimeoutMs: 240_000,
    parserMaxBlockBytes: 262_144,
    fallbackPolicy: "ship_best",
    protocolVersion: 1,
    maxConcurrentRuns: 4,
  };
}
