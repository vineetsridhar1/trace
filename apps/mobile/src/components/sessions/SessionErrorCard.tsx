import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { RETRY_SESSION_CONNECTION_MUTATION, useEntityField } from "@trace/client-core";
import { Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { userFacingError } from "@/lib/requestError";
import { getClient } from "@/lib/urql";
import { alpha, useTheme } from "@/theme";

interface SessionErrorCardProps {
  sessionId: string;
}

/**
 * Non-blocking error card surfaced above the composer (or below the pending-
 * input bar) when a session has a recent connection error but is not fully
 * disconnected — the in-stream `ConnectionLostBanner` +
 * `ComposerConnectionNotice` already cover the disconnected case.
 *
 * Tap the message to dismiss locally (persists until a new error string
 * arrives or the screen remounts). A Retry button fires
 * `retrySessionConnection` when `connection.canRetry === true`.
 */
export function SessionErrorCard({ sessionId }: SessionErrorCardProps) {
  const theme = useTheme();
  const connection = useEntityField("sessions", sessionId, "connection");
  const lastError = connection?.lastError ?? null;
  const canRetry = connection?.canRetry === true;
  const state = connection?.state;

  const [dismissed, setDismissed] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const retryErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryErrorTimeoutRef.current) clearTimeout(retryErrorTimeoutRef.current);
    };
  }, []);

  // Reset local dismiss when a new error string arrives.
  useEffect(() => {
    if (dismissed && dismissed !== lastError) setDismissed(null);
  }, [dismissed, lastError]);

  if (!lastError) return null;
  if (state === "disconnected") return null;
  if (dismissed === lastError) return null;

  async function handleRetry() {
    if (pending || !canRetry) return;
    setPending(true);
    void haptic.light();
    const result = await getClient()
      .mutation(RETRY_SESSION_CONNECTION_MUTATION, { sessionId })
      .toPromise();
    if (result.error) {
      void haptic.error();
      setRetryError(userFacingError(result.error, "Retry failed. Try again shortly."));
      if (retryErrorTimeoutRef.current) clearTimeout(retryErrorTimeoutRef.current);
      retryErrorTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) setRetryError(null);
      }, 3000);
      console.warn("[retrySessionConnection] failed", result.error);
    }
    if (mountedRef.current) setPending(false);
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: alpha(theme.colors.destructive, 0.1),
          borderColor: alpha(theme.colors.destructive, 0.25),
          borderRadius: theme.radius.md,
          marginHorizontal: theme.spacing.md,
          marginBottom: theme.spacing.xs,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
          gap: theme.spacing.sm,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss error"
        onPress={() => setDismissed(lastError)}
        style={styles.dismissRegion}
      >
        <SymbolView
          name="exclamationmark.triangle"
          size={16}
          tintColor={theme.colors.destructive}
          resizeMode="scaleAspectFit"
          style={styles.icon}
        />
        <View style={styles.body}>
          <Text
            variant="caption1"
            style={{ color: theme.colors.foreground, fontWeight: "600" }}
            numberOfLines={1}
          >
            Something went wrong
          </Text>
          <Text variant="caption1" color="mutedForeground" numberOfLines={2}>
            {retryError ?? lastError}
          </Text>
        </View>
      </Pressable>
      {canRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry connection"
          disabled={pending}
          onPress={() => void handleRetry()}
          style={({ pressed }) => [
            styles.retry,
            {
              borderColor: alpha(theme.colors.foreground, 0.16),
              opacity: pending ? 0.5 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text variant="caption1" style={{ color: theme.colors.foreground, fontWeight: "600" }}>
            Retry
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  dismissRegion: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  icon: { width: 16, height: 16 },
  body: { flex: 1, gap: 2 },
  retry: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
