import { useCallback, useMemo, useState } from "react";
import { Stack } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useAuthStore, useEntityStore, type AuthState } from "@trace/client-core";
import { EmptyState } from "@/components/design-system";
import { ChannelListRow } from "@/components/channels/ChannelListRow";
import { ChannelGroupHeader } from "@/components/channels/ChannelGroupHeader";
import {
  parseItemKey,
  useChannelActiveSessionCounts,
  useCodingChannelKeys,
  type ChannelListItemKey,
} from "@/hooks/useCodingChannels";
import { refreshOrgData } from "@/hooks/useHydrate";
import { haptic } from "@/lib/haptics";
import { alpha, useTheme } from "@/theme";

export default function ChannelsIndex() {
  const theme = useTheme();
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const logout = useAuthStore((s: AuthState) => s.logout);

  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const keys = useCodingChannelKeys({ search });
  const activeCounts = useChannelActiveSessionCounts();

  const searchBarOptions = useMemo(
    () => ({
      placeholder: "Search channels",
      hideWhenScrolling: false,
      placement: "stacked" as const,
      barTintColor: alpha(theme.colors.surface, 0.72),
      tintColor: theme.colors.foreground,
      textColor: theme.colors.foreground,
      hideNavigationBar: false,
      obscureBackground: false,
      onChangeText: (e: { nativeEvent: { text: string } }) => setSearch(e.nativeEvent.text),
      onCancelButtonPress: () => setSearch(""),
    }),
    [theme.colors.foreground, theme.colors.surface],
  );

  const handleRefresh = useCallback(async () => {
    if (!activeOrgId) return;
    void haptic.medium();
    setRefreshing(true);
    try {
      const ok = await refreshOrgData(activeOrgId);
      if (!ok) {
        useEntityStore.getState().reset();
        await logout();
      }
    } finally {
      setRefreshing(false);
    }
  }, [activeOrgId, logout]);

  const renderListItem = useCallback(
    ({ item }: { item: ChannelListItemKey }) => {
      const { kind, id } = parseItemKey(item);
      if (kind === "group") return <ChannelGroupHeader groupId={id} />;
      return <ChannelListRow channelId={id} activeCount={activeCounts[id] ?? 0} />;
    },
    [activeCounts],
  );

  return (
    <>
      <Stack.Screen options={{ headerSearchBarOptions: searchBarOptions }} />
      <FlashList
        data={keys}
        renderItem={renderListItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        extraData={activeCounts}
        contentInsetAdjustmentBehavior="automatic"
        onRefresh={handleRefresh}
        refreshing={refreshing}
        ListEmptyComponent={<ChannelsEmpty search={search} />}
        style={{ flex: 1, backgroundColor: theme.colors.background }}
      />
    </>
  );
}

function keyExtractor(item: ChannelListItemKey): string {
  return item;
}

function getItemType(item: ChannelListItemKey): string {
  return item.startsWith("group:") ? "group" : "channel";
}

function ChannelsEmpty({ search }: { search: string }) {
  if (search.trim().length > 0) {
    return (
      <EmptyState
        icon="magnifyingglass"
        title="No channels found"
        subtitle={`Nothing matches "${search.trim()}".`}
      />
    );
  }
  return (
    <EmptyState
      icon="tray"
      title="No coding channels yet"
      subtitle="Channels appear here as they're created in the web app."
    />
  );
}
