import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useAuthStore, useEntityStore, type AuthState } from "@trace/client-core";
import { EmptyState, Screen, SegmentedControl } from "@/components/design-system";
import { ChannelListRow } from "@/components/channels/ChannelListRow";
import { ChannelGroupHeader } from "@/components/channels/ChannelGroupHeader";
import {
  parseItemKey,
  useCodingChannelKeys,
  type ChannelFilter,
  type ChannelListItemKey,
} from "@/hooks/useCodingChannels";
import { refreshOrgData } from "@/hooks/useHydrate";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";

const SEGMENTS = ["All", "Mine"] as const;

export default function ChannelsIndex() {
  const theme = useTheme();
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const logout = useAuthStore((s: AuthState) => s.logout);

  const [segmentIndex, setSegmentIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const filter: ChannelFilter = segmentIndex === 1 ? "mine" : "all";
  const keys = useCodingChannelKeys({ filter, search });

  // Native iOS pull-to-reveal: hidden on initial scroll offset, revealed
  // when the user drags the large-title header down. Matches Mail / Settings.
  const searchBarOptions = useMemo(
    () => ({
      placeholder: "Search channels",
      onChangeText: (e: { nativeEvent: { text: string } }) => setSearch(e.nativeEvent.text),
      onCancelButtonPress: () => setSearch(""),
    }),
    [],
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

  const listHeader = useMemo(
    () => (
      <View
        style={[
          styles.segmentContainer,
          {
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.sm,
            paddingBottom: theme.spacing.md,
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        <SegmentedControl
          segments={[...SEGMENTS]}
          selectedIndex={segmentIndex}
          onChange={setSegmentIndex}
        />
      </View>
    ),
    [theme, segmentIndex],
  );

  return (
    <Screen edges={["left", "right"]}>
      <Stack.Screen options={{ headerSearchBarOptions: searchBarOptions }} />
      <FlashList
        data={keys}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        contentInsetAdjustmentBehavior="automatic"
        onRefresh={handleRefresh}
        refreshing={refreshing}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={<ChannelsEmpty filter={filter} search={search} />}
      />
    </Screen>
  );
}

function renderItem({ item }: { item: ChannelListItemKey }) {
  const { kind, id } = parseItemKey(item);
  if (kind === "group") return <ChannelGroupHeader groupId={id} />;
  return <ChannelListRow channelId={id} />;
}

function keyExtractor(item: ChannelListItemKey): string {
  return item;
}

function getItemType(item: ChannelListItemKey): string {
  return item.startsWith("group:") ? "group" : "channel";
}

function ChannelsEmpty({ filter, search }: { filter: ChannelFilter; search: string }) {
  if (search.trim().length > 0) {
    return (
      <EmptyState
        icon="magnifyingglass"
        title="No channels found"
        subtitle={`Nothing matches "${search.trim()}".`}
      />
    );
  }
  if (filter === "mine") {
    return (
      <EmptyState
        icon="person.crop.circle"
        title="No channels with your sessions"
        subtitle="Start a session in a channel and it'll appear here."
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

const styles = StyleSheet.create({
  segmentContainer: {
    width: "100%",
  },
});
