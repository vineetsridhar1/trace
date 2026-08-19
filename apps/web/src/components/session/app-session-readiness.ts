const STARTED_AGENT_STATES = new Set(["active", "done", "failed", "stopped"]);
const STARTING_CONNECTION_STATES = new Set([
  "pending",
  "requested",
  "provisioning",
  "booting",
  "connecting",
]);

/** True while the container is still coming up, before applications can boot. */
export function isRuntimeStarting(selectedState: unknown, groupState: unknown): boolean {
  const state = typeof selectedState === "string" ? selectedState : groupState;
  return typeof state === "string" && STARTING_CONNECTION_STATES.has(state);
}

export function isAppCanvasReady(
  agentStatus: unknown,
  selectedState: unknown,
  groupState: unknown,
): boolean {
  if (typeof agentStatus !== "string" || !STARTED_AGENT_STATES.has(agentStatus)) return false;
  const state = typeof selectedState === "string" ? selectedState : groupState;
  return state === "connected" || state === "degraded";
}
