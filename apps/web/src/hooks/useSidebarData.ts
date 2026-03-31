import { useState, useEffect, useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { Channel, ChannelGroup, Chat, Repo, InboxItem } from "@trace/gql";
import { useAuthStore } from "../stores/auth";
import { useEntityStore, useEntityIds } from "../stores/entity";
import type { EntityTableMap } from "../stores/entity";
import { useUIStore } from "../stores/ui";
import { client } from "../lib/urql";
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
      repo { id name }
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
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const refreshTick = useUIStore((s) => s.refreshTick);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [chatsLoading, setChatsLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(CHANNELS_QUERY, { organizationId: activeOrgId, memberOnly: true }).toPromise();
    if (result.data?.channels) {
      upsertMany("channels", result.data.channels as Array<Channel & { id: string }>);
    }
    setChannelsLoading(false);
  }, [activeOrgId, upsertMany]);

  const fetchChannelGroups = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(CHANNEL_GROUPS_QUERY, { organizationId: activeOrgId }).toPromise();
    if (result.data?.channelGroups) {
      upsertMany("channelGroups", result.data.channelGroups as Array<ChannelGroup & { id: string }>);
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
    const result = await client.query(INBOX_ITEMS_QUERY, { organizationId: activeOrgId }).toPromise();
    if (result.data?.inboxItems) {
      upsertMany("inboxItems", result.data.inboxItems as Array<InboxItem & { id: string }>);
    }
  }, [activeOrgId, upsertMany]);

  // Initial fetch — channels, channelGroups, and chats are kept fresh by useOrgEvents,
  // so they don't need to refetch on refreshTick. Only inbox items need periodic refresh.
  useEffect(() => {
    fetchChannels();
    fetchChannelGroups();
    fetchChats();
    fetchRepos();
  }, [fetchChannels, fetchChannelGroups, fetchChats, fetchRepos]);

  useEffect(() => {
    fetchInboxItems();
  }, [fetchInboxItems, refreshTick]);

  const chatIds = useEntityIds("chats");

  const allChannelIds = useEntityIds(
    "channels",
    undefined,
    (a, b) => {
      const ac = a as EntityTableMap["channels"];
      const bc = b as EntityTableMap["channels"];
      return (ac.position ?? 0) - (bc.position ?? 0);
    },
  );

  useEffect(() => {
    if (channelsLoading) return;
    const { activeChannelId, activeChatId, activePage } = useUIStore.getState();
    if (activeChannelId || activeChatId || activePage !== "main") return;
    if (allChannelIds.length > 0) {
      useUIStore.getState().setActiveChannelId(allChannelIds[0]);
    }
  }, [channelsLoading, allChannelIds]);

  const groupIds = useEntityIds(
    "channelGroups",
    undefined,
    (a, b) => {
      const ag = a as EntityTableMap["channelGroups"];
      const bg = b as EntityTableMap["channelGroups"];
      return (ag.position ?? 0) - (bg.position ?? 0);
    },
  );

  // Narrow selectors: only re-render when groupId or position fields change,
  // not when any channel/group field updates (e.g. name, members, etc.)
  const channelGroupIdAndPosition = useEntityStore(
    useShallow((s) =>
      allChannelIds.map((id) => {
        const ch = s.channels[id];
        return ch ? `${ch.groupId ?? ""}:${ch.position ?? 0}` : "";
      }),
    ),
  );

  const groupPositions = useEntityStore(
    useShallow((s) =>
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
  const channelsById = useEntityStore((s) => s.channels);
  const channelGroupsById = useEntityStore((s) => s.channelGroups);

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
