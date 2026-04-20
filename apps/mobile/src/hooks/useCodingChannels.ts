import { useShallow } from "zustand/react/shallow";
import {
  useEntityStore,
  type EntityState,
  type SessionEntity,
} from "@trace/client-core";
import type { Channel, ChannelGroup } from "@trace/gql";

/**
 * A stable, primitive item-key for the channels list. `"channel:<id>"` for
 * channel rows, `"group:<id>"` for group headers. Primitives keep `useShallow`
 * referentially stable across renders, avoiding a React re-render loop.
 */
export type ChannelListItemKey = string;

export interface UseCodingChannelKeysArgs {
  search: string;
}

export function useCodingChannelKeys({
  search,
}: UseCodingChannelKeysArgs): ChannelListItemKey[] {
  return useEntityStore(useShallow((state: EntityState) => buildKeys(state, search)));
}

/**
 * Derive how many *actively working* sessions are attached to a single
 * channel. "Active" means the user can still influence the session:
 * `in_progress` (agent working) or `needs_input` (waiting on the user).
 * Completed (`merged`), archived, or stuck (`failed`, `in_review`)
 * sessions do not count.
 */
export function useChannelActiveSessionCount(channelId: string): number {
  return useEntityStore((state: EntityState) => {
    let count = 0;
    for (const session of Object.values(state.sessions) as SessionEntity[]) {
      if (session.channel?.id !== channelId) continue;
      if (session.sessionStatus === "in_progress" || session.sessionStatus === "needs_input") {
        count += 1;
      }
    }
    return count;
  });
}

export function parseItemKey(
  key: ChannelListItemKey,
): { kind: "channel" | "group"; id: string } {
  const colon = key.indexOf(":");
  if (colon === -1) return { kind: "channel", id: key };
  const kind = key.slice(0, colon) as "channel" | "group";
  const id = key.slice(colon + 1);
  return { kind, id };
}

function buildKeys(state: EntityState, search: string): ChannelListItemKey[] {
  const coding = (Object.values(state.channels) as Channel[]).filter((c) => c.type === "coding");

  const q = search.trim().toLowerCase();
  const visible = coding
    .filter((c) => (q ? c.name.toLowerCase().includes(q) : true))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name));

  const groups = Object.values(state.channelGroups) as ChannelGroup[];
  const hasAnyGroupAssignments = visible.some((c) => c.groupId);
  if (groups.length === 0 || !hasAnyGroupAssignments) {
    return visible.map((c) => `channel:${c.id}`);
  }

  // Partition by groupId; `null` is ungrouped.
  const byGroup = new Map<string | null, Channel[]>();
  for (const c of visible) {
    const key = c.groupId ?? null;
    const arr = byGroup.get(key) ?? [];
    arr.push(c);
    byGroup.set(key, arr);
  }

  const keys: ChannelListItemKey[] = [];

  // Ungrouped channels first (no header).
  const ungrouped = byGroup.get(null) ?? [];
  for (const c of ungrouped) keys.push(`channel:${c.id}`);
  byGroup.delete(null);

  // Known groups in order, consuming their buckets as we go.
  const sortedGroups = [...groups].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name),
  );
  for (const g of sortedGroups) {
    const arr = byGroup.get(g.id);
    if (!arr || arr.length === 0) continue;
    keys.push(`group:${g.id}`);
    for (const c of arr) keys.push(`channel:${c.id}`);
    byGroup.delete(g.id);
  }

  // Orphan buckets: channels whose `groupId` points at a group that hasn't
  // hydrated yet (or was deleted). Surface them as ungrouped rather than
  // drop them — the group event typically arrives within ~1 subscription
  // tick after the channel event, and either way users shouldn't lose rows.
  for (const arr of byGroup.values()) {
    for (const c of arr) keys.push(`channel:${c.id}`);
  }

  return keys;
}
