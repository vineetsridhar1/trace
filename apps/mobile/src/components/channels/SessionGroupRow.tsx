import { memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, View, type NativeSyntheticEvent } from "react-native";
import Animated from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import { SymbolView } from "expo-symbols";
import ContextMenu, {
  type ContextMenuAction,
  type ContextMenuOnPressNativeEvent,
} from "react-native-context-menu-view";
import { ARCHIVE_SESSION_GROUP_MUTATION, useEntityField } from "@trace/client-core";
import { Avatar, Chip, Text } from "@/components/design-system";
import { SessionStatusIndicator } from "@/components/channels/SessionStatusIndicator";
import { getClient } from "@/lib/urql";
import { haptic } from "@/lib/haptics";
import { usePressScale } from "@/lib/motion";
import { prefetchSessionPlayer, tryOpenSessionPlayer } from "@/lib/sessionPlayer";
import { useAttachedCheckoutForGroup } from "@/stores/bridges";
import { useTheme } from "@/theme";
import { useLatestSessionIdForGroup } from "@/hooks/useChannelSessionGroups";
import { CHIP_LABELS, mapStatusToChipVariant } from "@/lib/sessionGroupStatus";
import { timeAgo } from "@/lib/time";

export interface SessionGroupRowProps {
  groupId: string;
  hideStatusChip?: boolean;
  hideAvatar?: boolean;
}

export const SessionGroupRow = memo(function SessionGroupRow({
  groupId,
  hideStatusChip = false,
  hideAvatar = false,
}: SessionGroupRowProps) {
  const theme = useTheme();
  const name = useEntityField("sessionGroups", groupId, "name");
  const status = useEntityField("sessionGroups", groupId, "status");
  const branch = useEntityField("sessionGroups", groupId, "branch");
  const groupRepo = useEntityField("sessionGroups", groupId, "repo") as
    | { name?: string | null }
    | null
    | undefined;
  const archivedAt = useEntityField("sessionGroups", groupId, "archivedAt");
  const attached = useAttachedCheckoutForGroup(groupId);

  const latestSessionId = useLatestSessionIdForGroup(groupId);
  const latestSessionRepo = useEntityField("sessions", latestSessionId ?? "", "repo") as
    | { name?: string | null }
    | null
    | undefined;
  const lastMessageAt = useEntityField("sessions", latestSessionId ?? "", "lastMessageAt");
  const updatedAt = useEntityField("sessions", latestSessionId ?? "", "updatedAt");
  const agentStatus = useEntityField("sessions", latestSessionId ?? "", "agentStatus");
  const lastEventPreview = useEntityField("sessions", latestSessionId ?? "", "_lastEventPreview");
  const createdBy = useEntityField("sessions", latestSessionId ?? "", "createdBy") as
    | { name?: string | null; avatarUrl?: string | null }
    | null
    | undefined;

  const handlePress = useCallback(() => {
    if (!latestSessionId) return;
    void haptic.light();
    prefetchSessionPlayer(latestSessionId);
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

  const handlePressIn = useCallback(() => {
    onPressInScale();
  }, [onPressInScale]);

  if (!name) return null;

  const chipVariant = mapStatusToChipVariant(status);
  const timestamp = lastMessageAt ?? updatedAt ?? null;
  const secondaryLabel = latestSessionRepo?.name ?? groupRepo?.name ?? branch ?? null;

  return (
    <ContextMenu actions={actions} onPress={handleMenuPress} preview={null}>
      <Animated.View style={pressScaleStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={attached ? `${name}, synced to ${attached.bridgeLabel}` : name}
          onPress={handlePress}
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
          {!hideAvatar && createdBy?.name ? (
            <Avatar
              name={createdBy.name}
              uri={createdBy.avatarUrl ?? null}
              size="sm"
              style={styles.avatar}
            />
          ) : null}
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
              {attached ? (
                <SymbolView
                  name="laptopcomputer"
                  size={14}
                  tintColor={theme.colors.success}
                  style={styles.linkedIcon}
                />
              ) : null}
            </View>
            {secondaryLabel ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.branch,
                  theme.typography.mono,
                  { color: theme.colors.dimForeground, fontSize: 12 },
                ]}
              >
                {secondaryLabel}
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
  avatar: { marginRight: 10, marginTop: 2 },
  main: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  title: { fontWeight: "600" },
  titleText: { flexShrink: 1, minWidth: 0 },
  linkedIcon: { width: 14, height: 14 },
  branch: { marginTop: 2 },
  preview: { marginTop: 4 },
  accessory: {
    marginLeft: 12,
    alignItems: "flex-end",
    gap: 6,
  },
  timestamp: {},
});
