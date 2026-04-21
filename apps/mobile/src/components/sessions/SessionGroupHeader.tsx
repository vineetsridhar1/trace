import { useCallback, useMemo } from "react";
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  View,
  type NativeSyntheticEvent,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import ContextMenu, {
  type ContextMenuAction,
  type ContextMenuOnPressNativeEvent,
} from "react-native-context-menu-view";
import {
  ARCHIVE_SESSION_GROUP_MUTATION,
  useEntityField,
} from "@trace/client-core";
import type { SessionGroupStatus } from "@trace/gql";
import type { ChipVariant } from "@/components/design-system";
import { Chip, Glass, Spinner, Text } from "@/components/design-system";
import { SessionStatusIndicator } from "@/components/channels/SessionStatusIndicator";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { useTheme } from "@/theme";
import { SessionActionsMenu, type SessionMenuAction } from "./SessionActionsMenu";

interface SessionGroupHeaderProps {
  groupId: string;
  /** The session currently shown; drives the status dot's agentStatus overlay. */
  sessionId?: string;
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
  sessionId,
  solid: _solid = false,
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
  const agentStatus = useEntityField("sessions", sessionId ?? "", "agentStatus") as
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
    const items: SessionMenuAction[] = [];
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

  const actions = useMemo<ContextMenuAction[]>(
    () =>
      menuItems.map((m) => ({
        title: m.title,
        systemIcon: m.systemIcon,
        destructive: m.destructive,
      })),
    [menuItems],
  );

  const handleMenuPress = useCallback(
    (e: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>) => {
      menuItems[e.nativeEvent.index]?.onPress();
    },
    [menuItems],
  );

  const chip = prChip(prUrl, status);

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
      <View style={styles.row}>
        <ContextMenu
          actions={actions}
          onPress={handleMenuPress}
          dropdownMenuMode
          style={styles.flex}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={name ? `${name} — actions` : "Session actions"}
            onPress={() => void haptic.light()}
          >
            <Glass preset="card" style={styles.titlePill}>
              <View style={[styles.titleRow, { paddingHorizontal: theme.spacing.md }]}>
                <SessionStatusIndicator
                  status={status as SessionGroupStatus | null | undefined}
                  agentStatus={agentStatus}
                  size={10}
                />
                <View style={styles.textBlock}>
                  {name ? (
                    <Text variant="headline" numberOfLines={1}>
                      {name}
                    </Text>
                  ) : (
                    <Spinner size="small" color="mutedForeground" />
                  )}
                  {branch ? (
                    <Text
                      variant="caption1"
                      numberOfLines={1}
                      color="mutedForeground"
                      style={styles.branch}
                    >
                      {branch}
                    </Text>
                  ) : null}
                </View>
                {chip ? <Chip label={chip.label} variant={chip.variant} /> : null}
              </View>
            </Glass>
          </Pressable>
        </ContextMenu>

        <SessionActionsMenu actions={menuItems} accessibilityLabel="Session actions" />
      </View>
    </View>
  );
}

const PILL_HEIGHT = 48;

const styles = StyleSheet.create({
  container: {},
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  flex: { flex: 1, minWidth: 0 },
  titlePill: {
    height: PILL_HEIGHT,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  branch: {
    marginTop: 1,
    fontFamily: "Menlo",
  },
});
