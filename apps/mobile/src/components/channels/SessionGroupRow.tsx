import { memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, View, type NativeSyntheticEvent } from "react-native";
import Animated from "react-native-reanimated";
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
import { SessionContextPreview } from "@/components/channels/SessionContextPreview";
import { SessionStatusIndicator } from "@/components/channels/SessionStatusIndicator";
import { getClient } from "@/lib/urql";
import { haptic } from "@/lib/haptics";
import { usePressScale } from "@/lib/motion";
import { prefetchSessionPlayer, tryOpenSessionPlayer } from "@/lib/sessionPlayer";
import { useTheme } from "@/theme";
import { useLatestSessionIdForGroup } from "@/hooks/useChannelSessionGroups";
import { useSessionPreviewMessage } from "@/hooks/useSessionPreviewMessage";
import { CHIP_LABELS, mapStatusToChipVariant } from "@/lib/sessionGroupStatus";
import { timeAgo } from "@/lib/time";

// Passing onLongPress to Pressable suppresses onPress when the user holds
// long enough for the native context menu to take over.
const noop = () => {};

export interface SessionGroupRowProps {
  groupId: string;
  hideStatusChip?: boolean;
}

export const SessionGroupRow = memo(function SessionGroupRow({
  groupId,
  hideStatusChip = false,
}: SessionGroupRowProps) {
  const theme = useTheme();
  const name = useEntityField("sessionGroups", groupId, "name");
  const status = useEntityField("sessionGroups", groupId, "status");
  const branch = useEntityField("sessionGroups", groupId, "branch");
  const archivedAt = useEntityField("sessionGroups", groupId, "archivedAt");

  const latestSessionId = useLatestSessionIdForGroup(groupId);
  const lastMessageAt = useEntityField("sessions", latestSessionId ?? "", "lastMessageAt");
  const updatedAt = useEntityField("sessions", latestSessionId ?? "", "updatedAt");
  const agentStatus = useEntityField("sessions", latestSessionId ?? "", "agentStatus");
  const lastEventPreview = useEntityField(
    "sessions",
    latestSessionId ?? "",
    "_lastEventPreview",
  );
  const {
    loading: previewLoading,
    message: previewMessage,
    warmPreview,
  } = useSessionPreviewMessage({
    sessionId: latestSessionId,
    cachedPreview: lastEventPreview,
    fallbackTimestamp: lastMessageAt ?? updatedAt ?? null,
  });

  const handlePress = useCallback(() => {
    if (!latestSessionId) return;
    void haptic.light();
    tryOpenSessionPlayer(latestSessionId);
  }, [latestSessionId]);

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

  // Subtle row scale on press — pairs with the bg highlight so the press
  // reads as a real touch instead of a web-style hover. 0.99 keeps it from
  // feeling exaggerated on these wide multi-line rows.
  const {
    animatedStyle: pressScaleStyle,
    onPressIn: onPressInScale,
    onPressOut,
  } = usePressScale(0.99);

  // Prefetch group + session detail on touch-down so data is hydrated in
  // Zustand before the overlay's spring finishes. Without this, the first
  // open shows a spinner → full-tree remount mid-animation, which is the
  // source of the first-open lag. Subsequent opens already hit the cache,
  // which is why they feel fluid.
  const handlePressIn = useCallback(() => {
    onPressInScale();
    if (latestSessionId) prefetchSessionPlayer(latestSessionId);
    void warmPreview();
  }, [onPressInScale, latestSessionId, warmPreview]);

  if (!name) return null;

  const chipVariant = mapStatusToChipVariant(status);
  const timestamp = lastMessageAt ?? updatedAt ?? null;

  return (
    <ContextMenu
      actions={actions}
      onPress={handleMenuPress}
      onPreviewPress={handlePress}
      preview={
        <SessionContextPreview
          loading={previewLoading}
          message={previewMessage}
          subtitle={branch}
          title={name}
        />
      }
      previewBackgroundColor="transparent"
      borderRadius={theme.radius.lg}
    >
      <Animated.View style={pressScaleStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={name}
          onPress={handlePress}
          onLongPress={noop}
          delayLongPress={250}
          onPressIn={handlePressIn}
          onPressOut={onPressOut}
          style={({ pressed }) => [
            styles.row,
            {
              paddingHorizontal: theme.spacing.lg,
              paddingVertical: theme.spacing.md,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: theme.colors.borderMuted,
              backgroundColor: pressed ? theme.colors.surfaceElevated : "transparent",
            },
          ]}
        >
          <View style={styles.main}>
            <View style={styles.titleRow}>
              <SessionStatusIndicator status={status} agentStatus={agentStatus} />
              <Text
                variant="body"
                color="foreground"
                numberOfLines={1}
                style={[styles.title, styles.titleText]}
              >
                {name}
              </Text>
            </View>
            {branch ? (
              <Text
                numberOfLines={1}
                style={[styles.branch, theme.typography.mono, { color: theme.colors.dimForeground, fontSize: 12 }]}
              >
                {branch}
              </Text>
            ) : null}
            {previewMessage?.text ? (
              <Text
                variant="footnote"
                color="mutedForeground"
                numberOfLines={1}
                style={styles.preview}
              >
                {previewMessage.text}
              </Text>
            ) : null}
          </View>
          <View style={styles.accessory}>
            {!hideStatusChip && chipVariant ? (
              <Chip label={CHIP_LABELS[chipVariant]} variant={chipVariant} />
            ) : null}
            {timestamp ? (
              <Text variant="caption2" color="dimForeground" style={styles.timestamp}>
                {timeAgo(timestamp)}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </ContextMenu>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: 60,
  },
  main: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  title: { fontWeight: "600" },
  titleText: { flex: 1, minWidth: 0 },
  branch: { marginTop: 2 },
  preview: { marginTop: 4 },
  accessory: {
    marginLeft: 12,
    alignItems: "flex-end",
    gap: 6,
  },
  timestamp: {},
});
