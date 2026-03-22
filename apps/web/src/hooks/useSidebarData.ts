import { useState, useEffect, useCallback, useMemo } from "react";
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
  const channelsById = useEntityStore((s) => s.channels);
  const channelGroupsById = useEntityStore((s) => s.channelGroups);
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

  useEffect(() => {
    fetchChannels();
    fetchChannelGroups();
    fetchChats();
    fetchRepos();
    fetchInboxItems();
  }, [fetchChannels, fetchChannelGroups, fetchChats, fetchRepos, fetchInboxItems, refreshTick]);

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

  const groupIds = useEntityIds(
    "channelGroups",
    undefined,
    (a, b) => {
      const ag = a as EntityTableMap["channelGroups"];
      const bg = b as EntityTableMap["channelGroups"];
      return (ag.position ?? 0) - (bg.position ?? 0);
    },
  );

  const { channelIdsByGroup, topLevelItems } = useMemo(() => {
    const byGroup: Record<string, string[]> = {};
    const items: TopLevelItem[] = [];

    for (const id of allChannelIds) {
      const channel = channelsById[id];
      if (!channel) continue;
      if (channel.groupId) {
        if (!byGroup[channel.groupId]) byGroup[channel.groupId] = [];
        byGroup[channel.groupId].push(id);
      } else {
        items.push({ kind: "channel", id, position: channel.position ?? 0 });
      }
    }

    for (const id of groupIds) {
      const group = channelGroupsById[id];
      if (!group) continue;
      items.push({ kind: "group", id, position: group.position ?? 0 });
    }

    items.sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      if (a.kind !== b.kind) return a.kind === "channel" ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    return { channelIdsByGroup: byGroup, topLevelItems: items };
  }, [allChannelIds, groupIds, channelsById, channelGroupsById]);

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
