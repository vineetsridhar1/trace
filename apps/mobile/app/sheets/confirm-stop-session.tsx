import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { DISMISS_SESSION_MUTATION } from "@trace/client-core";
import { Button, Sheet, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { useTheme } from "@/theme";

/**
 * Confirmation sheet for stopping an active session. V1 dispatches
 * `dismissSession` (not `terminateSession`) to match web's
 * `SessionDetailView.handleStop` behavior — dismiss is the user-initiated
 * "stop what you're doing" action in the current server model.
 */
export default function ConfirmStopSessionSheet() {
  const theme = useTheme();
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  const handleStop = useCallback(async () => {
    if (!sessionId) {
      router.back();
      return;
    }
    void haptic.heavy();
    router.back();
    const result = await getClient()
      .mutation(DISMISS_SESSION_MUTATION, { id: sessionId })
      .toPromise();
    if (result.error) {
      void haptic.error();
      console.warn("[dismissSession] failed", result.error);
    }
  }, [router, sessionId]);

  return (
    <Sheet detents={["small"]}>
      <View style={[styles.container, { gap: theme.spacing.md }]}>
        <Text variant="title2" style={{ fontWeight: "600" }}>
          Stop this session?
        </Text>
        <Text variant="body" color="mutedForeground">
          The agent will stop working. You can't resume after stopping.
        </Text>
        <View style={[styles.actions, { gap: theme.spacing.sm }]}>
          <Button
            title="Stop"
            variant="destructive"
            size="lg"
            haptic="heavy"
            onPress={() => void handleStop()}
          />
          <Button title="Cancel" variant="ghost" size="lg" onPress={handleCancel} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  actions: { marginTop: "auto" },
});
