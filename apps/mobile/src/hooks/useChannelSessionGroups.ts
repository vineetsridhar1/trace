import { useShallow } from "zustand/react/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import {
  useEntityStore,
  type EntityState,
  type SessionEntity,
  type SessionGroupEntity,
} from "@trace/client-core";

export type ActiveSegment = "all" | "mine";
export type MergedArchivedSegment = "merged" | "archived";

export type SessionGroupSectionStatus =
  | "needs_input"
  | "in_review"
  | "in_progress"
  | "failed"
  | "stopped";

export interface SessionGroupSection {
  status: SessionGroupSectionStatus;
  ids: string[];
}

const SECTION_ORDER: SessionGroupSectionStatus[] = [
  "needs_input",
  "in_review",
  "in_progress",
  "failed",
  "stopped",
];

interface ChannelSessionGroupCounts {
  active: number;
  needsInput: number;
}

function isArchived(group: SessionGroupEntity): boolean {
  return Boolean(group.archivedAt) || group.status === "archived";
}

function isActive(group: SessionGroupEntity): boolean {
  return !isArchived(group) && group.status !== "merged";
}

function sortTimestamp(group: SessionGroupEntity): number {
  const ts = group._sortTimestamp ?? group.updatedAt ?? group.createdAt;
  const t = ts ? new Date(ts).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

/**
 * The "owner" of a session group is whoever started it — the user who
 * created the earliest session in the group. Mirrors the web app's
 * `createdBySession` derivation in `useSessionGroupRows`.
 */
function ownerUserId(state: EntityState, groupId: string): string | null {
  const ids = state._sessionIdsByGroup[groupId];
  if (!ids || ids.length === 0) return null;
  let bestSession: SessionEntity | null = null;
  let bestTs = Infinity;
  for (const id of ids) {
    const session = state.sessions[id] as SessionEntity | undefined;
    if (!session) continue;
    const ts = session.createdAt ? new Date(session.createdAt).getTime() : Infinity;
    if (ts < bestTs) {
      bestTs = ts;
      bestSession = session;
    }
  }
  const createdBy = bestSession?.createdBy as { id?: string } | undefined;
  return typeof createdBy?.id === "string" ? createdBy.id : null;
}

/**
 * Active session groups for a channel — non-archived, non-merged.
 * `scope: 'mine'` further restricts to groups whose earliest session was
 * started by `currentUserId`. Returning sorted primitive IDs keeps
 * `useShallow` referentially stable across renders.
 */
export function useActiveSessionGroupIds(
  channelId: string,
  scope: ActiveSegment,
  currentUserId: string | null,
): string[] {
  return useEntityStore(
    useShallow((state: EntityState) => {
      const groups = Object.values(state.sessionGroups) as SessionGroupEntity[];
      const visible = groups
        .filter((g) => g.channel?.id === channelId)
        .filter(isActive)
        .filter((g) => {
          if (scope === "all") return true;
          if (!currentUserId) return false;
          return ownerUserId(state, g.id) === currentUserId;
        })
        .sort((a, b) => sortTimestamp(b) - sortTimestamp(a) || a.id.localeCompare(b.id));
      return visible.map((g) => g.id);
    }),
  );
}

function sectionForStatus(
  status: string | null | undefined,
): SessionGroupSectionStatus {
  if (status === "needs_input") return "needs_input";
  if (status === "in_review") return "in_review";
  if (status === "failed") return "failed";
  if (status === "stopped") return "stopped";
  return "in_progress";
}

function areSectionsEqual(
  a: SessionGroupSection[],
  b: SessionGroupSection[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const sa = a[i]!;
    const sb = b[i]!;
    if (sa.status !== sb.status) return false;
    if (sa.ids.length !== sb.ids.length) return false;
    for (let j = 0; j < sa.ids.length; j++) {
      if (sa.ids[j] !== sb.ids[j]) return false;
    }
  }
  return true;
}

/**
 * Active session groups bucketed by display status, in priority order
 * (`needs_input` → `in_review` → `in_progress` → `failed` → `stopped`).
 * Empty sections are omitted. Uses a custom equality fn so downstream
 * consumers only re-render when membership actually changes.
 */
export function useChannelSessionGroupSections(
  channelId: string,
  scope: ActiveSegment,
  currentUserId: string | null,
): SessionGroupSection[] {
  return useStoreWithEqualityFn(
    useEntityStore,
    (state: EntityState): SessionGroupSection[] => {
      const buckets: Record<SessionGroupSectionStatus, SessionGroupEntity[]> = {
        needs_input: [],
        in_review: [],
        in_progress: [],
        failed: [],
        stopped: [],
      };

      for (const group of Object.values(state.sessionGroups) as SessionGroupEntity[]) {
        if (group.channel?.id !== channelId) continue;
        if (!isActive(group)) continue;
        if (scope === "mine") {
          if (!currentUserId) continue;
          if (ownerUserId(state, group.id) !== currentUserId) continue;
        }
        const section = sectionForStatus(group.status as string | null | undefined);
        buckets[section].push(group);
      }

      const sections: SessionGroupSection[] = [];
      for (const status of SECTION_ORDER) {
        const groups = buckets[status];
        if (groups.length === 0) continue;
        groups.sort(
          (a, b) => sortTimestamp(b) - sortTimestamp(a) || a.id.localeCompare(b.id),
        );
        sections.push({ status, ids: groups.map((g) => g.id) });
      }

      return sections;
    },
    areSectionsEqual,
  );
}

/**
 * Merged-or-archived groups for a channel. Lives on its own screen so the
 * primary channel landing stays focused on what's still in flight.
 */
export function useMergedArchivedSessionGroupIds(
  channelId: string,
  scope: MergedArchivedSegment,
): string[] {
  return useEntityStore(
    useShallow((state: EntityState) => {
      const groups = Object.values(state.sessionGroups) as SessionGroupEntity[];
      const visible = groups
        .filter((g) => g.channel?.id === channelId)
        .filter((g) => {
          if (scope === "archived") return isArchived(g);
          return !isArchived(g) && g.status === "merged";
        })
        .sort((a, b) => sortTimestamp(b) - sortTimestamp(a) || a.id.localeCompare(b.id));
      return visible.map((g) => g.id);
    }),
  );
}

/**
 * Counts for the active screen subtitle: how many non-archived, non-merged
 * groups exist in this channel and how many of those are waiting on the user.
 */
export function useChannelSessionGroupCounts(channelId: string): ChannelSessionGroupCounts {
  return useEntityStore(
    useShallow((state: EntityState) => {
      let active = 0;
      let needsInput = 0;
      for (const group of Object.values(state.sessionGroups) as SessionGroupEntity[]) {
        if (group.channel?.id !== channelId) continue;
        if (!isActive(group)) continue;
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
