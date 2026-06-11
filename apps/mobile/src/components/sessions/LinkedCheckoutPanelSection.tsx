import { useCallback, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, View } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import {
  QUEUE_SESSION_MESSAGE_MUTATION,
  SEND_SESSION_MESSAGE_MUTATION,
  useEntityField,
} from "@trace/client-core";
import type { SessionConnection } from "@trace/gql";
import { TraceLoader, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { useTheme, type Theme } from "@/theme";
import { alpha } from "@/theme/colors";
import {
  useLinkedCheckout,
  type LinkedCheckoutAction,
  type UseLinkedCheckoutResult,
} from "@/hooks/useLinkedCheckout";
import { LinkedCheckoutSyncConflictSheet } from "./LinkedCheckoutSyncConflictSheet";

interface LinkedCheckoutPanelSectionProps {
  groupId: string;
  sessionId?: string;
}

const ACTION_ALERT_TITLE: Record<LinkedCheckoutAction, string> = {
  sync: "Spotlight failed",
  commit: "Commit failed",
  restore: "Restore failed",
  "toggle-auto-sync": "Couldn't update auto-sync",
};

const CREATE_PR_PROMPT =
  "Create a pull request for this session branch. Push any required commits, open the PR against the repository's normal merge target, and report the PR link.";
const MERGE_PR_PROMPT =
  "Merge the pull request for this session branch. Verify it is ready to merge, merge it using the repository's normal strategy, and report the result.";

function getPullRequestLabel(prUrl: string): string {
  const match = prUrl.match(/\/pull\/(\d+)(?:[/?#]|$)/);
  return match ? `#${match[1]}` : "PR";
}

export function LinkedCheckoutPanelSection({ groupId, sessionId }: LinkedCheckoutPanelSectionProps) {
  const checkout = useLinkedCheckout(groupId);
  if (!checkout.available) return null;
  return <PanelBody checkout={checkout} groupId={groupId} sessionId={sessionId} />;
}

function PanelBody({
  checkout,
  groupId,
  sessionId,
}: {
  checkout: UseLinkedCheckoutResult;
  groupId: string;
  sessionId?: string;
}) {
  const theme = useTheme();
  const [syncConflictOpen, setSyncConflictOpen] = useState(false);
  const [syncConflictError, setSyncConflictError] = useState<string | null>(null);
  const [pendingGitHubAction, setPendingGitHubAction] = useState<"create" | "merge" | null>(null);
  const prUrl = useEntityField("sessionGroups", groupId, "prUrl") as string | null | undefined;
  const sessionOptimistic = useEntityField("sessions", sessionId ?? "", "_optimistic") as
    | boolean
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
  const {
    loading,
    fetchError,
    status,
    branch,
    syncedCommitSha,
    repoLinked,
    isAttachedToThisGroup,
    isAttachedElsewhere,
    hasUncommittedChanges,
    pendingAction,
    refresh,
    sync,
  } = checkout;

  const onSync = useCallback(async () => {
    void haptic.light();
    const outcome = await sync();
    if (!outcome.ok) {
      void haptic.error();
      if (outcome.errorCode === "DIRTY_ROOT_CHECKOUT") {
        setSyncConflictError(outcome.error ?? null);
        setSyncConflictOpen(true);
        return;
      }
      Alert.alert(ACTION_ALERT_TITLE.sync, outcome.error ?? "Unknown error.");
      return;
    }
    setSyncConflictError(null);
    setSyncConflictOpen(false);
    void haptic.success();
  }, [sync]);

  const onResolveSyncConflict = useCallback(
    async ({
      strategy,
      commitMessage,
    }: {
      strategy: "DISCARD" | "COMMIT" | "REBASE" | "STASH";
      commitMessage?: string;
    }) => {
      void haptic.light();
      const outcome = await sync({
        conflictStrategy: strategy,
        commitMessage,
      });
      if (!outcome.ok) {
        void haptic.error();
        setSyncConflictError(outcome.error ?? "Unknown error.");
        return;
      }
      setSyncConflictError(null);
      setSyncConflictOpen(false);
      void haptic.success();
    },
    [sync],
  );
  const canQueueGitHubAction = !!agentStatus && agentStatus === "active" && !worktreeDeleted;
  const canSendGitHubAction =
    !!sessionId &&
    !sessionOptimistic &&
    !!agentStatus &&
    !worktreeDeleted &&
    sessionConnection?.state !== "disconnected" &&
    agentStatus !== "active";
  const canRunGitHubAction = canQueueGitHubAction || canSendGitHubAction;
  const sendGitHubAction = useCallback(
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
  const conflictSheet = (
    <LinkedCheckoutSyncConflictSheet
      open={syncConflictOpen}
      error={syncConflictError}
      pending={pendingAction === "sync"}
      onClose={() => {
        if (pendingAction === "sync") return;
        setSyncConflictOpen(false);
      }}
      onResolve={onResolveSyncConflict}
    />
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingRow]}>
        <TraceLoader size="small" color="mutedForeground" />
        <Text variant="footnote" color="mutedForeground">
          Checking local checkout…
        </Text>
      </View>
    );
  }

  if (fetchError) {
    return (
      <View style={styles.container}>
        <SectionHeader />
        <Text variant="footnote" color="destructive" numberOfLines={2}>
          {fetchError}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry"
          onPress={refresh}
          style={({ pressed }) => [styles.retryRow, { opacity: pressed ? 0.6 : 1 }]}
        >
          <SymbolView
            name="arrow.clockwise"
            size={14}
            tintColor={theme.colors.accent}
            resizeMode="scaleAspectFit"
            style={styles.retryIcon}
          />
          <Text variant="footnote" color="accent">
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!repoLinked) {
    return (
      <View style={styles.container}>
        <SectionHeader />
        <Text variant="footnote" color="mutedForeground">
          Open this workspace in Trace Desktop to link a local checkout.
        </Text>
      </View>
    );
  }

  if (isAttachedElsewhere) {
    return (
      <View style={styles.container}>
        {conflictSheet}
        <SectionHeader />
        <Text variant="footnote" color="mutedForeground">
          Main worktree is attached to another workspace.
        </Text>
        <ActionRow
          theme={theme}
          pendingAction={pendingAction}
          isAttachedToThisGroup={false}
          prUrl={prUrl}
          canRunGitHubAction={canRunGitHubAction}
          pendingGitHubAction={pendingGitHubAction}
          onSync={onSync}
          onRunGitHubAction={(action) => void sendGitHubAction(action)}
        />
      </View>
    );
  }

  const subtitle =
    isAttachedToThisGroup && branch
      ? `Local checkout spotlighting ${branch}${
          syncedCommitSha ? ` at ${syncedCommitSha.slice(0, 7)}` : ""
        }${status?.autoSyncEnabled ? "" : " (auto-sync paused)"}${
          hasUncommittedChanges ? " (has live changes)" : ""
        }`
      : "Spotlight this workspace in your local checkout.";

  return (
    <View style={styles.container}>
      {conflictSheet}
      <SectionHeader />
      <Text variant="footnote" color="mutedForeground" numberOfLines={2}>
        {subtitle}
      </Text>
      {status?.lastSyncError ? (
        <Text variant="footnote" color="destructive" numberOfLines={2}>
          {status.lastSyncError}
        </Text>
      ) : null}
      <ActionRow
        theme={theme}
        pendingAction={pendingAction}
        isAttachedToThisGroup={isAttachedToThisGroup}
        prUrl={prUrl}
        canRunGitHubAction={canRunGitHubAction}
        pendingGitHubAction={pendingGitHubAction}
        onSync={() => void onSync()}
        onRunGitHubAction={(action) => void sendGitHubAction(action)}
      />
    </View>
  );
}

function SectionHeader() {
  return (
    <Text variant="caption2" color="dimForeground" style={styles.sectionLabel}>
      LOCAL CHECKOUT
    </Text>
  );
}

interface ActionRowProps {
  theme: Theme;
  pendingAction: LinkedCheckoutAction | null;
  isAttachedToThisGroup: boolean;
  prUrl: string | null | undefined;
  canRunGitHubAction: boolean;
  pendingGitHubAction: "create" | "merge" | null;
  onSync: () => void;
  onRunGitHubAction: (action: "create" | "merge") => void;
}

function ActionRow({
  theme,
  pendingAction,
  isAttachedToThisGroup,
  prUrl,
  canRunGitHubAction,
  pendingGitHubAction,
  onSync,
  onRunGitHubAction,
}: ActionRowProps) {
  const busy = pendingAction !== null;
  const prLabel = prUrl ? getPullRequestLabel(prUrl) : null;
  const githubBusy = pendingGitHubAction !== null;
  return (
    <View style={[styles.actionRow, { gap: theme.spacing.xs }]}>
      <ActionButton
        theme={theme}
        label="Spotlight"
        symbol="sparkles"
        iconColor="warning"
        accent={isAttachedToThisGroup}
        loading={pendingAction === "sync"}
        disabled={busy}
        onPress={onSync}
      />
      {prUrl && prLabel ? (
        <>
          <ActionButton
            theme={theme}
            label={prLabel}
            symbol="arrow.up.forward"
            success
            loading={false}
            disabled={false}
            onPress={() => {
              void haptic.light();
              void Linking.openURL(prUrl);
            }}
          />
          <ActionButton
            theme={theme}
            label="Merge"
            symbol="arrow.triangle.merge"
            success
            loading={pendingGitHubAction === "merge"}
            disabled={!canRunGitHubAction || githubBusy}
            onPress={() => onRunGitHubAction("merge")}
          />
        </>
      ) : (
        <ActionButton
          theme={theme}
          label="Create PR"
          symbol="arrow.triangle.pull"
          success
          loading={pendingGitHubAction === "create"}
          disabled={!canRunGitHubAction || githubBusy}
          onPress={() => onRunGitHubAction("create")}
        />
      )}
    </View>
  );
}

interface ActionButtonProps {
  theme: Theme;
  label: string;
  symbol: SFSymbol;
  loading: boolean;
  disabled: boolean;
  accent?: boolean;
  success?: boolean;
  iconColor?: keyof Theme["colors"];
  onPress: () => void;
}

function ActionButton({
  theme,
  label,
  symbol,
  loading,
  disabled,
  accent = false,
  success = false,
  iconColor,
  onPress,
}: ActionButtonProps) {
  const fg: keyof Theme["colors"] = success ? "success" : "foreground";
  const iconTint = theme.colors[iconColor ?? fg];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: accent
            ? alpha(theme.colors.accent, 0.12)
            : alpha(theme.colors.surface, 0.4),
          borderColor: accent
            ? alpha(theme.colors.accent, 0.35)
            : alpha(theme.colors.foreground, 0.1),
          borderRadius: theme.radius.md,
          opacity: disabled && !loading ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      {loading ? (
        <TraceLoader size="small" color={fg} />
      ) : (
        <SymbolView
          name={symbol}
          size={13}
          tintColor={iconTint}
          resizeMode="scaleAspectFit"
          style={styles.actionIcon}
        />
      )}
      <Text variant="footnote" color={fg}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionLabel: {
    letterSpacing: 0.6,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 6,
  },
  actionButton: {
    flexGrow: 1,
    minWidth: 92,
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  actionIcon: {
    width: 13,
    height: 13,
  },
  retryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  retryIcon: {
    width: 14,
    height: 14,
  },
});
