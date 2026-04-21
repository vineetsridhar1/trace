import { StyleSheet, View } from "react-native";
import { Button, Skeleton, Text } from "@/components/design-system";
import { useTheme } from "@/theme";

/** Skeleton rows shown while the initial events query is in flight. */
export function SessionStreamSkeleton() {
  const theme = useTheme();
  return (
    <View style={[styles.placeholder, { paddingHorizontal: theme.spacing.lg }]}>
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton width="35%" height={12} />
          <Skeleton width="80%" height={12} />
          <Skeleton width="55%" height={12} />
        </View>
      ))}
    </View>
  );
}

/** Retry-capable error state when the initial events query fails. */
export function SessionStreamError({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
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

/** Placeholder shown once hydration completes but no events have arrived. */
export function SessionStreamEmpty() {
  const theme = useTheme();
  return (
    <View style={[styles.emptyState, { paddingHorizontal: theme.spacing.lg }]}>
      <Text variant="body" color="mutedForeground" align="center">
        Waiting for agent to start…
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { flex: 1, paddingTop: 24, gap: 18 },
  skeletonRow: { gap: 6 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
});
