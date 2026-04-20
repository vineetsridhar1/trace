import { useCallback, useMemo } from "react";
import { Alert, Linking, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  ARCHIVE_SESSION_GROUP_MUTATION,
  useEntityField,
} from "@trace/client-core";
import type { ChipVariant, IconMenuItem } from "@/components/design-system";
import { Chip, Glass, IconButton, Spinner, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { useTheme } from "@/theme";

export interface SessionGroupHeaderProps {
  groupId: string;
  solid?: boolean;
}

function prChip(
  prUrl: string | null | undefined,
  status: string | null | undefined,
): { label: string; variant: ChipVariant } | null {
  if (!prUrl) return null;
  if (status === "merged") return { label: "PR merged", variant: "done" };
  if (status === "failed" || status === "stopped" || status === "archived") {
    return { label: "PR closed", variant: "failed" };
  }
  return { label: "PR open", variant: "inReview" };
}

export function SessionGroupHeader({
  groupId,
  solid = false,
}: SessionGroupHeaderProps) {
  const theme = useTheme();
  const name = useEntityField("sessionGroups", groupId, "name") as string | null | undefined;
  const branch = useEntityField("sessionGroups", groupId, "branch") as
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
    void haptic.medium();
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
    await Clipboard.setStringAsync(`trace://sessions/${groupId}`);
    void haptic.success();
  }, [groupId]);

  const menuItems = useMemo(() => {
    const items: IconMenuItem[] = [];
    if (prUrl) items.push({ title: "Open PR", systemIcon: "arrow.up.forward.square", onPress: handleOpenPr });
    if (!archivedAt && status !== "archived") {
      items.push({
        title: "Archive workspace",
        systemIcon: "archivebox",
        destructive: true,
        onPress: handleArchive,
      });
    }
    items.push({ title: "Copy link", systemIcon: "link", onPress: handleCopyLink });
    return items;
  }, [archivedAt, handleArchive, handleCopyLink, handleOpenPr, prUrl, status]);

  const content = (
    <View
      style={[
        styles.content,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderBottomColor: theme.colors.borderMuted,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.textBlock}>
          {name ? (
            <>
              <Text variant="title1" numberOfLines={2}>
                {name}
              </Text>
              {branch ? (
                <Text variant="mono" numberOfLines={1} color="mutedForeground">
                  {branch}
                </Text>
              ) : null}
            </>
          ) : (
            <Spinner size="small" color="mutedForeground" />
          )}
        </View>
        <IconButton
          symbol="ellipsis.circle"
          size="lg"
          color="mutedForeground"
          onPress={() => {}}
          accessibilityLabel="Session group actions"
          menuItems={menuItems}
        />
      </View>
      {(() => {
        const chip = prChip(prUrl, status);
        return chip ? <Chip label={chip.label} variant={chip.variant} /> : null;
      })()}
    </View>
  );

  if (solid) {
    return (
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.borderMuted,
        }}
      >
        {content}
      </View>
    );
  }

  return (
    <Glass preset="pinnedBar" style={styles.glass}>
      {content}
    </Glass>
  );
}

const styles = StyleSheet.create({
  glass: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: {
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
