import { useShallow } from "zustand/react/shallow";
import {
  useEntityStore,
  type EntityState,
  type SessionEntity,
  type SessionGroupEntity,
} from "@trace/client-core";

export type SessionGroupSegment = "active" | "merged" | "archived";

interface ChannelSessionGroupCounts {
  active: number;
  needsInput: number;
}

function isArchived(group: SessionGroupEntity): boolean {
  return Boolean(group.archivedAt) || group.status === "archived";
}

function matchesSegment(group: SessionGroupEntity, segment: SessionGroupSegment): boolean {
  if (segment === "archived") return isArchived(group);
  if (isArchived(group)) return false;
  if (segment === "merged") return group.status === "merged";
  return group.status !== "merged";
}

function sortTimestamp(group: SessionGroupEntity): number {
  const ts = group._sortTimestamp ?? group.updatedAt ?? group.createdAt;
  const t = ts ? new Date(ts).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

/**
 * Stable, sorted list of session-group IDs that belong to this channel
 * within the active segment. Returning primitive IDs keeps `useShallow`
 * referentially stable across renders (same pattern as `useCodingChannelKeys`).
 */
export function useChannelSessionGroupIds(
  channelId: string,
  segment: SessionGroupSegment,
): string[] {
  return useEntityStore(
    useShallow((state: EntityState) => {
      const groups = Object.values(state.sessionGroups) as SessionGroupEntity[];
      const visible = groups
        .filter((g) => g.channel?.id === channelId)
        .filter((g) => matchesSegment(g, segment))
        .sort((a, b) => sortTimestamp(b) - sortTimestamp(a) || a.id.localeCompare(b.id));
      return visible.map((g) => g.id);
    }),
  );
}

/**
 * Counts for the channel header subtitle: how many non-archived, non-merged
 * groups exist in this channel and how many of those are waiting on the user.
 */
export function useChannelSessionGroupCounts(channelId: string): ChannelSessionGroupCounts {
  return useEntityStore(
    useShallow((state: EntityState) => {
      let active = 0;
      let needsInput = 0;
      for (const group of Object.values(state.sessionGroups) as SessionGroupEntity[]) {
        if (group.channel?.id !== channelId) continue;
        if (isArchived(group)) continue;
        if (group.status === "merged") continue;
        active += 1;
        if (group.status === "needs_input") needsInput += 1;
      }
      return { active, needsInput };
    }),
  );
}

/**
 * Pick the most-recently-active session within a group so the row can show
 * its `_lastEventPreview` and `lastMessageAt`. Returns `null` when the group
 * has no sessions yet (rare — group creation always seeds one).
 */
export function useLatestSessionIdForGroup(groupId: string): string | null {
  return useEntityStore((state: EntityState) => {
    const sessionIds = state._sessionIdsByGroup[groupId];
    if (!sessionIds || sessionIds.length === 0) return null;
    let bestId: string | null = null;
    let bestTs = -Infinity;
    for (const id of sessionIds) {
      const session = state.sessions[id] as SessionEntity | undefined;
      if (!session) continue;
      const tsRaw =
        session._sortTimestamp
        ?? session.lastMessageAt
        ?? session.updatedAt
        ?? session.createdAt;
      const ts = tsRaw ? new Date(tsRaw).getTime() : 0;
      if (ts > bestTs) {
        bestTs = ts;
        bestId = id;
      }
    }
    return bestId;
  });
}
