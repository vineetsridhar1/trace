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

export type ChannelListItem =
  | { kind: "group"; key: string; groupName: string }
  | { kind: "channel"; key: string; channelId: string; name: string; subtitle: string };

export interface UseCodingChannelsArgs {
  filter: ChannelFilter;
  search: string;
}

/**
 * Derives the Channels tab list items from the entity store: applies the
 * coding-only filter, the "All / Mine" toggle, and the search term, then
 * flattens groups + channels into a single FlashList-friendly array.
 */
export function useCodingChannels({ filter, search }: UseCodingChannelsArgs): ChannelListItem[] {
  const currentUserId = useAuthStore((s: AuthState) => s.user?.id);
  return useEntityStore(
    useShallow((state: EntityState) => buildItems(state, currentUserId, filter, search)),
  );
}

function buildItems(
  state: EntityState,
  currentUserId: string | undefined,
  filter: ChannelFilter,
  search: string,
): ChannelListItem[] {
  const coding = (Object.values(state.channels) as Channel[]).filter((c) => c.type === "coding");

  const activeCountByChannel = new Map<string, number>();
  const mineChannelIds = new Set<string>();
  for (const s of Object.values(state.sessions) as SessionEntity[]) {
    const channelId = s.channel?.id;
    if (!channelId) continue;
    if (s.sessionStatus !== "merged") {
      activeCountByChannel.set(channelId, (activeCountByChannel.get(channelId) ?? 0) + 1);
    }
    if (currentUserId && s.createdBy?.id === currentUserId) {
      mineChannelIds.add(channelId);
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
    return visible.map((c) => toChannelItem(c, activeCountByChannel.get(c.id) ?? 0));
  }

  const byGroup = new Map<string | null, Channel[]>();
  for (const c of visible) {
    const key = c.groupId ?? null;
    const arr = byGroup.get(key) ?? [];
    arr.push(c);
    byGroup.set(key, arr);
  }

  const items: ChannelListItem[] = [];
  const ungrouped = byGroup.get(null) ?? [];
  for (const c of ungrouped) items.push(toChannelItem(c, activeCountByChannel.get(c.id) ?? 0));

  const sortedGroups = [...groups].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name),
  );
  for (const g of sortedGroups) {
    const arr = byGroup.get(g.id);
    if (!arr || arr.length === 0) continue;
    items.push({ kind: "group", key: `group:${g.id}`, groupName: g.name });
    for (const c of arr) items.push(toChannelItem(c, activeCountByChannel.get(c.id) ?? 0));
  }
  return items;
}

function toChannelItem(channel: Channel, activeCount: number): ChannelListItem {
  return {
    kind: "channel",
    key: `channel:${channel.id}`,
    channelId: channel.id,
    name: channel.name,
    subtitle: formatSubtitle(activeCount),
  };
}

function formatSubtitle(activeCount: number): string {
  if (activeCount === 0) return "No active sessions";
  if (activeCount === 1) return "1 active session";
  return `${activeCount} active sessions`;
}
