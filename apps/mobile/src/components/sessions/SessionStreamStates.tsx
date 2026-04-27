import { StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import type { AgentStatus } from "@trace/gql";
import { Button, Spinner, Text } from "@/components/design-system";
import { useTheme } from "@/theme";

/** Solid stream surface shown while initial events are loading. */
export function SessionStreamSkeleton() {
  return (
    <View style={styles.loadingState}>
      <Spinner size="small" color="mutedForeground" />
    </View>
  );
}

/** Retry-capable error state when the initial events query fails. */
export function SessionStreamError({ error, onRetry }: { error: string; onRetry: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.errorState, { paddingHorizontal: theme.spacing.lg }]}>
      <Text variant="body" color="mutedForeground" align="center">
        Couldn't load session events.
      </Text>
      <Text variant="footnote" color="mutedForeground" align="center">
        {error}
      </Text>
      <Button title="Retry" variant="secondary" size="sm" onPress={onRetry} />
    </View>
  );
}

/** Solid stream surface shown once hydration completes but no events exist. */
export function SessionStreamEmpty({ agentStatus }: { agentStatus?: AgentStatus | null }) {
  const theme = useTheme();
  const notStarted = agentStatus === "not_started";

  return (
    <View style={[styles.emptyState, { paddingHorizontal: theme.spacing.lg }]}>
      <SymbolView
        name={notStarted ? "sparkles" : "hourglass"}
        size={28}
        tintColor={theme.colors.mutedForeground}
      />
      <Text variant="headline" color="foreground" align="center">
        {notStarted ? "Ready when you are" : "Waiting for the agent…"}
      </Text>
      <Text variant="footnote" color="mutedForeground" align="center">
        {notStarted
          ? "Type a prompt below to kick off the session."
          : "The first response should arrive shortly."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#000",
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  errorState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
});
