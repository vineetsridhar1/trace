import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  useAuthStore,
  useEntityField,
  useEntityStore,
  type AuthState,
} from "@trace/client-core";
import {
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  UIManager,
  View,
  type LayoutAnimationConfig,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LayoutAnimationConfig as RNALayoutAnimationConfig,
} from "react-native-reanimated";
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
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";

type ListItem =
  | { kind: "header"; status: SessionGroupSectionStatus; count: number; collapsed: boolean }
  | { kind: "row"; groupId: string };

// Mirror the web behavior where terminal/less-actionable sections start
// collapsed so the user lands on what still needs attention.
const DEFAULT_COLLAPSED: ReadonlySet<SessionGroupSectionStatus> = new Set([
  "failed",
  "stopped",
]);

// LayoutAnimation is opt-in on Android; iOS already has it enabled.
if (
  Platform.OS === "android"
  && UIManager.setLayoutAnimationEnabledExperimental
) {
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
  // Suppress row FadeIn on the first frame so opening the channel doesn't
  // cascade-fade every visible row. Subsequent expand/collapse toggles play
  // entering/exiting normally.
  const [skipInitialEntering, setSkipInitialEntering] = useState(true);
  useEffect(() => {
    const handle = requestAnimationFrame(() => setSkipInitialEntering(false));
    return () => cancelAnimationFrame(handle);
  }, []);
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
    (item: ListItem) => {
      if (item.kind === "header") {
        return (
          <SessionGroupSectionHeader
            key={`h:${item.status}`}
            status={item.status}
            count={item.count}
            collapsed={item.collapsed}
            onToggle={handleToggleSection}
          />
        );
      }
      return (
        <Animated.View
          key={`r:${item.groupId}`}
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(120)}
        >
          <SessionGroupRow groupId={item.groupId} hideStatusChip />
        </Animated.View>
      );
    },
    [handleToggleSection],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: channelName ?? "Channel",
          headerRight: () => (
            <View style={{ marginLeft: 2 }}>
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
      <RNALayoutAnimationConfig skipEntering={skipInitialEntering}>
        <ScrollView
          // Re-mount on segment change so scroll position resets to zero
          // instead of carrying over from the previous (often longer) list.
          key={scope}
          // Keep the ScrollView as the root native view on the screen. The
          // home tab collapses correctly with this shape, while wrapping the
          // list in our SafeAreaView-based Screen shell does not.
          style={{ flex: 1, backgroundColor: theme.colors.background }}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          <SessionGroupsHeader segment={scope} onSegmentChange={setScope} />
          {items.length === 0 ? <ActiveEmpty scope={scope} /> : items.map(renderListItem)}
        </ScrollView>
      </RNALayoutAnimationConfig>
    </>
  );
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
