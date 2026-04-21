import { useCallback } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { Spinner, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { useTheme, type Theme } from "@/theme";
import {
  useLinkedCheckout,
  type LinkedCheckoutAction,
  type UseLinkedCheckoutResult,
} from "@/hooks/useLinkedCheckout";

interface LinkedCheckoutPanelSectionProps {
  groupId: string;
}

const ACTION_ALERT_TITLE: Record<LinkedCheckoutAction, string> = {
  sync: "Sync failed",
  restore: "Restore failed",
  "toggle-auto-sync": "Couldn't update auto-sync",
};

export function LinkedCheckoutPanelSection({ groupId }: LinkedCheckoutPanelSectionProps) {
  const checkout = useLinkedCheckout(groupId);
  if (!checkout.available) return null;
  return <PanelBody checkout={checkout} />;
}

function PanelBody({ checkout }: { checkout: UseLinkedCheckoutResult }) {
  const theme = useTheme();
  const {
    loading,
    fetchError,
    status,
    branch,
    syncedCommitSha,
    repoLinked,
    isAttachedToThisGroup,
    isAttachedElsewhere,
    pendingAction,
    refresh,
    sync,
    restore,
    toggleAutoSync,
  } = checkout;

  const handle = useCallback(
    async (
      action: LinkedCheckoutAction,
      fn: () => Promise<{ ok: boolean; error: string | null }>,
    ) => {
      void haptic.light();
      const outcome = await fn();
      if (!outcome.ok) {
        void haptic.error();
        Alert.alert(ACTION_ALERT_TITLE[action], outcome.error ?? "Unknown error.");
        return;
      }
      void haptic.success();
    },
    [],
  );

  const onSync = useCallback(() => void handle("sync", sync), [handle, sync]);
  const onRestore = useCallback(() => void handle("restore", restore), [handle, restore]);
  const onTogglePause = useCallback(
    () => void handle("toggle-auto-sync", toggleAutoSync),
    [handle, toggleAutoSync],
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingRow]}>
        <Spinner size="small" color="mutedForeground" />
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
        <SectionHeader />
        <Text variant="footnote" color="mutedForeground">
          Main worktree is attached to another workspace.
        </Text>
        <ActionRow
          theme={theme}
          pendingAction={pendingAction}
          autoSyncEnabled={status?.autoSyncEnabled ?? false}
          isAttachedToThisGroup={false}
          onSync={onSync}
          onTogglePause={onTogglePause}
          onRestore={onRestore}
        />
      </View>
    );
  }

  const subtitle = isAttachedToThisGroup && branch
    ? `Main worktree following ${branch}${
        syncedCommitSha ? ` at ${syncedCommitSha.slice(0, 7)}` : ""
      }${status?.autoSyncEnabled ? "" : " (auto-sync paused)"}`
    : "Sync this workspace into your main worktree.";

  return (
    <View style={styles.container}>
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
        autoSyncEnabled={status?.autoSyncEnabled ?? false}
        isAttachedToThisGroup={isAttachedToThisGroup}
        onSync={onSync}
        onTogglePause={onTogglePause}
        onRestore={onRestore}
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
  autoSyncEnabled: boolean;
  isAttachedToThisGroup: boolean;
  onSync: () => void;
  onTogglePause: () => void;
  onRestore: () => void;
}

function ActionRow({
  theme,
  pendingAction,
  autoSyncEnabled,
  isAttachedToThisGroup,
  onSync,
  onTogglePause,
  onRestore,
}: ActionRowProps) {
  const busy = pendingAction !== null;
  return (
    <View style={[styles.actionRow, { gap: theme.spacing.sm }]}>
      <ActionButton
        theme={theme}
        label="Sync"
        symbol="arrow.triangle.2.circlepath"
        accent={isAttachedToThisGroup}
        loading={pendingAction === "sync"}
        disabled={busy}
        onPress={onSync}
      />
      {isAttachedToThisGroup ? (
        <>
          <ActionButton
            theme={theme}
            label={autoSyncEnabled ? "Pause" : "Resume"}
            symbol={autoSyncEnabled ? "pause.fill" : "play.fill"}
            loading={pendingAction === "toggle-auto-sync"}
            disabled={busy}
            onPress={onTogglePause}
          />
          <ActionButton
            theme={theme}
            label="Restore"
            symbol="arrow.uturn.backward"
            loading={pendingAction === "restore"}
            disabled={busy}
            onPress={onRestore}
          />
        </>
      ) : null}
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
  onPress: () => void;
}

function ActionButton({
  theme,
  label,
  symbol,
  loading,
  disabled,
  accent = false,
  onPress,
}: ActionButtonProps) {
  const bg = accent ? theme.colors.accentMuted : theme.colors.surfaceElevated;
  const fg = accent ? "accent" : "foreground";
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
          backgroundColor: bg,
          borderRadius: theme.radius.md,
          opacity: disabled && !loading ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      {loading ? (
        <Spinner size="small" color={fg} />
      ) : (
        <SymbolView
          name={symbol}
          size={16}
          tintColor={theme.colors[fg]}
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
    marginTop: 6,
  },
  actionButton: {
    flex: 1,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionIcon: {
    width: 16,
    height: 16,
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
