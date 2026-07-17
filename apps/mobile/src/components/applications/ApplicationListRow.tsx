import { memo, useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import ContextMenu from "react-native-context-menu-view";
import { useEntityField } from "@trace/client-core";
import { Text } from "@/components/design-system";
import { useApplicationRowMenu } from "@/components/applications/useApplicationRowMenu";
import { useLatestSessionIdForGroup } from "@/hooks/useChannelSessionGroups";
import { appSessionSubtitle } from "@/lib/app-sessions";
import { haptic } from "@/lib/haptics";
import { prefetchSessionPlayer, tryOpenSessionPlayer } from "@/lib/sessionPlayer";
import { timeAgo } from "@/lib/time";
import { alpha, useTheme } from "@/theme";

export const ApplicationListRow = memo(function ApplicationListRow({
  groupId,
  kind = "app",
}: {
  groupId: string;
  kind?: "app" | "design";
}) {
  const theme = useTheme();
  const name = useEntityField("sessionGroups", groupId, "name") as string | null | undefined;
  const status = useEntityField("sessionGroups", groupId, "status") as string | null | undefined;
  const archivedAt = useEntityField("sessionGroups", groupId, "archivedAt");
  const groupUpdatedAt = useEntityField("sessionGroups", groupId, "updatedAt") as
    | string
    | null
    | undefined;
  const latestSessionId = useLatestSessionIdForGroup(groupId);
  const agentStatus = useEntityField("sessions", latestSessionId ?? "", "agentStatus") as
    | string
    | null
    | undefined;
  const lastMessageAt = useEntityField("sessions", latestSessionId ?? "", "lastMessageAt") as
    | string
    | null
    | undefined;
  const sessionUpdatedAt = useEntityField("sessions", latestSessionId ?? "", "updatedAt") as
    | string
    | null
    | undefined;
  const preview = useEntityField("sessions", latestSessionId ?? "", "_lastEventPreview") as
    | string
    | null
    | undefined;

  const handleOpen = useCallback(() => {
    if (!latestSessionId) return;
    void haptic.light();
    prefetchSessionPlayer(latestSessionId);
    tryOpenSessionPlayer(latestSessionId);
  }, [latestSessionId]);

  const isArchived = Boolean(archivedAt) || status === "archived";
  const menu = useApplicationRowMenu(groupId, isArchived, kind);

  if (!name) return null;

  const subtitle = appSessionSubtitle({ agentStatus, preview, status });
  const timestamp = lastMessageAt ?? sessionUpdatedAt ?? groupUpdatedAt;

  return (
    <ContextMenu actions={menu.actions} onPress={menu.onPress} preview={null}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${subtitle}`}
        disabled={!latestSessionId}
        onPress={handleOpen}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: pressed ? alpha(theme.colors.accent, 0.08) : "transparent",
            paddingHorizontal: theme.spacing.md,
          },
        ]}
      >
        <View style={styles.text}>
          <Text variant="body" color="foreground" numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          <Text variant="caption2" color="dimForeground" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        {timestamp ? (
          <Text variant="caption2" color="dimForeground" style={styles.timestamp}>
            {timeAgo(timestamp)}
          </Text>
        ) : null}
        <SymbolView
          name="chevron.right"
          size={12}
          tintColor={theme.colors.dimForeground}
          resizeMode="scaleAspectFit"
          style={styles.chevron}
        />
      </Pressable>
    </ContextMenu>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    lineHeight: 21,
  },
  timestamp: {
    flexShrink: 0,
  },
  chevron: {
    width: 12,
    height: 12,
  },
});
