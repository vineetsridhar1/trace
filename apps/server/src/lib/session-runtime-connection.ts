/**
 * Runtime ownership lives on SessionGroup. Session.connection is retained only
 * as a compatibility projection and for genuinely ungrouped legacy sessions.
 */
export function canonicalSessionConnection(session: {
  connection: unknown;
  sessionGroupId?: string | null;
  sessionGroup?: { connection?: unknown } | null;
}): unknown {
  if (session.sessionGroup) return session.sessionGroup.connection ?? null;
  return session.sessionGroupId ? null : session.connection;
}

export function runtimeInstanceIdFromConnection(connection: unknown): string | null {
  if (!connection || typeof connection !== "object" || Array.isArray(connection)) return null;
  const runtimeInstanceId = (connection as { runtimeInstanceId?: unknown }).runtimeInstanceId;
  return typeof runtimeInstanceId === "string" && runtimeInstanceId.trim()
    ? runtimeInstanceId
    : null;
}

export function canonicalSessionRuntimeInstanceId(session: {
  connection: unknown;
  sessionGroup?: { connection?: unknown } | null;
}): string | null {
  return runtimeInstanceIdFromConnection(canonicalSessionConnection(session));
}
