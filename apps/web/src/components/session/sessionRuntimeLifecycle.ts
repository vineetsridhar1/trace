const RUNTIME_STARTING_STATES = new Set([
  "pending",
  "requested",
  "provisioning",
  "booting",
  "connecting",
]);

const RUNTIME_RECOVERY_STATES = new Set([
  "disconnected",
  "failed",
  "timed_out",
  "deprovision_failed",
]);

export function getRuntimeLifecycleState({
  hosting,
  connectionState,
  groupConnectionState,
}: {
  hosting: string | null | undefined;
  connectionState: string | null;
  groupConnectionState: string | null;
}): string | null {
  if (hosting !== "cloud" || connectionState === null || connectionState === "connected") {
    return null;
  }

  const sharedRuntimeAlreadyConnected =
    groupConnectionState === "connected" && RUNTIME_STARTING_STATES.has(connectionState);
  if (sharedRuntimeAlreadyConnected) {
    return null;
  }

  if (RUNTIME_STARTING_STATES.has(connectionState)) {
    return connectionState;
  }
  if (RUNTIME_RECOVERY_STATES.has(connectionState)) {
    return connectionState;
  }
  return null;
}

export function isRuntimeLifecycleFailureState(connectionState: string): boolean {
  return RUNTIME_RECOVERY_STATES.has(connectionState);
}
