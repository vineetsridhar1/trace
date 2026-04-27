import { StyleSheet, View } from "react-native";
import type { AgentStatus } from "@trace/gql";
import { Button, EmptyState, Spinner, Text } from "@/components/design-system";
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
export function SessionStreamEmpty(_props: { agentStatus?: AgentStatus | null }) {
  return (
    <View style={styles.emptyState}>
      <EmptyState
        icon="ellipsis.bubble"
        title="Waiting for agent to start…"
        subtitle="Events will appear here as soon as the session begins."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
