import { StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Button, Text } from "@/components/design-system";
import { useTheme } from "@/theme";
import type { BrowseChannel } from "./browse-channel-types";

interface BrowseChannelRowProps {
  channel: BrowseChannel;
  joined: boolean;
  joining: boolean;
  disabled: boolean;
  onJoin: () => void;
}

export function BrowseChannelRow({
  channel,
  joined,
  joining,
  disabled,
  onJoin,
}: BrowseChannelRowProps) {
  const theme = useTheme();

  return (
    <View style={[styles.row, { borderBottomColor: theme.colors.border }]}>
      <View style={styles.rowText}>
        <Text variant="body" numberOfLines={1}>
          {channel.name}
        </Text>
        <Text variant="footnote" color="mutedForeground" numberOfLines={1}>
          {channel.memberCount} {channel.memberCount === 1 ? "member" : "members"}
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

const styles = StyleSheet.create({
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
