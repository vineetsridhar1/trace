/**
 * Payload types that are never rendered in the session event log.
 * Used both for server-side query filtering (excludePayloadTypes)
 * and client-side node building (SKIP_ENTIRELY_TYPES).
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
  "prepare",
  "run",
  "send",
  "session_rehomed",
  "recovery_requested",
  "recovery_failed",
  "upgrade_workspace",
  "workspace_ready",
  "session_resumed",
  "session_terminated",
] as const;

/** Set version for O(1) client-side lookups in buildSessionNodes */
export const HIDDEN_SESSION_PAYLOAD_TYPE_SET: ReadonlySet<string> = new Set(
  HIDDEN_SESSION_PAYLOAD_TYPES,
);
