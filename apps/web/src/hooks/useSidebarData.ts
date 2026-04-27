import { useState, useEffect, useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { Channel, ChannelGroup, Chat, Repo, InboxItem } from "@trace/gql";
import { useAuthStore } from "@trace/client-core";
import { useEntityStore, useEntityIds } from "@trace/client-core";
import type { EntityTableMap } from "@trace/client-core";
import { useUIStore } from "../stores/ui";
import { client } from "../lib/urql";
import { features } from "../lib/features";
import { gql } from "@urql/core";

const CHANNELS_QUERY = gql`
  query Channels($organizationId: ID!, $memberOnly: Boolean) {
    channels(organizationId: $organizationId, memberOnly: $memberOnly) {
      id
      name
      type
      position
      groupId
      baseBranch
      setupScript
      runScripts
      repo {
        id
        name
      }
    }
  }
`;

const CHANNEL_GROUPS_QUERY = gql`
  query ChannelGroups($organizationId: ID!) {
    channelGroups(organizationId: $organizationId) {
      id
      name
      position
      isCollapsed
    }
  }
`;

const REPOS_QUERY = gql`
  query Repos($organizationId: ID!) {
    repos(organizationId: $organizationId) {
      id
      name
      remoteUrl
      defaultBranch
      webhookActive
    }
  }
`;

const CHATS_QUERY = gql`
  query Chats {
    chats {
      id
      type
      name
      members {
        user {
          id
          name
          avatarUrl
        }
        joinedAt
      }
      createdAt
      updatedAt
    }
  }
`;

const INBOX_ITEMS_QUERY = gql`
  query InboxItems($organizationId: ID!) {
    inboxItems(organizationId: $organizationId) {
      id
      itemType
      status
      title
      summary
      payload
      userId
      sourceType
      sourceId
      createdAt
      resolvedAt
    }
  }
`;

export type TopLevelItem =
  | { kind: "channel"; id: string; position: number }
  | { kind: "group"; id: string; position: number };

export function useSidebarData() {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const upsertMany = useEntityStore(
    (s: {
      upsertMany: <T extends keyof EntityTableMap>(
        entityType: T,
        items: Array<EntityTableMap[T] & { id: string }>,
      ) => void;
    }) => s.upsertMany,
  );
  const refreshTick = useUIStore((s: { refreshTick: number }) => s.refreshTick);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [chatsLoading, setChatsLoading] = useState(features.messaging);

  const fetchChannels = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client
      .query(CHANNELS_QUERY, { organizationId: activeOrgId, memberOnly: true })
      .toPromise();
    if (result.data?.channels) {
      upsertMany("channels", result.data.channels as Array<Channel & { id: string }>);
    }
    setChannelsLoading(false);
  }, [activeOrgId, upsertMany]);

  const fetchChannelGroups = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client
      .query(CHANNEL_GROUPS_QUERY, { organizationId: activeOrgId })
      .toPromise();
    if (result.data?.channelGroups) {
      upsertMany(
        "channelGroups",
        result.data.channelGroups as Array<ChannelGroup & { id: string }>,
      );
    }
  }, [activeOrgId, upsertMany]);

  const fetchRepos = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(REPOS_QUERY, { organizationId: activeOrgId }).toPromise();
    if (result.data?.repos) {
      upsertMany("repos", result.data.repos as Array<Repo & { id: string }>);
    }
  }, [activeOrgId, upsertMany]);

  const fetchChats = useCallback(async () => {
    const result = await client.query(CHATS_QUERY, {}).toPromise();
    if (result.data?.chats) {
      upsertMany("chats", result.data.chats as Array<Chat & { id: string }>);
    }
    setChatsLoading(false);
  }, [upsertMany]);

  const fetchInboxItems = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client
      .query(INBOX_ITEMS_QUERY, { organizationId: activeOrgId })
      .toPromise();
    if (result.data?.inboxItems) {
      upsertMany("inboxItems", result.data.inboxItems as Array<InboxItem & { id: string }>);
    }
  }, [activeOrgId, upsertMany]);

  // Initial fetch — channels, channelGroups, and chats are kept fresh by useOrgEvents,
  // so they don't need to refetch on refreshTick. Only inbox items need periodic refresh.
  useEffect(() => {
    fetchChannels();
    fetchChannelGroups();
    if (features.messaging) {
      fetchChats();
    }
    fetchRepos();
  }, [fetchChannels, fetchChannelGroups, fetchChats, fetchRepos]);

  useEffect(() => {
    if (features.messaging) return;
    const { activeChatId } = useUIStore.getState();
    if (activeChatId) {
      useUIStore.getState().setActiveChatId(null);
    }
  }, []);

  useEffect(() => {
    fetchInboxItems();
  }, [fetchInboxItems, refreshTick]);

  const chatIds = useEntityIds("chats");

  const allChannelIds = useEntityIds(
    "channels",
    features.messaging ? undefined : (c) => c.type !== "text",
    (a, b) => {
      const ac = a as EntityTableMap["channels"];
      const bc = b as EntityTableMap["channels"];
      return (ac.position ?? 0) - (bc.position ?? 0);
    },
  );

  useEffect(() => {
    if (channelsLoading) return;
    if (!features.messaging) {
      const { activeChannelId } = useUIStore.getState();
      if (activeChannelId) {
        const activeChannel = useEntityStore.getState().channels[activeChannelId];
        if (activeChannel?.type === "text") {
          useUIStore.getState().setActiveChannelId(allChannelIds[0] ?? null);
          return;
        }
      }
    }
    const { activeChannelId, activeChatId, activePage } = useUIStore.getState();
    if (activeChannelId || activeChatId || activePage !== "main") return;
    if (allChannelIds.length > 0) {
      useUIStore.getState().setActiveChannelId(allChannelIds[0]);
    }
  }, [channelsLoading, allChannelIds]);

  const groupIds = useEntityIds("channelGroups", undefined, (a, b) => {
    const ag = a as EntityTableMap["channelGroups"];
    const bg = b as EntityTableMap["channelGroups"];
    return (ag.position ?? 0) - (bg.position ?? 0);
  });

  // Narrow selectors: only re-render when groupId or position fields change,
  // not when any channel/group field updates (e.g. name, members, etc.)
  const channelGroupIdAndPosition = useEntityStore(
    useShallow((s: { channels: Record<string, Channel> }) =>
      allChannelIds.map((id) => {
        const ch = s.channels[id];
        return ch ? `${ch.groupId ?? ""}:${ch.position ?? 0}` : "";
      }),
    ),
  );

  const groupPositions = useEntityStore(
    useShallow((s: { channelGroups: Record<string, ChannelGroup> }) =>
      groupIds.map((id) => s.channelGroups[id]?.position ?? 0),
    ),
  );

  const { channelIdsByGroup, topLevelItems } = useMemo(() => {
    const byGroup: Record<string, string[]> = {};
    const items: TopLevelItem[] = [];

    for (let i = 0; i < allChannelIds.length; i++) {
      const id = allChannelIds[i];
      const parts = channelGroupIdAndPosition[i];
      if (!parts && parts !== "") continue;
      const colonIdx = parts.lastIndexOf(":");
      const gId = parts.slice(0, colonIdx);
      const pos = Number(parts.slice(colonIdx + 1));
      if (gId) {
        if (!byGroup[gId]) byGroup[gId] = [];
        byGroup[gId].push(id);
      } else {
        items.push({ kind: "channel", id, position: pos });
      }
    }

    for (let i = 0; i < groupIds.length; i++) {
      items.push({ kind: "group", id: groupIds[i], position: groupPositions[i] });
    }

    items.sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      if (a.kind !== b.kind) return a.kind === "channel" ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    return { channelIdsByGroup: byGroup, topLevelItems: items };
  }, [allChannelIds, groupIds, channelGroupIdAndPosition, groupPositions]);

  // Full maps returned for DnD consumers — these subscribe broadly but only
  // child components that destructure them will re-render.
  const channelsById = useEntityStore((s: { channels: Record<string, Channel> }) => s.channels);
  const channelGroupsById = useEntityStore(
    (s: { channelGroups: Record<string, ChannelGroup> }) => s.channelGroups,
  );

  return {
    activeOrgId,
    channelsLoading,
    chatsLoading,
    chatIds,
    allChannelIds,
    groupIds,
    channelIdsByGroup,
    topLevelItems,
    channelsById,
    channelGroupsById,
  };
}
