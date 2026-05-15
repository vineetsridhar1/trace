const ACTIVE_STARTUP_CONNECTION_STATES = new Set([
  "requested",
  "provisioning",
  "booting",
  "connecting",
]);

export type SessionPreparationFields = {
  agentStatus?: string | null;
  sessionStatus?: string | null;
  workdir?: string | null;
  lastUserMessageAt?: string | null;
  lastMessageAt?: string | null;
  connection?: Record<string, unknown> | null;
};

function connectionState(connection: SessionPreparationFields["connection"]): string | null {
  if (!connection || typeof connection !== "object") return null;
  const state = (connection as Record<string, unknown>).state;
  return typeof state === "string" ? state : null;
}

export function isSessionPreparing(session: SessionPreparationFields | null | undefined): boolean {
  if (!session) return false;
  if (session.agentStatus !== "not_started") return false;
  if (session.sessionStatus !== "in_progress") return false;
  if (session.workdir) return false;

  const state = connectionState(session.connection);
  const hasMessage = Boolean(session.lastUserMessageAt ?? session.lastMessageAt);
  if (state === "pending") {
    return hasMessage;
  }
  return ACTIVE_STARTUP_CONNECTION_STATES.has(state ?? "") || hasMessage;
}

/**
 * Whether the session's runtime connection is in an active startup state.
 * Use this for input-gating: it catches the cloud optimistic-active window
 * where agentStatus has been locally patched to "active" before the runtime
 * is up — a case isSessionPreparing's "not_started" gate misses.
 */
export function isSessionRuntimeStartingUp(
  connection: SessionPreparationFields["connection"],
): boolean {
  const state = connectionState(connection);
  return state !== null && ACTIVE_STARTUP_CONNECTION_STATES.has(state);
}
