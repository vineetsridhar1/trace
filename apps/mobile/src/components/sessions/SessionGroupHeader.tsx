import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Alert, Linking, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  ARCHIVE_SESSION_GROUP_MUTATION,
  QUEUE_SESSION_MESSAGE_MUTATION,
  SEND_SESSION_MESSAGE_MUTATION,
  useEntityField,
  useEntityStore,
} from "@trace/client-core";
import type { SessionConnection } from "@trace/gql";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { useMobileUIStore } from "@/stores/ui";
import { useTheme } from "@/theme";
import { useLinkedCheckout } from "@/hooks/useLinkedCheckout";
import { SessionActionsMenu, type SessionMenuAction } from "./SessionActionsMenu";
import { SessionMovePickerSheetContent } from "./SessionMovePickerSheetContent";
import { SessionTabSwitcherSheet } from "./SessionTabSwitcherSheet";
import { SessionGroupTitleMenu } from "./SessionGroupTitleMenu";
import { SessionComposerBottomSheet } from "./session-input-composer/SessionComposerBottomSheet";

const CREATE_PR_PROMPT =
  "Create a pull request for this session branch. Push any required commits, open the PR against the repository's normal merge target, and report the PR link.";
const MERGE_PR_PROMPT =
  "Merge the pull request for this session branch. Verify it is ready to merge, merge it using the repository's normal strategy, and report the result.";

interface RunScript {
  name: string;
  command: string;
}

function isRunScriptArray(value: unknown): value is RunScript[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item != null &&
        typeof item === "object" &&
        typeof (item as { name?: unknown }).name === "string" &&
        typeof (item as { command?: unknown }).command === "string",
    )
  );
}

function buildRunScriptsCommand(scripts: RunScript[]): string {
  return scripts
    .map((script) => `printf '\\n\\033[1m${script.name.replaceAll("'", "'\\''")}\\033[0m\\n'\n${script.command}`)
    .join("\n");
}

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
  const agentStatus = useEntityField("sessions", sessionId ?? "", "agentStatus") as
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
  const linkedCheckout = useLinkedCheckout(groupId);
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
  const [pendingGitHubAction, setPendingGitHubAction] = useState<"create" | "merge" | null>(null);
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
  const handleSpotlight = useCallback(async () => {
    if (linkedCheckout.pendingAction) return;
    void haptic.light();
    const outcome = await linkedCheckout.sync();
    if (outcome.ok) {
      void haptic.success();
      return;
    }
    void haptic.error();
    if (outcome.errorCode === "DIRTY_ROOT_CHECKOUT") {
      Alert.alert(
        "Spotlight conflict",
        "Open the title panel to resolve local checkout changes before spotlighting this workspace.",
      );
      return;
    }
    Alert.alert("Spotlight failed", outcome.error ?? "Unknown error.");
  }, [linkedCheckout]);
  const canQueueGitHubAction = !!agentStatus && agentStatus === "active" && !worktreeDeleted;
  const canSendGitHubAction =
    !!sessionId &&
    !sessionOptimistic &&
    !!agentStatus &&
    !worktreeDeleted &&
    sessionConnection?.state !== "disconnected" &&
    agentStatus !== "active";
  const canRunGitHubAction = canQueueGitHubAction || canSendGitHubAction;
  const handleGitHubAction = useCallback(
    async (action: "create" | "merge") => {
      if (!sessionId || !canRunGitHubAction || pendingGitHubAction) return;
      void haptic.light();
      setPendingGitHubAction(action);
      try {
        const mutation = canQueueGitHubAction
          ? QUEUE_SESSION_MESSAGE_MUTATION
          : SEND_SESSION_MESSAGE_MUTATION;
        const result = await getClient()
          .mutation(mutation, {
            sessionId,
            text: action === "create" ? CREATE_PR_PROMPT : MERGE_PR_PROMPT,
          })
          .toPromise();
        if (result.error) throw result.error;
        void haptic.success();
      } catch (error) {
        void haptic.error();
        Alert.alert(
          action === "create" ? "Couldn't create PR" : "Couldn't merge PR",
          error instanceof Error ? error.message : "Please try again.",
        );
      } finally {
        setPendingGitHubAction(null);
      }
    },
    [canQueueGitHubAction, canRunGitHubAction, pendingGitHubAction, sessionId],
  );
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
    if (linkedCheckout.available && linkedCheckout.repoLinked) {
      items.push({
        title: "Spotlight",
        systemIcon: "sparkle.magnifyingglass",
        onPress: handleSpotlight,
      });
    }
    if (sessionId && !sessionOptimistic && canRunGitHubAction) {
      items.push(
        prUrl
          ? {
              title: "Merge PR",
              systemIcon: "arrow.triangle.merge",
              onPress: () => void handleGitHubAction("merge"),
            }
          : {
              title: "Create PR",
              systemIcon: "arrow.triangle.pull",
              onPress: () => void handleGitHubAction("create"),
            },
      );
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
    handleGitHubAction,
    handleOpenMoveSheet,
    handleOpenWorkspace,
    handleOpenTabSwitcher,
    handleRunScripts,
    handleSpotlight,
    handleCopyLink,
    handleOpenPr,
    linkedCheckout.available,
    linkedCheckout.repoLinked,
    prUrl,
    canRunGitHubAction,
    sessionId,
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
