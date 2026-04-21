import { useCallback, useMemo, useState } from "react";
import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useAuthStore, useEntityStore, type AuthState } from "@trace/client-core";
import { EmptyState } from "@/components/design-system";
import { ChannelListRow } from "@/components/channels/ChannelListRow";
import { ChannelGroupHeader } from "@/components/channels/ChannelGroupHeader";
import {
  parseItemKey,
  useCodingChannelKeys,
  type ChannelListItemKey,
} from "@/hooks/useCodingChannels";
import { refreshOrgData } from "@/hooks/useHydrate";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";

export default function ChannelsIndex() {
  const theme = useTheme();
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const logout = useAuthStore((s: AuthState) => s.logout);

  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const keys = useCodingChannelKeys({ search });

  // hideWhenScrolling is disabled because the pull-to-reveal observation
  // (UISearchController + hidesSearchBarWhenScrolling=YES) conflicts with
  // the tab bar's iOS 26 minimize-on-scroll binding on the same scroll
  // view, stopping the tab bar and bottom accessory from collapsing.
  const searchBarOptions = useMemo(
    () => ({
      placeholder: "Search channels",
      hideWhenScrolling: false,
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

  // The iOS native large title doesn't render with our search bar +
  // native-tabs minimize combo on iOS 26, so render the heading inline as a
  // FlashList header. The small "Channels" still appears in the nav bar on
  // scroll because headerLargeTitle is left enabled.
  const listHeader = useMemo(
    () => (
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.xs,
          paddingBottom: theme.spacing.sm,
        }}
      >
        <Text style={[theme.typography.largeTitle, { color: theme.colors.foreground }]}>
          Channels
        </Text>
      </View>
    ),
    [theme],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: "Channels",
          headerLargeTitle: true,
          headerLargeTitleShadowVisible: false,
          headerSearchBarOptions: searchBarOptions,
        }}
      />
      <FlashList
        data={keys}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        contentInsetAdjustmentBehavior="automatic"
        onRefresh={handleRefresh}
        refreshing={refreshing}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={<ChannelsEmpty search={search} />}
        style={{ flex: 1, backgroundColor: theme.colors.background }}
      />
    </>
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
