import { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { useRouter } from "expo-router";
import {
  RETARGET_BRIDGE_TUNNEL_MUTATION,
  START_BRIDGE_TUNNEL_MUTATION,
  STOP_BRIDGE_TUNNEL_MUTATION,
} from "@trace/client-core";
import { Spinner, Text } from "@/components/design-system";
import type { ConnectionBridge, ConnectionRepoEntry, ConnectionTunnelSlot } from "@/hooks/useConnections";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { useTheme, type Theme } from "@/theme";

type PreviewAction = "start" | "stop" | `retarget:${string}`;

type BridgeTunnelMutationResult = {
  ok: boolean;
  error?: string | null;
};

export function ConnectionsRepoPreviewActions({
  bridge,
  entry,
  onChanged,
}: {
  bridge: ConnectionBridge["bridge"];
  entry: ConnectionRepoEntry;
  onChanged: () => Promise<void>;
}) {
  const theme = useTheme();
  const router = useRouter();
  const preview = entry.webPreview ?? null;
  const runtimeInstanceId = preview?.runtimeInstanceId ?? bridge.instanceId;
  const repoPort = entry.repo.webPreviewPort ?? null;
  const [pendingAction, setPendingAction] = useState<PreviewAction | null>(null);
  const retargetSlots = (bridge.tunnelSlots ?? []).filter(
    (slot) =>
      slot.mode === "trace_managed" &&
      slot.provider === "ngrok" &&
      (repoPort == null || slot.targetPort !== repoPort),
  );

  async function runMutation(
    action: PreviewAction,
    execute: () => Promise<BridgeTunnelMutationResult>,
    successHaptic = true,
  ) {
    setPendingAction(action);
    try {
      const result = await execute();
      if (!result.ok) {
        void haptic.error();
        Alert.alert("Tunnel action failed", result.error ?? "Unknown error.");
        return;
      }
      if (successHaptic) void haptic.success();
      await onChanged();
    } finally {
      setPendingAction(null);
    }
  }

  function retarget(slot: ConnectionTunnelSlot) {
    if (!repoPort) return;
    Alert.alert(
      "Retarget tunnel",
      `Point ${slot.label} at port ${repoPort} for ${entry.repo.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Retarget",
          onPress: () => {
            void runMutation(`retarget:${slot.id}`, async () => {
              const result = await getClient()
                .mutation<{ retargetBridgeTunnel?: BridgeTunnelMutationResult }>(
                  RETARGET_BRIDGE_TUNNEL_MUTATION,
                  {
                    runtimeInstanceId,
                    slotId: slot.id,
                    targetPort: repoPort,
                  },
                )
                .toPromise();
              if (result.error) {
                return { ok: false, error: result.error.message };
              }
              return result.data?.retargetBridgeTunnel ?? {
                ok: false,
                error: "Tunnel retarget failed.",
              };
            });
          },
        },
      ],
    );
  }

  const canOpenPreview = !!preview?.available && !!preview.sessionGroup?.id;
  const canManage = preview?.canManageTunnel === true && !!runtimeInstanceId;
  const showStart =
    canManage &&
    preview?.slot?.mode === "trace_managed" &&
    preview.slot.provider === "ngrok" &&
    preview.slot.state !== "running";
  const showStop =
    canManage &&
    preview?.slot?.mode === "trace_managed" &&
    preview.slot.provider === "ngrok" &&
    preview.slot.state === "running";
  const showRetarget =
    canManage &&
    repoPort != null &&
    (preview?.reason === "no_matching_tunnel" || preview?.reason === "tunnel_inactive") &&
    retargetSlots.length > 0;

  if (!canOpenPreview && !showStart && !showStop && !showRetarget) {
    return null;
  }

  return (
    <View style={[styles.row, { gap: theme.spacing.sm }]}>
      {canOpenPreview ? (
        <ActionButton
          theme={theme}
          label="Open Preview"
          symbol="safari"
          loading={false}
          disabled={pendingAction !== null}
          onPress={() => {
            void haptic.light();
            router.push(`/sessions/${preview!.sessionGroup!.id}/preview`);
          }}
        />
      ) : null}
      {showStart ? (
        <ActionButton
          theme={theme}
          label="Start Tunnel"
          symbol="play.fill"
          loading={pendingAction === "start"}
          disabled={pendingAction !== null}
          onPress={() =>
            void runMutation("start", async () => {
              const result = await getClient()
                .mutation<{ startBridgeTunnel?: BridgeTunnelMutationResult }>(
                  START_BRIDGE_TUNNEL_MUTATION,
                  {
                    runtimeInstanceId,
                    slotId: preview!.slot!.id,
                  },
                )
                .toPromise();
              if (result.error) return { ok: false, error: result.error.message };
              return result.data?.startBridgeTunnel ?? { ok: false, error: "Tunnel start failed." };
            })
          }
        />
      ) : null}
      {showStop ? (
        <ActionButton
          theme={theme}
          label="Stop Tunnel"
          symbol="stop.fill"
          loading={pendingAction === "stop"}
          disabled={pendingAction !== null}
          onPress={() =>
            void runMutation("stop", async () => {
              const result = await getClient()
                .mutation<{ stopBridgeTunnel?: BridgeTunnelMutationResult }>(
                  STOP_BRIDGE_TUNNEL_MUTATION,
                  {
                    runtimeInstanceId,
                    slotId: preview!.slot!.id,
                  },
                )
                .toPromise();
              if (result.error) return { ok: false, error: result.error.message };
              return result.data?.stopBridgeTunnel ?? { ok: false, error: "Tunnel stop failed." };
            })
          }
        />
      ) : null}
      {showRetarget
        ? retargetSlots.map((slot) => (
            <ActionButton
              key={slot.id}
              theme={theme}
              label={`Use ${slot.label}`}
              symbol="arrow.left.arrow.right"
              loading={pendingAction === `retarget:${slot.id}`}
              disabled={pendingAction !== null}
              onPress={() => retarget(slot)}
            />
          ))
        : null}
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
    minWidth: 132,
    height: 38,
    paddingHorizontal: 12,
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
