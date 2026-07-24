const STARTED_AGENT_STATES = new Set(["active", "done", "failed", "stopped"]);

export function isAppCanvasReady(
  agentStatus: unknown,
  selectedState: unknown,
  groupState: unknown,
): boolean {
  if (typeof agentStatus !== "string" || !STARTED_AGENT_STATES.has(agentStatus)) return false;
  const state = typeof selectedState === "string" ? selectedState : groupState;
  return state === "connected" || state === "degraded";
}

/**
 * Animations reuse app's live-container readiness, but their saved bundle plays
 * back without a container. Reveal the canvas on that bundle alone, otherwise
 * the preview panel never mounts once the container is gone and the durable
 * preview it exists to serve is unreachable.
 */
export function isAnimationCanvasReady(
  liveCanvasReady: boolean,
  savedPreviewUrl: string | null | undefined,
): boolean {
  return liveCanvasReady || !!savedPreviewUrl;
}
