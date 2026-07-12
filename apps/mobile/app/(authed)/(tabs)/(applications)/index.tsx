import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { SessionGroupRow } from "@/components/channels/SessionGroupRow";
import { EmptyState, TraceLoader } from "@/components/design-system";
import { useAppSessionGroups } from "@/hooks/useAppSessionGroups";
import { handleUnauthorized } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";

export default function ApplicationsScreen() {
  const theme = useTheme();
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const { ids, loading, error, refresh } = useAppSessionGroups(activeOrgId);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    void haptic.medium();
    setRefreshing(true);
    const result = await refresh();
    setRefreshing(false);
    if (!result.authorized) await handleUnauthorized();
  }, [refresh]);

  if (loading && ids.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <TraceLoader size="small" color="mutedForeground" />
      </View>
    );
  }

  return (
    <FlashList
      data={ids}
      renderItem={({ item }) => <SessionGroupRow groupId={item} hideAvatar />}
      keyExtractor={(id) => id}
      contentInsetAdjustmentBehavior="automatic"
      onRefresh={handleRefresh}
      refreshing={refreshing}
      ListEmptyComponent={
        <View style={styles.empty}>
          <EmptyState
            icon={error ? "exclamationmark.triangle" : "app"}
            title={error ? "Couldn't load applications" : "No applications yet"}
            subtitle={
              error ? error : "Standalone applications you build in Trace will appear here."
            }
            action={error ? { label: "Retry", onPress: () => void handleRefresh() } : undefined}
          />
        </View>
      }
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    paddingTop: 80,
  },
});
