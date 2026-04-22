import { useCallback, useEffect, useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { EmptyState } from "@/components/design-system";
import { SessionGroupRow } from "@/components/channels/SessionGroupRow";
import { MergedArchivedHeader } from "@/components/channels/MergedArchivedHeader";
import {
  useMergedArchivedSessionGroupIds,
  type MergedArchivedSegment,
} from "@/hooks/useChannelSessionGroups";
import { fetchChannelSessionGroups } from "@/hooks/useChannelSessionGroupsQuery";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";

export default function MergedArchived() {
  const { id: channelId } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
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
    <>
      <Stack.Screen options={{ title: "Merged & Archived" }} />
      <FlashList
        // Re-mount on segment change so scroll resets to zero instead of
        // carrying over from the previous (often differently-sized) list.
        key={segment}
        data={ids}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        onRefresh={handleRefresh}
        refreshing={refreshing}
        ListHeaderComponent={
          <MergedArchivedHeader segment={segment} onSegmentChange={setSegment} />
        }
        ListEmptyComponent={<MergedArchivedEmpty segment={segment} />}
      />
    </>
  );
}

function renderItem({ item }: { item: string }) {
  return <SessionGroupRow groupId={item} />;
}

function keyExtractor(id: string): string {
  return id;
}

function MergedArchivedEmpty({ segment }: { segment: MergedArchivedSegment }) {
  if (segment === "archived") {
    return <EmptyState icon="archivebox" title="Nothing archived" />;
  }
  return <EmptyState icon="checkmark.seal" title="Nothing merged yet" />;
}
