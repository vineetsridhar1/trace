import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import {
  useAuthStore,
  useEntityField,
  useEntityStore,
  type AuthState,
} from "@trace/client-core";
import { EmptyState, IconButton, Screen } from "@/components/design-system";
import { SessionGroupRow } from "@/components/channels/SessionGroupRow";
import { SessionGroupsHeader } from "@/components/channels/SessionGroupsHeader";
import { SessionGroupSectionHeader } from "@/components/channels/SessionGroupSectionHeader";
import {
  useChannelSessionGroupSections,
  type ActiveSegment,
  type SessionGroupSectionStatus,
} from "@/hooks/useChannelSessionGroups";
import { fetchChannelSessionGroups } from "@/hooks/useChannelSessionGroupsQuery";
import { refreshOrgData } from "@/hooks/useHydrate";
import { haptic } from "@/lib/haptics";

type ListItem =
  | { kind: "header"; status: SessionGroupSectionStatus; count: number; collapsed: boolean }
  | { kind: "row"; groupId: string };

// Mirror the web behavior where terminal/less-actionable sections start
// collapsed so the user lands on what still needs attention.
const DEFAULT_COLLAPSED: ReadonlySet<SessionGroupSectionStatus> = new Set([
  "failed",
  "stopped",
]);

export default function ChannelDetail() {
  const { id: channelId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [scope, setScope] = useState<ActiveSegment>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<SessionGroupSectionStatus>>(
    () => new Set(DEFAULT_COLLAPSED),
  );
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const userId = useAuthStore((s: AuthState) => s.user?.id ?? null);
  const logout = useAuthStore((s: AuthState) => s.logout);
  const channelName = useEntityField("channels", channelId, "name");
  const sections = useChannelSessionGroupSections(channelId, scope, userId);

  useEffect(() => {
    if (!channelId) return;
    void fetchChannelSessionGroups(channelId, "active");
  }, [channelId]);

  const handleRefresh = useCallback(async () => {
    if (!channelId) return;
    void haptic.medium();
    setRefreshing(true);
    try {
      const tasks: Promise<unknown>[] = [fetchChannelSessionGroups(channelId, "active")];
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
  }, [channelId, activeOrgId, logout]);

  const handleOpenArchive = useCallback(() => {
    void haptic.light();
    router.push(`/channels/${channelId}/merged-archived`);
  }, [router, channelId]);

  const handleToggleSection = useCallback((status: SessionGroupSectionStatus) => {
    void haptic.light();
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const items = useMemo<ListItem[]>(() => {
    const out: ListItem[] = [];
    for (const section of sections) {
      const isCollapsed = collapsed.has(section.status);
      out.push({
        kind: "header",
        status: section.status,
        count: section.ids.length,
        collapsed: isCollapsed,
      });
      if (isCollapsed) continue;
      for (const id of section.ids) {
        out.push({ kind: "row", groupId: id });
      }
    }
    return out;
  }, [sections, collapsed]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.kind === "header") {
        return (
          <SessionGroupSectionHeader
            status={item.status}
            count={item.count}
            collapsed={item.collapsed}
            onToggle={handleToggleSection}
          />
        );
      }
      return <SessionGroupRow groupId={item.groupId} hideStatusChip />;
    },
    [handleToggleSection],
  );

  return (
    <Screen edges={["left", "right"]}>
      <Stack.Screen
        options={{
          title: channelName ?? "Channel",
          headerRight: () => (
            <IconButton
              symbol="archivebox"
              size="sm"
              color="foreground"
              onPress={handleOpenArchive}
              accessibilityLabel="Merged & archived"
            />
          ),
        }}
      />
      <SessionGroupsHeader
        channelId={channelId}
        segment={scope}
        onSegmentChange={setScope}
      />
      <FlashList
        // Re-mount on segment change so scroll position resets to the top
        // instead of carrying over from the previous (often longer) list.
        key={scope}
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        // `automatic` is required for the native bottom-tab accessory to
        // collapse on scroll-down and for the last row to clear the tab bar.
        contentInsetAdjustmentBehavior="automatic"
        onRefresh={handleRefresh}
        refreshing={refreshing}
        ListEmptyComponent={<ActiveEmpty scope={scope} />}
      />
    </Screen>
  );
}

function keyExtractor(item: ListItem): string {
  return item.kind === "header" ? `h:${item.status}` : `r:${item.groupId}`;
}

function getItemType(item: ListItem): string {
  return item.kind;
}

function ActiveEmpty({ scope }: { scope: ActiveSegment }) {
  if (scope === "mine") {
    return (
      <EmptyState
        icon="person"
        title="No sessions you started"
        subtitle="Switch to All to see everything happening in this channel."
      />
    );
  }
  return (
    <EmptyState
      icon="bolt.horizontal"
      title="No active sessions in this channel"
      subtitle="Start a session from the web app to see it here."
    />
  );
}
