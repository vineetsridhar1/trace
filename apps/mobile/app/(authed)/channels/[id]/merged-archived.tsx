import { useCallback, useEffect, useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { RefreshControl, ScrollView } from "react-native";
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
      <ScrollView
        // Re-mount on segment change so scroll resets to zero instead of
        // carrying over from the previous (often differently-sized) list.
        key={segment}
        // Plain ScrollView matches the home page shape that iOS 26's
        // tab-bar minimize behavior reliably picks up. Merged/archived
        // counts stay in the dozens, no need to virtualize.
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <MergedArchivedHeader segment={segment} onSegmentChange={setSegment} />
        {ids.length === 0 ? (
          <MergedArchivedEmpty segment={segment} />
        ) : (
          ids.map((id) => <SessionGroupRow key={id} groupId={id} />)
        )}
      </ScrollView>
    </Screen>
  );
}

function MergedArchivedEmpty({ segment }: { segment: MergedArchivedSegment }) {
  if (segment === "archived") {
    return <EmptyState icon="archivebox" title="Nothing archived" />;
  }
  return <EmptyState icon="checkmark.seal" title="Nothing merged yet" />;
}
