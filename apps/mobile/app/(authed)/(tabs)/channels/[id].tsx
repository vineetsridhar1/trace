import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useAuthStore, useEntityField, type AuthState } from "@trace/client-core";
import {
  LayoutAnimation,
  Platform,
  UIManager,
  View,
  type LayoutAnimationConfig,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { EmptyState, IconButton } from "@/components/design-system";
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
import { handleUnauthorized } from "@/lib/auth";
import { createQuickSession } from "@/lib/createQuickSession";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";

type ListItem =
  | { kind: "header"; status: SessionGroupSectionStatus; count: number; collapsed: boolean }
  | { kind: "row"; groupId: string };

// Mirror the web behavior where terminal/less-actionable sections start
// collapsed so the user lands on what still needs attention.
const DEFAULT_COLLAPSED: ReadonlySet<SessionGroupSectionStatus> = new Set(["failed", "stopped"]);

// LayoutAnimation is opt-in on Android; iOS already has it enabled.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SECTION_TOGGLE_ANIMATION: LayoutAnimationConfig = {
  duration: 200,
  create: { type: "easeOut", property: "opacity" },
  update: { type: "easeInEaseOut" },
  delete: { type: "easeIn", property: "opacity" },
};

export default function ChannelDetail() {
  const { id: channelId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const [scope, setScope] = useState<ActiveSegment>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<SessionGroupSectionStatus>>(
    () => new Set(DEFAULT_COLLAPSED),
  );
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const userId = useAuthStore((s: AuthState) => s.user?.id ?? null);
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
              return handleUnauthorized();
            }
            return undefined;
          }),
        );
      }
      await Promise.all(tasks);
    } finally {
      setRefreshing(false);
    }
  }, [channelId, activeOrgId]);

  const handleOpenArchive = useCallback(() => {
    void haptic.light();
    router.push(`/channels/${channelId}/merged-archived`);
  }, [router, channelId]);

  const handleCreateSession = useCallback(() => {
    void createQuickSession(channelId);
  }, [channelId]);

  const handleToggleSection = useCallback((status: SessionGroupSectionStatus) => {
    void haptic.light();
    LayoutAnimation.configureNext(SECTION_TOGGLE_ANIMATION);
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

  const renderListItem = useCallback(
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
    <>
      <Stack.Screen
        options={{
          title: channelName ?? "Channel",
          headerLargeTitle: true,
          headerLargeTitleShadowVisible: false,
          headerRight: () => (
            <View style={{ flexDirection: "row", marginLeft: 2, gap: 4 }}>
              <IconButton
                symbol="plus"
                size="sm"
                color="foreground"
                onPress={handleCreateSession}
                accessibilityLabel="New session"
              />
              <IconButton
                symbol="archivebox"
                size="sm"
                color="foreground"
                onPress={handleOpenArchive}
                accessibilityLabel="Merged & archived"
              />
            </View>
          ),
        }}
      />
      <FlashList
        // Re-mount on segment change so scroll position resets to zero
        // instead of carrying over from the previous (often longer) list.
        key={scope}
        data={items}
        renderItem={renderListItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        onRefresh={handleRefresh}
        refreshing={refreshing}
        ListHeaderComponent={<SessionGroupsHeader segment={scope} onSegmentChange={setScope} />}
        ListEmptyComponent={<ActiveEmpty scope={scope} />}
      />
    </>
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
