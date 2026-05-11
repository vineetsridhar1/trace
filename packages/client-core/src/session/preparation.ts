const STARTUP_CONNECTION_STATES = new Set([
  "pending",
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
  return (
    STARTUP_CONNECTION_STATES.has(state ?? "") ||
    Boolean(session.lastUserMessageAt ?? session.lastMessageAt)
  );
}
