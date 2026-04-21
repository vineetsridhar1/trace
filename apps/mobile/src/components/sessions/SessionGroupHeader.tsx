import { useCallback, useMemo, useState } from "react";
import { Alert, Linking, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  ARCHIVE_SESSION_GROUP_MUTATION,
  useEntityField,
} from "@trace/client-core";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { useTheme } from "@/theme";
import { SessionActionsMenu, type SessionMenuAction } from "./SessionActionsMenu";
import { SessionGroupTitleMenu } from "./SessionGroupTitleMenu";

interface SessionGroupHeaderProps {
  groupId: string;
  /** The session currently shown; drives the status dot's agentStatus overlay. */
  sessionId?: string;
}

export function SessionGroupHeader({
  groupId,
  sessionId,
}: SessionGroupHeaderProps) {
  const theme = useTheme();
  const prUrl = useEntityField("sessionGroups", groupId, "prUrl");
  const status = useEntityField("sessionGroups", groupId, "status");
  const archivedAt = useEntityField("sessionGroups", groupId, "archivedAt");

  const [rowWidth, setRowWidth] = useState(0);
  const handleRowLayout = useCallback((e: LayoutChangeEvent) => {
    setRowWidth(e.nativeEvent.layout.width);
  }, []);

  const handleOpenPr = useCallback(async () => {
    if (!prUrl) return;
    void haptic.light();
    try {
      await Linking.openURL(prUrl);
    } catch (error) {
      void haptic.error();
      console.warn("[session-group-header] open pr failed", error);
    }
  }, [prUrl]);

  const archiveGroup = useCallback(async () => {
    void haptic.heavy();
    const result = await getClient()
      .mutation(ARCHIVE_SESSION_GROUP_MUTATION, { id: groupId })
      .toPromise();
    if (result.error) {
      void haptic.error();
      console.warn("[archiveSessionGroup] failed", result.error);
      return;
    }
    void haptic.success();
  }, [groupId]);

  const handleArchive = useCallback(() => {
    Alert.alert(
      "Archive workspace?",
      "This removes it from the active list. You can still find it under Archived.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Archive", style: "destructive", onPress: () => void archiveGroup() },
      ],
    );
  }, [archiveGroup]);

  const handleCopyLink = useCallback(async () => {
    const link = sessionId
      ? `trace://sessions/${groupId}/${sessionId}`
      : `trace://sessions/${groupId}`;
    await Clipboard.setStringAsync(link);
    void haptic.light();
  }, [groupId, sessionId]);

  const menuItems = useMemo(() => {
    const items: SessionMenuAction[] = [];
    if (prUrl) items.push({ title: "Open PR", systemIcon: "arrow.up.forward.square", onPress: handleOpenPr });
    items.push({ title: "Copy link", systemIcon: "link", onPress: handleCopyLink });
    if (!archivedAt && status !== "archived") {
      items.push({
        title: "Archive workspace",
        systemIcon: "archivebox",
        destructive: true,
        onPress: handleArchive,
      });
    }
    return items;
  }, [
    archivedAt,
    handleArchive,
    handleCopyLink,
    handleOpenPr,
    prUrl,
    status,
  ]);

  return (
    <View
      style={[
        styles.container,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.sm,
        },
      ]}
    >
      <View style={styles.row} onLayout={handleRowLayout}>
        <SessionGroupTitleMenu
          groupId={groupId}
          sessionId={sessionId}
          fullWidth={rowWidth}
        />
        <SessionActionsMenu actions={menuItems} accessibilityLabel="Session actions" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
