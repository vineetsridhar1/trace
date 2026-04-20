import { memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, View, type NativeSyntheticEvent } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import ContextMenu, {
  type ContextMenuAction,
  type ContextMenuOnPressNativeEvent,
} from "react-native-context-menu-view";
import {
  ARCHIVE_SESSION_GROUP_MUTATION,
  useEntityField,
} from "@trace/client-core";
import { Chip, Text } from "@/components/design-system";
import { getClient } from "@/lib/urql";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";
import { useLatestSessionIdForGroup } from "@/hooks/useChannelSessionGroups";
import { CHIP_LABELS, mapStatusToChipVariant } from "@/lib/sessionGroupStatus";
import { timeAgo } from "@/lib/time";

export interface SessionGroupRowProps {
  groupId: string;
}

export const SessionGroupRow = memo(function SessionGroupRow({
  groupId,
}: SessionGroupRowProps) {
  const router = useRouter();
  const theme = useTheme();
  const name = useEntityField("sessionGroups", groupId, "name");
  const status = useEntityField("sessionGroups", groupId, "status");
  const branch = useEntityField("sessionGroups", groupId, "branch");
  const archivedAt = useEntityField("sessionGroups", groupId, "archivedAt");

  const latestSessionId = useLatestSessionIdForGroup(groupId);
  const lastMessageAt = useEntityField("sessions", latestSessionId ?? "", "lastMessageAt");
  const updatedAt = useEntityField("sessions", latestSessionId ?? "", "updatedAt");
  const lastEventPreview = useEntityField(
    "sessions",
    latestSessionId ?? "",
    "_lastEventPreview",
  );

  const handlePress = useCallback(() => {
    router.push(`/sessions/${groupId}`);
  }, [router, groupId]);

  const handleArchive = useCallback(async () => {
    void haptic.medium();
    const result = await getClient()
      .mutation(ARCHIVE_SESSION_GROUP_MUTATION, { id: groupId })
      .toPromise();
    if (result.error) {
      void haptic.error();
      console.warn("[archiveSessionGroup] failed", result.error);
    }
  }, [groupId]);

  const handleCopyLink = useCallback(async () => {
    await Clipboard.setStringAsync(`trace://sessions/${groupId}`);
    void haptic.light();
  }, [groupId]);

  const isArchived = Boolean(archivedAt) || status === "archived";

  const actions = useMemo<ContextMenuAction[]>(() => {
    const items: ContextMenuAction[] = [];
    if (!isArchived) {
      items.push({ title: "Archive workspace", systemIcon: "archivebox", destructive: true });
    }
    items.push({ title: "Copy link", systemIcon: "link" });
    return items;
  }, [isArchived]);

  const handleMenuPress = useCallback(
    (e: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>) => {
      const idx = e.nativeEvent.index;
      let cursor = 0;
      if (!isArchived) {
        if (idx === cursor) {
          void handleArchive();
          return;
        }
        cursor += 1;
      }
      if (idx === cursor) void handleCopyLink();
    },
    [isArchived, handleArchive, handleCopyLink],
  );

  if (!name) return null;

  const chipVariant = mapStatusToChipVariant(status);
  const timestamp = lastMessageAt ?? updatedAt ?? null;

  return (
    <ContextMenu actions={actions} onPress={handleMenuPress} preview={null}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        onPress={handlePress}
        style={({ pressed }) => [
          styles.row,
          {
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: theme.colors.border,
            backgroundColor: pressed ? theme.colors.surfaceElevated : "transparent",
          },
        ]}
      >
        <View style={styles.headerLine}>
          <Text variant="headline" color="foreground" numberOfLines={1} style={styles.title}>
            {name}
          </Text>
          {chipVariant ? (
            <Chip
              label={CHIP_LABELS[chipVariant]}
              variant={chipVariant}
              style={styles.chip}
            />
          ) : null}
        </View>
        {branch ? (
          <Text
            variant="caption1"
            color="mutedForeground"
            numberOfLines={1}
            style={[styles.branch, theme.typography.mono, { fontSize: 12 }]}
          >
            {branch}
          </Text>
        ) : null}
        {lastEventPreview ? (
          <Text
            variant="footnote"
            color="mutedForeground"
            numberOfLines={1}
            style={styles.preview}
          >
            {lastEventPreview}
          </Text>
        ) : null}
        {timestamp ? (
          <Text variant="caption2" color="dimForeground" style={styles.timestamp}>
            {timeAgo(timestamp)}
          </Text>
        ) : null}
      </Pressable>
    </ContextMenu>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "column" },
  headerLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, minWidth: 0 },
  chip: { marginLeft: 8 },
  branch: { marginTop: 4 },
  preview: { marginTop: 2 },
  timestamp: { marginTop: 4 },
});
