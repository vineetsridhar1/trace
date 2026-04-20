import { useCallback, useEffect, useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { gql } from "@urql/core";
import { FlashList } from "@shopify/flash-list";
import {
  useAuthStore,
  useEntityField,
  useEntityStore,
  type AuthState,
  type SessionEntity,
  type SessionGroupEntity,
} from "@trace/client-core";
import type { Session, SessionGroup } from "@trace/gql";
import { EmptyState, Screen } from "@/components/design-system";
import { SessionGroupRow } from "@/components/channels/SessionGroupRow";
import { SessionGroupsHeader } from "@/components/channels/SessionGroupsHeader";
import {
  useChannelSessionGroupIds,
  type SessionGroupSegment,
} from "@/hooks/useChannelSessionGroups";
import { refreshOrgData } from "@/hooks/useHydrate";
import { getClient } from "@/lib/urql";
import { haptic } from "@/lib/haptics";

const SESSION_GROUPS_QUERY = gql`
  query MobileChannelSessionGroups(
    $channelId: ID!
    $archived: Boolean
    $status: SessionGroupStatus
  ) {
    sessionGroups(channelId: $channelId, archived: $archived, status: $status) {
      id
      name
      slug
      status
      branch
      prUrl
      worktreeDeleted
      archivedAt
      createdAt
      updatedAt
      channel { id }
      sessions {
        id
        name
        agentStatus
        sessionStatus
        tool
        model
        hosting
        branch
        prUrl
        worktreeDeleted
        sessionGroupId
        lastMessageAt
        lastUserMessageAt
        createdBy { id name avatarUrl }
        repo { id name }
        channel { id }
        createdAt
        updatedAt
      }
    }
  }
`;

function variablesForSegment(
  channelId: string,
  segment: SessionGroupSegment,
): Record<string, unknown> {
  if (segment === "archived") return { channelId, archived: true };
  if (segment === "merged") return { channelId, archived: false, status: "merged" };
  return { channelId, archived: false };
}

async function fetchSegment(
  channelId: string,
  segment: SessionGroupSegment,
): Promise<void> {
  const client = getClient();
  const variables = variablesForSegment(channelId, segment);
  const result = await client.query(SESSION_GROUPS_QUERY, variables).toPromise();
  if (result.error || !result.data?.sessionGroups) return;
  const groups = result.data.sessionGroups as Array<SessionGroup & { id: string }>;
  const upsertMany = useEntityStore.getState().upsertMany;
  const sessions = groups.flatMap((g) => g.sessions ?? []) as Array<Session & { id: string }>;
  upsertMany(
    "sessionGroups",
    groups.map((g) => ({
      ...g,
      _sortTimestamp:
        g.sessions?.[0]?.lastMessageAt
        ?? g.sessions?.[0]?.updatedAt
        ?? g.updatedAt,
    })) as Array<SessionGroupEntity & { id: string }>,
  );
  if (sessions.length > 0) upsertMany("sessions", sessions as Array<SessionEntity & { id: string }>);
}

export default function ChannelDetail() {
  const { id: channelId } = useLocalSearchParams<{ id: string }>();
  const [segment, setSegment] = useState<SessionGroupSegment>("active");
  const [refreshing, setRefreshing] = useState(false);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const logout = useAuthStore((s: AuthState) => s.logout);
  const channelName = useEntityField("channels", channelId, "name");
  const ids = useChannelSessionGroupIds(channelId, segment);

  useEffect(() => {
    if (!channelId) return;
    void fetchSegment(channelId, segment);
  }, [channelId, segment]);

  const handleRefresh = useCallback(async () => {
    if (!channelId) return;
    void haptic.medium();
    setRefreshing(true);
    try {
      const tasks: Promise<unknown>[] = [fetchSegment(channelId, segment)];
      if (activeOrgId) {
        tasks.push(
          refreshOrgData(activeOrgId).then((ok) => {
            if (!ok) {
              useEntityStore.getState().reset();
              return logout();
            }
            return undefined;
          }),
        );
      }
      await Promise.all(tasks);
    } finally {
      setRefreshing(false);
    }
  }, [channelId, segment, activeOrgId, logout]);

  return (
    <Screen edges={["left", "right"]}>
      <Stack.Screen options={{ title: channelName ?? "Channel" }} />
      <SessionGroupsHeader
        channelId={channelId}
        segment={segment}
        onSegmentChange={setSegment}
      />
      <FlashList
        data={ids}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentInsetAdjustmentBehavior="automatic"
        onRefresh={handleRefresh}
        refreshing={refreshing}
        ListEmptyComponent={<SessionGroupsEmpty segment={segment} />}
      />
    </Screen>
  );
}

function renderItem({ item }: { item: string }) {
  return <SessionGroupRow groupId={item} />;
}

function keyExtractor(item: string): string {
  return item;
}

function SessionGroupsEmpty({ segment }: { segment: SessionGroupSegment }) {
  if (segment === "merged") {
    return <EmptyState icon="checkmark.seal" title="Nothing merged yet" />;
  }
  if (segment === "archived") {
    return <EmptyState icon="archivebox" title="Nothing archived" />;
  }
  return (
    <EmptyState
      icon="bolt.horizontal"
      title="No active sessions in this channel"
      subtitle="Start a session from the web app to see it here."
    />
  );
}
