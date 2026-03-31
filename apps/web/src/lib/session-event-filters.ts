/** Payload types that are not rendered in session logs and should be excluded from queries/node building. */
export const HIDDEN_SESSION_PAYLOAD_TYPES = [
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

export const HIDDEN_SESSION_PAYLOAD_TYPE_SET = new Set<string>(HIDDEN_SESSION_PAYLOAD_TYPES);
