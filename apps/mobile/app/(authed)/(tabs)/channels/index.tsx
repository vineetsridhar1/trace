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
import { useMobileUIStore } from "@/stores/ui";

export default function ChannelsIndex() {
  const theme = useTheme();
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const logout = useAuthStore((s: AuthState) => s.logout);
  const orgDataError = useMobileUIStore((s) => s.orgDataError);

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
      ListEmptyComponent={<ChannelsEmpty error={orgDataError} onRetry={() => void handleRefresh()} />}
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

function ChannelsEmpty({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <EmptyState
      icon={error ? "exclamationmark.triangle" : "tray"}
      title={error ? "Couldn't load channels" : "No coding channels yet"}
      subtitle={
        error
          ? error
          : "Channels appear here as they're created in the web app."
      }
      action={error ? { label: "Retry", onPress: onRetry } : undefined}
    />
  );
}
