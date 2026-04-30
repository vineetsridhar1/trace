import { StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Glass, Spinner, Text } from "@/components/design-system";
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
    : connectionState === "provisioning"
      ? "Provisioning cloud runtime"
      : connectionState === "connecting"
        ? "Connecting to cloud runtime"
        : "Booting cloud runtime";

  return (
    <Glass
      preset="input"
      interactive
      style={[
        styles.notice,
        {
          borderColor: failed ? alpha(theme.colors.destructive, 0.3) : theme.colors.border,
          padding: theme.spacing.lg,
        },
      ]}
    >
      <View style={styles.noticeRow}>
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: failed
                ? alpha(theme.colors.destructive, 0.16)
                : alpha(theme.colors.foreground, 0.08),
            },
          ]}
        >
          <SymbolView
            name={failed ? "exclamationmark.triangle" : "cloud"}
            size={16}
            tintColor={failed ? theme.colors.destructive : theme.colors.mutedForeground}
          />
        </View>
        <View style={styles.noticeCopy}>
          <View style={styles.titleRow}>
            {failed ? null : <Spinner size="small" color="mutedForeground" />}
            <Text variant="subheadline" color="foreground">
              {label}
            </Text>
          </View>
          <Text variant="footnote" color="mutedForeground" style={styles.noticeBody}>
            {failed
              ? "Trace could not finish starting the cloud runtime."
              : "Your message is queued and will run as soon as the container is ready."}
          </Text>
        </View>
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    gap: 12,
  },
  noticeRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    width: "90%",
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
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
