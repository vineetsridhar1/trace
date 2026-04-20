import { useCallback, useEffect, useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { EmptyState, Screen } from "@/components/design-system";
import { SessionGroupRow } from "@/components/channels/SessionGroupRow";
import { MergedArchivedHeader } from "@/components/channels/MergedArchivedHeader";
import {
  useMergedArchivedSessionGroupIds,
  type MergedArchivedSegment,
} from "@/hooks/useChannelSessionGroups";
import { fetchChannelSessionGroups } from "@/hooks/useChannelSessionGroupsQuery";
import { haptic } from "@/lib/haptics";

export default function MergedArchived() {
  const { id: channelId } = useLocalSearchParams<{ id: string }>();
  const [segment, setSegment] = useState<MergedArchivedSegment>("merged");
  const [refreshing, setRefreshing] = useState(false);
  const ids = useMergedArchivedSessionGroupIds(channelId, segment);

  useEffect(() => {
    if (!channelId) return;
    void fetchChannelSessionGroups(channelId, segment);
  }, [channelId, segment]);

  const handleRefresh = useCallback(async () => {
    if (!channelId) return;
    void haptic.medium();
    setRefreshing(true);
    try {
      await fetchChannelSessionGroups(channelId, segment);
    } finally {
      setRefreshing(false);
    }
  }, [channelId, segment]);

  return (
    <Screen edges={["left", "right"]}>
      <Stack.Screen options={{ title: "Merged & Archived" }} />
      <MergedArchivedHeader segment={segment} onSegmentChange={setSegment} />
      <FlashList
        // Re-mount on segment change so scroll resets to the top instead of
        // carrying over from the previous (often differently-sized) list.
        key={segment}
        data={ids}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentInsetAdjustmentBehavior="never"
        onRefresh={handleRefresh}
        refreshing={refreshing}
        ListEmptyComponent={<MergedArchivedEmpty segment={segment} />}
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

function MergedArchivedEmpty({ segment }: { segment: MergedArchivedSegment }) {
  if (segment === "archived") {
    return <EmptyState icon="archivebox" title="Nothing archived" />;
  }
  return <EmptyState icon="checkmark.seal" title="Nothing merged yet" />;
}
