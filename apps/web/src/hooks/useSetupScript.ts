import { useEffect } from "react";
import { useEntityField } from "../stores/entity";
import { useTerminalStore } from "../stores/terminal";
import type { SetupStatus } from "../stores/terminal";

/**
 * Tracks setup script status for a session group. The setup script runs
 * server-side when the worktree is created. This hook reads the channel's
 * setupScript field to know whether to gate terminal access, and listens
 * for the setup_script_completed event via the session's agentStatus/events.
 *
 * Setup status is derived from:
 * - Channel has a setupScript → status starts as "running" when workspace is being prepared
 * - session_output event with type="setup_script_completed" → "completed" or "failed"
 */
export function useSetupScript(sessionGroupId: string | null, channelId: string | null) {
  const setupScript = useEntityField("channels", channelId ?? "", "setupScript") as string | null | undefined;
  const hasScript = Boolean(setupScript?.trim());

  // When the channel has a setup script but we haven't received a completion event yet,
  // assume it's running (the server runs it during workspace creation).
  // The useOrgEvents handler will update this to completed/failed when the event arrives.
  useEffect(() => {
    if (!sessionGroupId || !hasScript) return;
    const currentStatus = useTerminalStore.getState().setupStatus[sessionGroupId];
    // Only set to running if we haven't received a completion yet
    if (!currentStatus || currentStatus === "idle") {
      useTerminalStore.getState().setSetupStatus(sessionGroupId, "running");
    }
  }, [sessionGroupId, hasScript]);
}

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
