import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, TextInput, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { SymbolView } from "expo-symbols";
import { gql } from "@urql/core";
import { useAuthStore, type AuthState } from "@trace/client-core";
import type { ChannelType } from "@trace/gql";
import { Button, EmptyState, Text, TraceLoader } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { userFacingError } from "@/lib/requestError";
import { getClient } from "@/lib/urql";
import { refreshOrgData } from "@/hooks/useHydrate";
import { useTheme } from "@/theme";

const ALL_CHANNELS_QUERY = gql`
  query MobileBrowseChannels($organizationId: ID!) {
    channels(organizationId: $organizationId) {
      id
      name
      type
      members {
        user {
          id
        }
        joinedAt
      }
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

interface BrowseChannel {
  id: string;
  name: string;
  type: ChannelType;
  members: Array<{ user: { id: string }; joinedAt: string }>;
}

export function BrowseChannelsSheetContent() {
  const theme = useTheme();
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const userId = useAuthStore((s: AuthState) => s.user?.id);
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
      if (!activeOrgId || !userId || pendingChannelId) return;
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
        const joinedAt = new Date().toISOString();
        setChannels((current) =>
          current.map((item) =>
            item.id === channel.id
              ? { ...item, members: [...item.members, { user: { id: userId }, joinedAt }] }
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
    [activeOrgId, pendingChannelId, userId],
  );

  const renderItem = useCallback(
    ({ item }: { item: BrowseChannel }) => {
      const joined = item.members.some((member) => member.user.id === userId);
      return (
        <BrowseChannelRow
          channel={item}
          joined={joined}
          joining={pendingChannelId === item.id}
          disabled={Boolean(pendingChannelId) && pendingChannelId !== item.id}
          onJoin={() => void handleJoin(item)}
        />
      );
    },
    [handleJoin, pendingChannelId, userId],
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

function BrowseChannelRow({
  channel,
  joined,
  joining,
  disabled,
  onJoin,
}: {
  channel: BrowseChannel;
  joined: boolean;
  joining: boolean;
  disabled: boolean;
  onJoin: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.row,
        {
          borderBottomColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.rowText}>
        <Text variant="body" numberOfLines={1}>
          {channel.name}
        </Text>
        <Text variant="footnote" color="mutedForeground" numberOfLines={1}>
          {channel.members.length} {channel.members.length === 1 ? "member" : "members"}
        </Text>
      </View>
      {joined ? (
        <View style={styles.joined}>
          <SymbolView name="checkmark.circle.fill" size={17} tintColor={theme.colors.accent} />
          <Text variant="footnote" color="mutedForeground">
            Joined
          </Text>
        </View>
      ) : (
        <Button
          title="Join"
          size="sm"
          variant="secondary"
          loading={joining}
          disabled={disabled}
          onPress={onJoin}
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
  row: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  joined: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
