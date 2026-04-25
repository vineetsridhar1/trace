import { useEffect } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { EmptyState, Spinner } from "@/components/design-system";
import { useLatestSessionIdForGroup } from "@/hooks/useChannelSessionGroups";
import { useEnsureSessionGroupDetail } from "@/hooks/useSessionGroupDetail";
import { useTheme } from "@/theme";

export default function SessionGroupRedirectScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { loading, error } = useEnsureSessionGroupDetail(groupId);
  const latestSessionId = useLatestSessionIdForGroup(groupId);

  useEffect(() => {
    if (!groupId || !latestSessionId) return;
    router.replace(`/sessions/${groupId}/${latestSessionId}`);
  }, [groupId, latestSessionId, router]);

  return (
    <>
      <Stack.Screen options={{ title: "Session Group" }} />
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        {loading || latestSessionId ? (
          <Spinner size="small" color="mutedForeground" />
        ) : error ? (
          <EmptyState
            icon="exclamationmark.triangle"
            title="Couldn't load workspace"
            subtitle={error}
          />
        ) : (
          <EmptyState
            icon="bolt.horizontal"
            title="No sessions in this group"
            subtitle="This workspace has not started a session yet."
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
});
