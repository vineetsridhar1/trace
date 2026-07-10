export function isAppCloudReady(selectedState: unknown, groupState: unknown): boolean {
  const state = typeof selectedState === "string" ? selectedState : groupState;
  return state === "connected" || state === "degraded";
}
