// DIAGNOSTIC (step 2): restore FlashList + Screen wrapper but keep the
// search bar disabled in both channels/_layout.tsx and here. Tests whether
// the headerSearchBarOptions (UISearchController) is what's breaking the
// tab bar's .bottom-edge scroll view binding.
// Revert both files with: git checkout HEAD~2 -- "apps/mobile/app/(authed)/channels/index.tsx" "apps/mobile/app/(authed)/channels/_layout.tsx"
import { useCallback, useState } from "react";
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

  const [refreshing, setRefreshing] = useState(false);

  const keys = useCodingChannelKeys({ search: "" });

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
      <FlashList
        data={keys}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        contentInsetAdjustmentBehavior="automatic"
        onRefresh={handleRefresh}
        refreshing={refreshing}
        ListEmptyComponent={<ChannelsEmpty />}
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

function ChannelsEmpty() {
  return (
    <EmptyState
      icon="tray"
      title="No coding channels yet"
      subtitle="Channels appear here as they're created in the web app."
    />
  );
}
