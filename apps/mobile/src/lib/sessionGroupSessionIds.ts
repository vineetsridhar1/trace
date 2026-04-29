import { isUserVisibleSession, type EntityState, type SessionEntity } from "@trace/client-core";

const EMPTY_IDS: string[] = [];

function sessionTime(session: SessionEntity | undefined): number {
  const raw =
    session?._sortTimestamp ?? session?.lastMessageAt ?? session?.updatedAt ?? session?.createdAt;
  const value = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
}

export function selectSessionGroupSessionIds(state: EntityState, groupId: string): string[] {
  const ids = state._sessionIdsByGroup[groupId];
  if (!ids || ids.length === 0) return EMPTY_IDS;
  return ids
    .filter((id) => isUserVisibleSession(state.sessions[id]))
    .sort((a, b) => {
      const diff = sessionTime(state.sessions[b]) - sessionTime(state.sessions[a]);
      return diff !== 0 ? diff : a.localeCompare(b);
    });
}
