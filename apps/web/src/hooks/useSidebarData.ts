import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import type {
  Channel,
  ChannelGroup,
  Chat,
  Repo,
  Project,
  InboxItem,
  SessionGroup,
} from "@trace/gql";
import { mergeSessionGroupEntity, useAuthStore } from "@trace/client-core";
import { useEntityStore, useEntityIds } from "@trace/client-core";
import type { EntityTableMap } from "@trace/client-core";
import { useUIStore } from "../stores/ui";
import { client } from "../lib/urql";
import { features } from "../lib/features";
import { fetchSharedChannel } from "../lib/shared-channel";
import { gql } from "@urql/core";
import { useHomeDataStore } from "../stores/home-data";

const CHANNELS_QUERY = gql`
  query Channels($organizationId: ID!, $memberOnly: Boolean) {
    channels(organizationId: $organizationId, memberOnly: $memberOnly) {
      id
      name
      type
      visibility
      position
      groupId
      baseBranch
      setupScript
      runScripts
      viewerIsMember
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
      provider
      remoteUrl
      defaultBranch
      webhookActive
      applicationConfig {
        setupScripts {
          id
          name
          command
          workingDirectory
          env {
            key
            secretName
          }
        }
        runScripts {
          id
          name
          command
        }
        applications {
          id
          name
          processes {
            id
            name
            command
            workingDirectory
            env {
              key
              secretName
            }
            required
            ports {
              id
              label
              port
              protocol
              defaultForwardingEnabled
              healthPath
            }
          }
        }
      }
    }
  }
`;

const PROJECTS_QUERY = gql`
  query Projects($organizationId: ID!) {
    projects(organizationId: $organizationId) {
      id
      name
      repo {
        id
        name
      }
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

const SIDEBAR_SESSION_GROUPS_QUERY = gql`
  query SidebarSessionGroups($channelId: ID!, $archived: Boolean, $includeActiveMerged: Boolean) {
    sessionGroups(
      channelId: $channelId
      archived: $archived
      includeActiveMerged: $includeActiveMerged
    ) {
      id
      name
      slug
      status
      visibility
      owner {
        id
        name
        avatarUrl
      }
      prUrl
      worktreeDeleted
      archivedAt
      setupStatus
      setupError
      channel {
        id
      }
      repo {
        id
        name
      }
      branch
      workdir
      connection {
        state
        runtimeInstanceId
        runtimeLabel
        lastError
        retryCount
        canRetry
        canMove
        autoRetryable
      }
      createdAt
      updatedAt
      sessions {
        id
        name
        agentStatus
        sessionStatus
        tool
        model
        reasoningEffort
        hosting
        branch
        workdir
        prUrl
        worktreeDeleted
        sessionGroupId
        lastUserMessageAt
        lastMessageAt
        inputTokens
        outputTokens
        cacheReadTokens
        cacheCreationTokens
        connection {
          state
          runtimeInstanceId
          runtimeLabel
          lastError
          retryCount
          canRetry
          canMove
          autoRetryable
        }
        createdBy {
          id
          name
          avatarUrl
        }
        repo {
          id
          name
        }
        channel {
          id
        }
        createdAt
        updatedAt
      }
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
  const removeEntity = useEntityStore(
    (s: { remove: (entityType: keyof EntityTableMap, id: string) => void }) => s.remove,
  );
  const refreshTick = useUIStore((s: { refreshTick: number }) => s.refreshTick);
  const activeChannelId = useUIStore((s: { activeChannelId: string | null }) => s.activeChannelId);
  const homeRetryRequest = useHomeDataStore((state) => state.retryRequest);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsLoadFailed, setChannelsLoadFailed] = useState(false);
  const [chatsLoading, setChatsLoading] = useState(features.messaging);
  const channelsRequestRef = useRef(0);

  const fetchChannels = useCallback(async () => {
    const request = ++channelsRequestRef.current;
    if (!activeOrgId) {
      setChannelsLoading(false);
      return;
    }
    setChannelsLoading(true);
    setChannelsLoadFailed(false);
    try {
      const result = await client
        .query(CHANNELS_QUERY, { organizationId: activeOrgId, memberOnly: true })
        .toPromise();
      if (request !== channelsRequestRef.current) return;
      if (result.data?.channels) {
        const memberChannels = result.data.channels as Array<Channel & { id: string }>;
        const memberChannelIds = new Set(memberChannels.map((channel) => channel.id));
        upsertMany("channels", memberChannels);

        // A shared link can point at a project the viewer hasn't joined. Load it
        // so the deep link resolves and survives the prune below, even though the
        // member-only sidebar list omits it.
        const linkedChannelId = useUIStore.getState().activeChannelId;
        if (linkedChannelId && !memberChannelIds.has(linkedChannelId)) {
          const linkedChannel = await fetchSharedChannel(linkedChannelId);
          if (request !== channelsRequestRef.current) return;
          if (linkedChannel) {
            upsertMany("channels", [linkedChannel]);
            memberChannelIds.add(linkedChannel.id);
          }
        }

        for (const channelId of Object.keys(useEntityStore.getState().channels)) {
          if (!memberChannelIds.has(channelId)) {
            removeEntity("channels", channelId);
          }
        }
      }
      setChannelsLoadFailed(Boolean(result.error));
    } catch {
      if (request === channelsRequestRef.current) setChannelsLoadFailed(true);
    } finally {
      if (request === channelsRequestRef.current) setChannelsLoading(false);
    }
  }, [activeOrgId, removeEntity, upsertMany]);

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

  const fetchProjects = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(PROJECTS_QUERY, { organizationId: activeOrgId }).toPromise();
    if (result.data?.projects) {
      upsertMany("projects", result.data.projects as Array<Project & { id: string }>);
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

  const fetchSidebarSessionGroups = useCallback(
    async (channelIds: string[]) => {
      if (!activeOrgId) return;
      useHomeDataStore.getState().markCodingStatus(activeOrgId, "loading");
      if (channelIds.length === 0) {
        useHomeDataStore.getState().markCodingStatus(activeOrgId, "ready");
        return;
      }
      try {
        const results = await Promise.all(
          channelIds.map((channelId) =>
            client
              .query(SIDEBAR_SESSION_GROUPS_QUERY, {
                channelId,
                archived: false,
                includeActiveMerged: true,
              })
              .toPromise(),
          ),
        );
        if (useAuthStore.getState().activeOrgId !== activeOrgId) return;

        const groups = results.flatMap((result) =>
          result.data?.sessionGroups
            ? (result.data.sessionGroups as Array<SessionGroup & { id: string }>)
            : [],
        );
        if (groups.length) {
          const entityState = useEntityStore.getState();
          const sessions = groups.flatMap((group) => group.sessions ?? []);
          const sessionGroups = groups.map((group) => ({
            ...mergeSessionGroupEntity(
              entityState.sessionGroups[group.id],
              group as EntityTableMap["sessionGroups"],
            ),
            sessions: entityState.sessionGroups[group.id]?.sessions ?? [],
            _sortTimestamp:
              group.sessions?.[0]?.lastMessageAt ??
              group.sessions?.[0]?.lastUserMessageAt ??
              group.sessions?.[0]?.updatedAt ??
              group.updatedAt,
          }));

          upsertMany("sessions", sessions as Array<EntityTableMap["sessions"] & { id: string }>);
          upsertMany(
            "sessionGroups",
            sessionGroups as Array<EntityTableMap["sessionGroups"] & { id: string }>,
          );
        }
        useHomeDataStore
          .getState()
          .markCodingStatus(
            activeOrgId,
            results.some((result) => result.error) ? "error" : "ready",
          );
      } catch {
        useHomeDataStore.getState().markCodingStatus(activeOrgId, "error");
      }
    },
    [activeOrgId, upsertMany],
  );

  // Initial fetches stay fresh through useOrgEvents. homeRetryRequest is only
  // incremented by the explicit Home error-state retry button.
  useEffect(() => {
    if (activeOrgId) useHomeDataStore.getState().ensureOrganization(activeOrgId);
    void fetchChannels();
    void fetchChannelGroups();
    if (features.messaging) {
      void fetchChats();
    }
    void fetchRepos();
    void fetchProjects();
  }, [
    activeOrgId,
    fetchChannels,
    fetchChannelGroups,
    fetchChats,
    fetchProjects,
    fetchRepos,
    homeRetryRequest,
  ]);

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

  // Sidebar listing stays member-only; channels opened through a shared link
  // live in the store but are not listed here.
  const allChannelIds = useEntityIds(
    "channels",
    (c) => (features.messaging || c.type !== "text") && c.viewerIsMember !== false,
    (a, b) => {
      const ac = a as EntityTableMap["channels"];
      const bc = b as EntityTableMap["channels"];
      return (ac.position ?? 0) - (bc.position ?? 0);
    },
  );

  useEffect(() => {
    if (channelsLoading) return;
    const { activeChannelId } = useUIStore.getState();
    if (!activeChannelId) return;
    const activeChannel = useEntityStore.getState().channels[activeChannelId];
    if (!features.messaging && activeChannel?.type === "text") {
      useUIStore.getState().setActiveChannelId(allChannelIds[0] ?? null);
      return;
    }
    // Only bail out when the channel is unknown entirely. A channel the viewer
    // has not joined is absent from allChannelIds but still readable by link.
    if (!activeChannel) {
      useUIStore.getState().setActiveChannelId(allChannelIds[0] ?? null);
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

  const codingChannelIds = useMemo(
    () => allChannelIds.filter((id) => channelsById[id]?.type === "coding"),
    [allChannelIds, channelsById],
  );

  // The project the viewer reached through a shared link without joining it.
  const linkedChannelId = useMemo(() => {
    if (!activeChannelId) return null;
    return channelsById[activeChannelId]?.viewerIsMember === false ? activeChannelId : null;
  }, [activeChannelId, channelsById]);

  useEffect(() => {
    if (channelsLoading) return;
    if (channelsLoadFailed) {
      if (activeOrgId) useHomeDataStore.getState().markCodingStatus(activeOrgId, "error");
      return;
    }
    void fetchSidebarSessionGroups(codingChannelIds);
  }, [
    activeOrgId,
    channelsLoadFailed,
    channelsLoading,
    codingChannelIds,
    fetchSidebarSessionGroups,
    refreshTick,
  ]);

  return {
    activeOrgId,
    channelsLoading,
    chatsLoading,
    chatIds,
    allChannelIds,
    groupIds,
    channelIdsByGroup,
    linkedChannelId,
    topLevelItems,
    channelsById,
    channelGroupsById,
  };
}
