import { useCallback, useState } from "react";
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
import { useTheme } from "@/theme";

export default function ChannelsIndex() {
  const theme = useTheme();
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const logout = useAuthStore((s: AuthState) => s.logout);

  const [refreshing, setRefreshing] = useState(false);

  const keys = useCodingChannelKeys({ search: "" });
  const activeCounts = useChannelActiveSessionCounts();

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
    <FlashList
      data={keys}
      renderItem={renderListItem}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      extraData={activeCounts}
      contentInsetAdjustmentBehavior="automatic"
      onRefresh={handleRefresh}
      refreshing={refreshing}
      ListEmptyComponent={<ChannelsEmpty />}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    />
  );
}

function keyExtractor(item: ChannelListItemKey): string {
  return item;
}

function getItemType(item: ChannelListItemKey): string {
  return item.startsWith("group:") ? "group" : "channel";
}

function ChannelsEmpty() {
  return (
    <EmptyState
      icon="tray"
      title="No coding channels yet"
      subtitle="Channels appear here as they're created in the web app."
    />
  );
}
