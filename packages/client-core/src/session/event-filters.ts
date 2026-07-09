/**
 * Payload types that are never rendered in the session event log.
 * Used both for server-side query filtering (excludePayloadTypes)
 * and client-side node building (skipped in buildSessionNodes).
 *
 * Keeping a single source of truth avoids drift between the two.
 */
export const HIDDEN_SESSION_PAYLOAD_TYPES = [
  "connection_lost",
  "connection_restored",
  "git_checkpoint",
  "git_checkpoint_rewrite",
  "title_generated",
  "config_changed",
  "branch_renamed",
  "usage",
  "usage_updated",
  "prepare",
  "run",
  "send",
  "session_rehomed",
  "session_runtime_start_requested",
  "session_runtime_provisioning",
  "session_runtime_connecting",
  "session_runtime_connected",
  "session_runtime_start_failed",
  "session_runtime_start_timed_out",
  "session_runtime_stopping",
  "session_runtime_stopped",
  "recovery_requested",
  "recovery_failed",
  "tool_session_recovered",
  "upgrade_workspace",
  "workspace_ready",
  "session_resumed",
  "session_terminated",
  "design_generation_delta",
  "design_generation_completed",
] as const;

/** Set version for O(1) client-side lookups in buildSessionNodes */
export const HIDDEN_SESSION_PAYLOAD_TYPE_SET: ReadonlySet<string> = new Set(
  HIDDEN_SESSION_PAYLOAD_TYPES,
);
