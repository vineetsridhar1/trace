const STARTED_AGENT_STATES = new Set(["active", "done", "failed", "stopped"]);

export function isGeneratedProjectCanvasReady(
  agentStatus: unknown,
  selectedState: unknown,
  groupState: unknown,
): boolean {
  if (typeof agentStatus !== "string" || !STARTED_AGENT_STATES.has(agentStatus)) return false;
  // Reveal immediately after the first message so the user can watch the
  // starter boot and every subsequent Vite HMR update while the agent works.
  if (agentStatus === "active") return true;
  const state = typeof selectedState === "string" ? selectedState : groupState;
  return state === "connected" || state === "degraded";
}
