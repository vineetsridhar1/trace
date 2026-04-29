import type { SessionEntity } from "../stores/entity.js";

export const CONTROLLER_RUN_SESSION_ROLE = "ultraplan_controller_run";

export function isUserVisibleSession(
  session: Pick<SessionEntity, "role"> | { role?: string | null } | null | undefined,
): boolean {
  return session?.role !== CONTROLLER_RUN_SESSION_ROLE;
}

export function filterUserVisibleSessions<T extends { role?: string | null }>(sessions: T[]): T[] {
  return sessions.filter(isUserVisibleSession);
}
