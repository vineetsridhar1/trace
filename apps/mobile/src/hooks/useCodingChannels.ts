import { useShallow } from "zustand/react/shallow";
import {
  useAuthStore,
  useEntityStore,
  type AuthState,
  type EntityState,
  type SessionEntity,
} from "@trace/client-core";
import type { Channel, ChannelGroup } from "@trace/gql";

export type ChannelFilter = "all" | "mine";

/**
 * A stable, primitive item-key for the channels list. `"channel:<id>"` for
 * channel rows, `"group:<id>"` for group headers. Primitives keep `useShallow`
 * referentially stable across renders, avoiding a React re-render loop.
 */
export type ChannelListItemKey = string;

export interface UseCodingChannelKeysArgs {
  filter: ChannelFilter;
  search: string;
}

export function useCodingChannelKeys({
  filter,
  search,
}: UseCodingChannelKeysArgs): ChannelListItemKey[] {
  const currentUserId = useAuthStore((s: AuthState) => s.user?.id);
  return useEntityStore(
    useShallow((state: EntityState) => buildKeys(state, currentUserId, filter, search)),
  );
}

/** Derive how many non-merged sessions are attached to a single channel. */
export function useChannelActiveSessionCount(channelId: string): number {
  return useEntityStore((state: EntityState) => {
    let count = 0;
    for (const session of Object.values(state.sessions) as SessionEntity[]) {
      if (session.channel?.id === channelId && session.sessionStatus !== "merged") {
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
  const kind = key.slice(0, colon) as "channel" | "group";
  const id = key.slice(colon + 1);
  return { kind, id };
}

function buildKeys(
  state: EntityState,
  currentUserId: string | undefined,
  filter: ChannelFilter,
  search: string,
): ChannelListItemKey[] {
  const coding = (Object.values(state.channels) as Channel[]).filter((c) => c.type === "coding");

  const mineChannelIds = new Set<string>();
  if (filter === "mine" && currentUserId) {
    for (const s of Object.values(state.sessions) as SessionEntity[]) {
      if (s.channel?.id && s.createdBy?.id === currentUserId) {
        mineChannelIds.add(s.channel.id);
      }
    }
  }

  const q = search.trim().toLowerCase();
  const visible = coding
    .filter((c) => (q ? c.name.toLowerCase().includes(q) : true))
    .filter((c) => (filter === "mine" ? mineChannelIds.has(c.id) : true))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name));

  const groups = Object.values(state.channelGroups) as ChannelGroup[];
  const hasAnyGroupAssignments = visible.some((c) => c.groupId);
  if (groups.length === 0 || !hasAnyGroupAssignments) {
    return visible.map((c) => `channel:${c.id}`);
  }

  const byGroup = new Map<string | null, Channel[]>();
  for (const c of visible) {
    const key = c.groupId ?? null;
    const arr = byGroup.get(key) ?? [];
    arr.push(c);
    byGroup.set(key, arr);
  }

  const keys: ChannelListItemKey[] = [];
  const ungrouped = byGroup.get(null) ?? [];
  for (const c of ungrouped) keys.push(`channel:${c.id}`);

  const sortedGroups = [...groups].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name),
  );
  for (const g of sortedGroups) {
    const arr = byGroup.get(g.id);
    if (!arr || arr.length === 0) continue;
    keys.push(`group:${g.id}`);
    for (const c of arr) keys.push(`channel:${c.id}`);
  }
  return keys;
}
