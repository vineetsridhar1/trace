import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, TextInput, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { gql } from "@urql/core";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { EmptyState, Text, TraceLoader } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { userFacingError } from "@/lib/requestError";
import { getClient } from "@/lib/urql";
import { refreshOrgData } from "@/hooks/useHydrate";
import { useTheme } from "@/theme";
import { BrowseChannelRow } from "./BrowseChannelRow";
import type { BrowseChannel } from "./browse-channel-types";

const ALL_CHANNELS_QUERY = gql`
  query MobileBrowseChannels($organizationId: ID!) {
    channels(organizationId: $organizationId) {
      id
      name
      type
      memberCount
      viewerIsMember
    }
  }
`;

const JOIN_CHANNEL_MUTATION = gql`
  mutation MobileJoinChannel($channelId: ID!) {
    joinChannel(channelId: $channelId) {
      id
    }
  }
`;

export function BrowseChannelsSheetContent() {
  const theme = useTheme();
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const [channels, setChannels] = useState<BrowseChannel[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingChannelId, setPendingChannelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
    if (!activeOrgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await getClient()
      .query(ALL_CHANNELS_QUERY, { organizationId: activeOrgId })
      .toPromise();

    if (result.error) {
      setError(userFacingError(result.error, "Couldn't load channels."));
      setLoading(false);
      return;
    }

    const nextChannels = ((result.data?.channels ?? []) as BrowseChannel[]).filter(
      (channel) => channel.type === "coding",
    );
    setChannels(nextChannels);
    setLoading(false);
  }, [activeOrgId]);

  useEffect(() => {
    void fetchChannels();
  }, [fetchChannels]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return channels;
    return channels.filter((channel) => channel.name.toLowerCase().includes(query));
  }, [channels, search]);

  const handleJoin = useCallback(
    async (channel: BrowseChannel) => {
      if (!activeOrgId || pendingChannelId) return;
      setPendingChannelId(channel.id);
      try {
        const result = await getClient()
          .mutation(JOIN_CHANNEL_MUTATION, { channelId: channel.id })
          .toPromise();

        if (result.error) {
          void haptic.error();
          Alert.alert("Couldn't join channel", userFacingError(result.error, "Try again."));
          return;
        }

        void haptic.success();
        setChannels((current) =>
          current.map((item) =>
            item.id === channel.id
              ? {
                  ...item,
                  viewerIsMember: true,
                  memberCount: item.viewerIsMember ? item.memberCount : item.memberCount + 1,
                }
              : item,
          ),
        );
        await refreshOrgData(activeOrgId);
      } catch (err) {
        void haptic.warning();
        Alert.alert("Joined channel", userFacingError(err, "Pull to refresh your channel list."));
      } finally {
        setPendingChannelId(null);
      }
    },
    [activeOrgId, pendingChannelId],
  );

  const renderItem = useCallback(
    ({ item }: { item: BrowseChannel }) => {
      return (
        <BrowseChannelRow
          channel={item}
          joined={item.viewerIsMember}
          joining={pendingChannelId === item.id}
          disabled={Boolean(pendingChannelId) && pendingChannelId !== item.id}
          onJoin={() => void handleJoin(item)}
        />
      );
    },
    [handleJoin, pendingChannelId],
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text variant="headline">Browse channels</Text>
        <Text variant="footnote" color="mutedForeground">
          Join coding channels to add them to your channel list.
        </Text>
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search channels"
        placeholderTextColor={theme.colors.mutedForeground}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={[
          styles.search,
          {
            backgroundColor: theme.colors.surfaceElevated,
            borderColor: theme.colors.borderMuted,
            borderRadius: theme.radius.lg,
            color: theme.colors.foreground,
          },
        ]}
      />

      {loading ? (
        <View style={styles.center}>
          <TraceLoader size="large" color="foreground" />
        </View>
      ) : (
        <FlashList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListEmptyComponent={
            <EmptyState
              icon={error ? "exclamationmark.triangle" : "tray"}
              title={error ? "Couldn't load channels" : "No channels found"}
              subtitle={
                error ?? (search ? "No channels match your search." : "No coding channels yet.")
              }
              action={error ? { label: "Retry", onPress: () => void fetchChannels() } : undefined}
            />
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

function keyExtractor(item: BrowseChannel): string {
  return item.id;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: 14,
  },
  header: {
    gap: 4,
  },
  search: {
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    paddingHorizontal: 14,
    fontSize: 17,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingBottom: 24,
  },
});
