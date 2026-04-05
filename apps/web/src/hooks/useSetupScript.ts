import { useTerminalStore } from "../stores/terminal";

/**
 * Call this from the event handler when a setup_script_completed event is received.
 */
export function handleSetupScriptCompleted(
  sessionGroupId: string,
  payload: { success: boolean; exitCode?: number; error?: string },
): void {
  const { setSetupStatus } = useTerminalStore.getState();
  if (payload.success) {
    setSetupStatus(sessionGroupId, "completed");
  } else {
    setSetupStatus(
      sessionGroupId,
      "failed",
      payload.error ?? `Setup script exited with code ${payload.exitCode ?? 1}`,
    );
  }
}

/**
 * Call this from the event handler when a workspace_ready event is received
 * and the channel has a setup script — marks the session group as "running"
 * so terminals are gated until the setup_script_completed event arrives.
 */
export function handleSetupScriptStarted(sessionGroupId: string): void {
  const currentStatus = useTerminalStore.getState().setupStatus[sessionGroupId];
  if (!currentStatus || currentStatus === "idle") {
    useTerminalStore.getState().setSetupStatus(sessionGroupId, "running");
  }
}
