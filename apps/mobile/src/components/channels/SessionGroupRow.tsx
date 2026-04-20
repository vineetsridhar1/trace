import { memo, useCallback, useMemo, useRef } from "react";
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
import { SessionStatusIndicator } from "@/components/channels/SessionStatusIndicator";
import { getClient } from "@/lib/urql";
import { haptic } from "@/lib/haptics";
import { tryOpenSessionPlayer } from "@/lib/sessionPlayer";
import { useTheme } from "@/theme";
import { useLatestSessionIdForGroup } from "@/hooks/useChannelSessionGroups";
import { CHIP_LABELS, mapStatusToChipVariant } from "@/lib/sessionGroupStatus";
import { timeAgo } from "@/lib/time";

export interface SessionGroupRowProps {
  groupId: string;
  hideStatusChip?: boolean;
}

export const SessionGroupRow = memo(function SessionGroupRow({
  groupId,
  hideStatusChip = false,
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
  const agentStatus = useEntityField("sessions", latestSessionId ?? "", "agentStatus");
  const lastEventPreview = useEntityField(
    "sessions",
    latestSessionId ?? "",
    "_lastEventPreview",
  );

  const rowRef = useRef<View>(null);

  const handlePress = useCallback(() => {
    const node = rowRef.current;
    const tryOpenAt = (anchor?: { x: number; y: number; width: number; height: number }) => {
      if (tryOpenSessionPlayer(latestSessionId, anchor)) return;
      router.push(`/sessions/${groupId}`);
    };
    if (!node) {
      tryOpenAt();
      return;
    }
    node.measureInWindow((x, y, w, h) => {
      tryOpenAt({ x, y, width: w, height: h });
    });
  }, [groupId, latestSessionId, router]);

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
        ref={rowRef}
        accessibilityRole="button"
        accessibilityLabel={name}
        onPress={handlePress}
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
