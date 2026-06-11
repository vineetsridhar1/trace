import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Alert, Linking, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  ARCHIVE_SESSION_GROUP_MUTATION,
  useEntityField,
  useEntityStore,
} from "@trace/client-core";
import type { SessionConnection, SessionEndpoints } from "@trace/gql";
import { haptic } from "@/lib/haptics";
import { buildRunScriptsCommand, isRunScriptArray } from "@/lib/runScripts";
import { getClient } from "@/lib/urql";
import { useMobileUIStore } from "@/stores/ui";
import { useTheme } from "@/theme";
import { SessionActionsMenu, type SessionMenuAction } from "./SessionActionsMenu";
import { SessionMovePickerSheetContent } from "./SessionMovePickerSheetContent";
import { SessionTabSwitcherSheet } from "./SessionTabSwitcherSheet";
import { SessionGroupTitleMenu } from "./SessionGroupTitleMenu";
import { SessionComposerBottomSheet } from "./session-input-composer/SessionComposerBottomSheet";

interface SessionGroupHeaderProps {
  groupId: string;
  /** The session currently shown; drives the status dot's agentStatus overlay. */
  sessionId?: string;
  activePane?: "session" | "terminal" | "browser";
  browserEnabled?: boolean;
  onOpenBrowser?: () => void;
  leadingAccessory?: ReactNode;
}

export function SessionGroupHeader({
  groupId,
  sessionId,
  activePane = "session",
  browserEnabled = true,
  onOpenBrowser,
  leadingAccessory,
}: SessionGroupHeaderProps) {
  const theme = useTheme();
  const router = useRouter();
  const prUrl = useEntityField("sessionGroups", groupId, "prUrl");
  const status = useEntityField("sessionGroups", groupId, "status");
  const archivedAt = useEntityField("sessionGroups", groupId, "archivedAt");
  const sessionGroupChannel = useEntityField("sessionGroups", groupId, "channel") as
    | { id?: string | null }
    | null
    | undefined;
  const rawChannelId = useEntityStore(
    (state) =>
      (state.sessionGroups[groupId] as { channelId?: string | null } | undefined)?.channelId ??
      null,
  );
  const channelId = sessionGroupChannel?.id ?? rawChannelId ?? null;
  const rawRunScripts = useEntityField("channels", channelId ?? "", "runScripts");
  const setupStatus = useEntityField("sessionGroups", groupId, "setupStatus") as
    | "idle"
    | "running"
    | "completed"
    | "failed"
    | null
    | undefined;
  const setupScript = useEntityField("channels", channelId ?? "", "setupScript") as
    | string
    | null
    | undefined;
  const runScripts = isRunScriptArray(rawRunScripts) ? rawRunScripts : [];
  const sessionOptimistic = useEntityField("sessions", sessionId ?? "", "_optimistic") as
    | boolean
    | undefined;
  const sessionStatus = useEntityField("sessions", sessionId ?? "", "sessionStatus") as
    | string
    | null
    | undefined;
  const worktreeDeleted = useEntityField("sessions", sessionId ?? "", "worktreeDeleted") as
    | boolean
    | undefined;
  const sessionConnection = useEntityField("sessions", sessionId ?? "", "connection") as
    | SessionConnection
    | null
    | undefined;
  const sessionEndpoints = useEntityField("sessions", sessionId ?? "", "endpoints") as
    | SessionEndpoints
    | null
    | undefined;
  const mergedUnavailable = sessionStatus === "merged" && worktreeDeleted !== false;
  const canMoveSession =
    !!sessionId &&
    !sessionOptimistic &&
    !mergedUnavailable &&
    (sessionConnection?.canMove ?? true);

  const [rowWidth, setRowWidth] = useState(0);
  const [leadingWidth, setLeadingWidth] = useState(0);
  const [tabSwitcherOpen, setTabSwitcherOpen] = useState(false);
  const [moveSheetOpen, setMoveSheetOpen] = useState(false);
  const handleRowLayout = useCallback((e: LayoutChangeEvent) => {
    setRowWidth(e.nativeEvent.layout.width);
  }, []);
  const handleLeadingLayout = useCallback((e: LayoutChangeEvent) => {
    setLeadingWidth(e.nativeEvent.layout.width);
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
      "This removes it from the active list. Empty workspaces are deleted instead of moving to Archived.",
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

  const handleOpenTabSwitcher = useCallback(() => {
    setTabSwitcherOpen(true);
  }, []);
  const handleOpenMoveSheet = useCallback(() => {
    setMoveSheetOpen(true);
  }, []);
  const setupBlocking = Boolean(setupScript) && setupStatus === "running";
  const canRunScripts = runScripts.length > 0 && !!sessionId && !sessionOptimistic && !setupBlocking;
  const handleRunScripts = useCallback(() => {
    if (!sessionId || runScripts.length === 0) return;
    if (setupBlocking) {
      Alert.alert("Setup still running", "Run scripts after workspace setup finishes.");
      return;
    }
    void haptic.light();
    const command = buildRunScriptsCommand(runScripts);
    useMobileUIStore.getState().queueTerminalInitialCommand(sessionId, `${command}\n`);
    router.push(`/sessions/${groupId}/${sessionId}?pane=terminal`);
  }, [groupId, router, runScripts, sessionId, setupBlocking]);
  const handleOpenWorkspace = useCallback(() => {
    const params = new URLSearchParams({ groupId });
    if (sessionId) params.set("sessionId", sessionId);
    router.push(`/sheets/workspace?${params.toString()}`);
  }, [groupId, router, sessionId]);
  const handleOpenApplications = useCallback(() => {
    if (!sessionId) return;
    const params = new URLSearchParams({ groupId, sessionId });
    router.push(`/sheets/applications?${params.toString()}`);
  }, [groupId, router, sessionId]);

  const menuItems = useMemo(() => {
    const items: SessionMenuAction[] = [];
    if (sessionId && !sessionOptimistic) {
      items.push({
        title: "Tabs & terminals",
        systemIcon: "rectangle.on.rectangle",
        onPress: handleOpenTabSwitcher,
      });
    }
    items.push({
      title: "Workspace",
      systemIcon: "folder",
      onPress: handleOpenWorkspace,
    });
    if (sessionId && !sessionOptimistic) {
      const count = sessionEndpoints?.ports?.length ?? 0;
      items.push({
        title: count > 0 ? `Applications (${count})` : "Applications",
        systemIcon: "network",
        onPress: handleOpenApplications,
      });
    }
    if (canRunScripts) {
      items.push({
        title: "Run scripts",
        systemIcon: "play.fill",
        onPress: handleRunScripts,
      });
    }
    if (canMoveSession) {
      items.push({
        title: "Move session",
        systemIcon: "arrow.left.arrow.right",
        onPress: handleOpenMoveSheet,
      });
    }
    if (prUrl)
      items.push({
        title: "Open PR",
        systemIcon: "arrow.up.forward.square",
        onPress: handleOpenPr,
      });
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
    canMoveSession,
    canRunScripts,
    handleArchive,
    handleOpenMoveSheet,
    handleOpenApplications,
    handleOpenWorkspace,
    handleOpenTabSwitcher,
    handleRunScripts,
    handleCopyLink,
    handleOpenPr,
    prUrl,
    sessionId,
    sessionEndpoints?.ports?.length,
    sessionOptimistic,
    status,
  ]);

  const expandLeftInset = leadingAccessory ? leadingWidth + theme.spacing.sm : 0;

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
        {leadingAccessory ? (
          <View onLayout={handleLeadingLayout} style={styles.leadingAccessory}>
            {leadingAccessory}
          </View>
        ) : null}
        <SessionGroupTitleMenu
          groupId={groupId}
          sessionId={sessionId}
          browserEnabled={browserEnabled}
          onOpenBrowser={onOpenBrowser}
          fullWidth={rowWidth}
          expandLeftInset={expandLeftInset}
        />
        <SessionActionsMenu actions={menuItems} accessibilityLabel="Session actions" />
      </View>
      {sessionId ? (
        <SessionTabSwitcherSheet
          open={tabSwitcherOpen}
          groupId={groupId}
          activeSessionId={sessionId}
          activePane={activePane}
          onClose={() => setTabSwitcherOpen(false)}
        />
      ) : null}
      {sessionId ? (
        <SessionComposerBottomSheet visible={moveSheetOpen} onClose={() => setMoveSheetOpen(false)}>
          <SessionMovePickerSheetContent
            sessionId={sessionId}
            onClose={() => setMoveSheetOpen(false)}
          />
        </SessionComposerBottomSheet>
      ) : null}
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
  leadingAccessory: {
    alignItems: "center",
    justifyContent: "center",
  },
});
