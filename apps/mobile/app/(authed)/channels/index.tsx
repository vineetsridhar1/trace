import { useCallback, useMemo, useState } from "react";
import { Stack } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useAuthStore, useEntityStore, type AuthState } from "@trace/client-core";
import { EmptyState, Screen } from "@/components/design-system";
import { ChannelListRow } from "@/components/channels/ChannelListRow";
import { ChannelGroupHeader } from "@/components/channels/ChannelGroupHeader";
import {
  parseItemKey,
  useCodingChannelKeys,
  type ChannelListItemKey,
} from "@/hooks/useCodingChannels";
import { refreshOrgData } from "@/hooks/useHydrate";
import { haptic } from "@/lib/haptics";

export default function ChannelsIndex() {
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const logout = useAuthStore((s: AuthState) => s.logout);

  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const keys = useCodingChannelKeys({ search });

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
        ListEmptyComponent={<ChannelsEmpty search={search} />}
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
