import type { EntityState } from "@trace/client-core";

const EMPTY_IDS: readonly string[] = Object.freeze([]);

/**
 * IDs of every session the user is still interacting with — everything except
 * `merged`, `failed`, and sessions whose group is archived. Sorted by
 * `_sortTimestamp` descending so accessory/player state stays aligned.
 */
export function selectActiveSessionIds(state: EntityState): readonly string[] {
  let out: Array<{ id: string; ts: string }> | null = null;
  for (const id in state.sessions) {
    const session = state.sessions[id];
    if (session.sessionStatus === "merged") continue;
    if (session.agentStatus === "failed") continue;
    if (session.sessionGroupId) {
      const group = state.sessionGroups[session.sessionGroupId];
      if (group && (group.archivedAt || group.status === "archived")) continue;
    }
    (out ??= []).push({ id, ts: session._sortTimestamp ?? "" });
  }
  if (!out) return EMPTY_IDS;
  out.sort((a, b) => (a.ts === b.ts ? 0 : a.ts < b.ts ? 1 : -1));
  return out.map((entry) => entry.id);
}
