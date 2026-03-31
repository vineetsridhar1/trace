/**
 * Payload types for internal/invisible session events that should not be
 * rendered in the session log. Used both for server-side query filtering
 * (excludePayloadTypes) and client-side node building (SKIP_ENTIRELY_TYPES).
 */
export const SESSION_INVISIBLE_PAYLOAD_TYPES = [
  "connection_lost",
  "connection_restored",
  "git_checkpoint",
  "git_checkpoint_rewrite",
  "title_generated",
  "config_changed",
  "prepare",
  "run",
  "send",
  "session_rehomed",
  "recovery_requested",
  "recovery_failed",
  "upgrade_workspace",
  "workspace_ready",
] as const;

/** Set version for O(1) lookups in client-side filtering */
export const SESSION_INVISIBLE_PAYLOAD_TYPES_SET = new Set<string>(SESSION_INVISIBLE_PAYLOAD_TYPES);
