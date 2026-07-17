import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { ApplicationListRow } from "@/components/applications/ApplicationListRow";
import { Button, Text, TraceLoader } from "@/components/design-system";
import { useAppSessionGroups } from "@/hooks/useAppSessionGroups";
import { handleUnauthorized } from "@/lib/auth";
import { createApplication, createDesign } from "@/lib/createQuickSession";
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
  const handleCreate = useCallback(() => {
    void createApplication();
  }, []);
  const handleCreateDesign = useCallback(() => {
    void createDesign();
  }, []);

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
      renderItem={renderApplication}
      keyExtractor={(id) => id}
      contentInsetAdjustmentBehavior="automatic"
      onRefresh={handleRefresh}
      refreshing={refreshing}
      ItemSeparatorComponent={ApplicationSeparator}
      ListEmptyComponent={
        <ApplicationsEmpty
          error={error}
          onCreate={handleCreate}
          onCreateDesign={handleCreateDesign}
          onRetry={handleRefresh}
        />
      }
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    />
  );
}

function renderApplication({ item }: { item: string }) {
  return <ApplicationListRow groupId={item} />;
}

function ApplicationSeparator() {
  const theme = useTheme();
  return <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />;
}

function ApplicationsEmpty({
  error,
  onCreate,
  onCreateDesign,
  onRetry,
}: {
  error: string | null;
  onCreate: () => void;
  onCreateDesign: () => void;
  onRetry: () => Promise<void>;
}) {
  return (
    <View style={styles.empty}>
      <Text variant="footnote" color={error ? "destructive" : "mutedForeground"} align="center">
        {error ?? "No applications yet"}
      </Text>
      {error ? (
        <Pressable accessibilityRole="button" onPress={() => void onRetry()} style={styles.retry}>
          <Text variant="footnote" color="accent">
            Retry
          </Text>
        </Pressable>
      ) : (
        <>
          <Text variant="caption2" color="dimForeground" align="center">
            Apps you build with Trace will appear here.
          </Text>
          <View style={styles.emptyAction}>
            <Button title="Build an application" size="sm" onPress={onCreate} />
            <Button
              title="Create a design"
              size="sm"
              variant="secondary"
              onPress={onCreateDesign}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    paddingTop: 96,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 32,
  },
  retry: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  emptyAction: {
    alignSelf: "stretch",
    marginTop: 10,
    gap: 8,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 60,
    opacity: 0.55,
  },
});
