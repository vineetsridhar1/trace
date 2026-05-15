import { StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { TraceLoader, Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";

type ConnectionStateSource = {
  state?: string | null;
};

const CLOUD_RUNTIME_BOOTING_STATES = new Set([
  "pending",
  "requested",
  "provisioning",
  "booting",
  "connecting",
]);
const CLOUD_RUNTIME_FAILURE_STATES = new Set(["failed", "timed_out", "deprovision_failed"]);

export function getCloudRuntimeLifecycleState({
  hosting,
  connection,
}: {
  hosting?: string | null;
  connection?: ConnectionStateSource | null;
}): string | null {
  const connectionState = connection?.state;
  if (
    hosting !== "cloud" ||
    !connectionState ||
    connectionState === "connected" ||
    (!CLOUD_RUNTIME_BOOTING_STATES.has(connectionState) &&
      !CLOUD_RUNTIME_FAILURE_STATES.has(connectionState))
  ) {
    return null;
  }
  return connectionState;
}

export function CloudRuntimeNotice({ connectionState }: { connectionState: string }) {
  const theme = useTheme();
  const failed = CLOUD_RUNTIME_FAILURE_STATES.has(connectionState);
  const label = failed
    ? connectionState === "timed_out"
      ? "Cloud runtime timed out"
      : "Cloud runtime failed"
    : connectionState === "requested"
      ? "Cloud recovery requested"
      : connectionState === "provisioning"
        ? "Cloud runtime provisioning"
        : connectionState === "connecting"
          ? "Waiting for cloud bridge"
          : "Starting cloud runtime";
  const body = failed
    ? "Trace could not finish starting the cloud runtime."
    : connectionState === "requested"
      ? "Trace sent the recovery request and is waiting for the provider to report progress."
      : connectionState === "connecting"
        ? "The provider accepted the runtime request. Trace is waiting for the bridge to connect."
        : "Your message is queued while Trace waits for the runtime provider.";
  const toneColor = failed ? theme.colors.destructive : theme.colors.warning;

  return (
    <View
      style={[
        styles.notice,
        {
          borderColor: alpha(toneColor, 0.3),
          backgroundColor: alpha(toneColor, 0.05),
          borderRadius: theme.radius.lg,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: 10,
        },
      ]}
    >
      <View style={styles.noticeRow}>
        <SymbolView
          name={failed ? "exclamationmark.triangle" : "cloud"}
          size={16}
          tintColor={toneColor}
          style={styles.icon}
        />
        <View style={styles.noticeCopy}>
          <View style={styles.titleRow}>
            {failed ? null : <TraceLoader size={12} color="warning" />}
            <Text variant="subheadline" color="foreground">
              {label}
            </Text>
          </View>
          <Text variant="footnote" color="mutedForeground" style={styles.noticeBody}>
            {body}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  noticeRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  icon: { marginTop: 2 },
  noticeCopy: {
    flex: 1,
    gap: 4,
  },
  noticeBody: {
    lineHeight: 18,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
