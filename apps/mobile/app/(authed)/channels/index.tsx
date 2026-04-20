import { useCallback, useLayoutEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { EmptyState, Screen, SegmentedControl, Text } from "@/components/design-system";
import { ChannelListRow } from "@/components/channels/ChannelListRow";
import {
  useCodingChannels,
  type ChannelFilter,
  type ChannelListItem,
} from "@/hooks/useCodingChannels";
import { refreshOrgData } from "@/hooks/useHydrate";
import { useTheme } from "@/theme";

const SEGMENTS = ["All", "Mine"] as const;

export default function ChannelsIndex() {
  const theme = useTheme();
  const navigation = useNavigation();
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);

  const [segmentIndex, setSegmentIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const filter: ChannelFilter = segmentIndex === 1 ? "mine" : "all";
  const items = useCodingChannels({ filter, search });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerSearchBarOptions: {
        placeholder: "Search channels",
        hideWhenScrolling: false,
        onChangeText: (e: { nativeEvent: { text: string } }) => setSearch(e.nativeEvent.text),
        onCancelButtonPress: () => setSearch(""),
      },
    });
  }, [navigation]);

  const handleRefresh = useCallback(async () => {
    if (!activeOrgId) return;
    setRefreshing(true);
    try {
      await refreshOrgData(activeOrgId);
    } finally {
      setRefreshing(false);
    }
  }, [activeOrgId]);

  const renderItem = useCallback(
    ({ item }: { item: ChannelListItem }) => {
      if (item.kind === "group") {
        return (
          <View
            style={[
              styles.groupHeader,
              {
                paddingHorizontal: theme.spacing.lg,
                paddingTop: theme.spacing.lg,
                paddingBottom: theme.spacing.xs,
                backgroundColor: theme.colors.background,
              },
            ]}
          >
            <Text
              variant="footnote"
              color="mutedForeground"
              style={styles.groupHeaderText}
            >
              {item.groupName.toUpperCase()}
            </Text>
          </View>
        );
      }
      return (
        <ChannelListRow
          channelId={item.channelId}
          name={item.name}
          subtitle={item.subtitle}
        />
      );
    },
    [theme],
  );

  return (
    <Screen edges={["left", "right"]}>
      <View
        style={[
          styles.segmentContainer,
          {
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.sm,
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
      <FlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        contentInsetAdjustmentBehavior="automatic"
        onRefresh={handleRefresh}
        refreshing={refreshing}
        ListEmptyComponent={<ChannelsEmpty filter={filter} search={search} />}
      />
    </Screen>
  );
}

function keyExtractor(item: ChannelListItem): string {
  return item.key;
}

function getItemType(item: ChannelListItem): string {
  return item.kind;
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
  groupHeader: {
    width: "100%",
  },
  groupHeaderText: {
    letterSpacing: 0.5,
  },
});
