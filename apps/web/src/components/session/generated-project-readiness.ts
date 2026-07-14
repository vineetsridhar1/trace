const STARTED_AGENT_STATES = new Set(["active", "done", "failed", "stopped"]);

export function isGeneratedProjectCanvasReady(
  agentStatus: unknown,
  selectedState: unknown,
  groupState: unknown,
): boolean {
  if (typeof agentStatus !== "string" || !STARTED_AGENT_STATES.has(agentStatus)) return false;
  const state = typeof selectedState === "string" ? selectedState : groupState;
  return state === "connected" || state === "degraded";
}
