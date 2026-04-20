import { useCallback, useEffect, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable } from "react-native";
import { SymbolView } from "expo-symbols";
import { FlashList } from "@shopify/flash-list";
import {
  useAuthStore,
  useEntityField,
  useEntityStore,
  type AuthState,
} from "@trace/client-core";
import { EmptyState, Screen } from "@/components/design-system";
import { SessionGroupRow } from "@/components/channels/SessionGroupRow";
import { SessionGroupsHeader } from "@/components/channels/SessionGroupsHeader";
import {
  useActiveSessionGroupIds,
  type ActiveSegment,
} from "@/hooks/useChannelSessionGroups";
import { fetchChannelSessionGroups } from "@/hooks/useChannelSessionGroupsQuery";
import { refreshOrgData } from "@/hooks/useHydrate";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";

export default function ChannelDetail() {
  const { id: channelId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const [scope, setScope] = useState<ActiveSegment>("all");
  const [refreshing, setRefreshing] = useState(false);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const userId = useAuthStore((s: AuthState) => s.user?.id ?? null);
  const logout = useAuthStore((s: AuthState) => s.logout);
  const channelName = useEntityField("channels", channelId, "name");
  const ids = useActiveSessionGroupIds(channelId, scope, userId);

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

  return (
    <Screen edges={["left", "right"]}>
      <Stack.Screen
        options={{
          title: channelName ?? "Channel",
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Merged & archived"
              onPress={handleOpenArchive}
              hitSlop={8}
            >
              <SymbolView
                name="archivebox"
                size={20}
                tintColor={theme.colors.foreground}
              />
            </Pressable>
          ),
        }}
      />
      <SessionGroupsHeader
        channelId={channelId}
        segment={scope}
        onSegmentChange={setScope}
      />
      <FlashList
        data={ids}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentInsetAdjustmentBehavior="automatic"
        onRefresh={handleRefresh}
        refreshing={refreshing}
        ListEmptyComponent={<ActiveEmpty scope={scope} />}
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
