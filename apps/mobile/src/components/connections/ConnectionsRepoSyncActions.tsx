import { useCallback } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { Spinner, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { useTheme, type Theme } from "@/theme";
import type { ConnectionLinkedCheckout } from "@/hooks/useConnections";
import {
  useConnectionSyncActions,
  type ConnectionSyncAction,
} from "@/hooks/useConnectionSyncActions";

const ALERT_TITLE: Record<ConnectionSyncAction, string> = {
  sync: "Sync failed",
  commit: "Commit failed",
  restore: "Restore failed",
  "toggle-auto-sync": "Couldn't update auto-sync",
};

export function ConnectionsRepoSyncActions({
  checkout,
  onChanged,
}: {
  checkout: ConnectionLinkedCheckout;
  onChanged: () => Promise<void>;
}) {
  const theme = useTheme();
  const { status, pendingAction, sync, restore, toggleAutoSync } = useConnectionSyncActions({
    checkout,
    onChanged,
  });
  const busy = pendingAction !== null;

  const handle = useCallback(
    async (
      action: ConnectionSyncAction,
      fn: () => Promise<{ ok: boolean; error: string | null }>,
    ) => {
      void haptic.light();
      const outcome = await fn();
      if (!outcome.ok) {
        void haptic.error();
        Alert.alert(ALERT_TITLE[action], outcome.error ?? "Unknown error.");
        return;
      }
      void haptic.success();
    },
    [],
  );

  return (
    <View style={[styles.row, { gap: theme.spacing.sm }]}>
      <ActionButton
        theme={theme}
        label="Sync"
        symbol="arrow.triangle.2.circlepath"
        loading={pendingAction === "sync"}
        disabled={busy}
        onPress={() => void handle("sync", sync)}
      />
      <ActionButton
        theme={theme}
        label={status.autoSyncEnabled ? "Pause" : "Resume"}
        symbol={status.autoSyncEnabled ? "pause.fill" : "play.fill"}
        loading={pendingAction === "toggle-auto-sync"}
        disabled={busy}
        onPress={() => void handle("toggle-auto-sync", toggleAutoSync)}
      />
      <ActionButton
        theme={theme}
        label="Restore"
        symbol="arrow.uturn.backward"
        loading={pendingAction === "restore"}
        disabled={busy}
        onPress={() => void handle("restore", restore)}
      />
    </View>
  );
}

function ActionButton({
  theme,
  label,
  symbol,
  loading,
  disabled,
  onPress,
}: {
  theme: Theme;
  label: string;
  symbol: SFSymbol;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.colors.surfaceElevated,
          borderRadius: theme.radius.md,
          opacity: disabled && !loading ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      {loading ? (
        <Spinner size="small" color="foreground" />
      ) : (
        <SymbolView
          name={symbol}
          size={16}
          tintColor={theme.colors.foreground}
          resizeMode="scaleAspectFit"
          style={styles.icon}
        />
      )}
      <Text variant="footnote" color="foreground">
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 8,
  },
  button: {
    flexGrow: 1,
    minWidth: 96,
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  icon: {
    width: 16,
    height: 16,
  },
});
