import { useCallback, useMemo } from "react";
import { Alert, Linking, Pressable, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { SymbolView } from "expo-symbols";
import {
  ARCHIVE_SESSION_GROUP_MUTATION,
  useEntityField,
} from "@trace/client-core";
import { Avatar, Spinner, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { useTheme } from "@/theme";
import { SessionActionsMenu, type SessionMenuAction } from "./SessionActionsMenu";

interface SessionPageHeaderProps {
  groupId: string;
  sessionId: string;
  sessionCount: number;
  onBack: () => void;
}

export function SessionPageHeader({
  groupId,
  sessionId,
  sessionCount,
  onBack,
}: SessionPageHeaderProps) {
  const theme = useTheme();
  const name = useEntityField("sessionGroups", groupId, "name") as
    | string
    | null
    | undefined;
  const prUrl = useEntityField("sessionGroups", groupId, "prUrl") as
    | string
    | null
    | undefined;
  const status = useEntityField("sessionGroups", groupId, "status") as
    | string
    | null
    | undefined;
  const archivedAt = useEntityField("sessionGroups", groupId, "archivedAt") as
    | string
    | null
    | undefined;

  const subtitle = sessionCount === 1 ? "1 tab" : `${sessionCount} tabs`;

  const handleBack = useCallback(() => {
    void haptic.light();
    onBack();
  }, [onBack]);

  const handleOpenPr = useCallback(async () => {
    if (!prUrl) return;
    void haptic.light();
    try {
      await Linking.openURL(prUrl);
    } catch (error) {
      void haptic.error();
      console.warn("[session-page-header] open pr failed", error);
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
    await Clipboard.setStringAsync(`trace://sessions/${groupId}/${sessionId}`);
    void haptic.light();
  }, [groupId, sessionId]);

  const menuItems = useMemo(() => {
    const items: SessionMenuAction[] = [];
    if (prUrl) {
      items.push({
        title: "Open PR",
        systemIcon: "arrow.up.forward.square",
        onPress: handleOpenPr,
      });
    }
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
          paddingTop: theme.spacing.xs,
          paddingBottom: theme.spacing.sm,
        },
      ]}
    >
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          onPress={handleBack}
          style={({ pressed }) => [
            styles.circleButton,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.borderMuted,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <SymbolView
            name="chevron.left"
            size={18}
            tintColor={theme.colors.foreground}
            weight="semibold"
          />
        </Pressable>

        <View
          style={[
            styles.titlePill,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.borderMuted,
            },
          ]}
        >
          {name ? (
            <>
              <Avatar name={name} size="sm" />
              <View style={styles.textBlock}>
                <Text variant="subheadline" numberOfLines={1} style={styles.title}>
                  {name}
                </Text>
                <Text variant="caption1" color="mutedForeground" numberOfLines={1}>
                  {subtitle}
                </Text>
              </View>
            </>
          ) : (
            <Spinner size="small" color="mutedForeground" />
          )}
        </View>

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
    gap: 10,
  },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  titlePill: {
    flex: 1,
    minWidth: 0,
    height: 48,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontWeight: "600",
  },
});
