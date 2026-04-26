import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { RETRY_SESSION_CONNECTION_MUTATION } from "@trace/client-core";
import { Button, Text } from "@/components/design-system";
import { useAppForegroundStatus } from "@/hooks/useAppForegroundStatus";
import { useNowTicker } from "@/hooks/useNowTicker";
import { shouldShowSessionConnectionLost } from "@/lib/connectivityVisibility";
import { alpha, useTheme } from "@/theme";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";

interface ConnectionLostBannerProps {
  sessionId: string;
  /** Optional human-friendly reason from the session's connection.lastError. */
  reason?: string | null;
}

/**
 * Dim banner shown inside the stream when the session's runtime reports a
 * disconnected state. The Retry button fires `retrySessionConnection`; the
 * service layer will emit a connection event that re-hydrates state.
 */
export function ConnectionLostBanner({ sessionId, reason }: ConnectionLostBannerProps) {
  const theme = useTheme();
  const { appActive, foregroundedAt } = useAppForegroundStatus();
  const tickEnabled =
    appActive &&
    !shouldShowSessionConnectionLost({
      appActive,
      foregroundedAt,
      now: Date.now(),
    });
  const now = useNowTicker(tickEnabled);
  const [pending, setPending] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleRetry() {
    if (pending) return;
    setPending(true);
    void haptic.light();
    await getClient()
      .mutation(RETRY_SESSION_CONNECTION_MUTATION, { sessionId })
      .toPromise();
    if (mountedRef.current) setPending(false);
  }

  if (!shouldShowSessionConnectionLost({ appActive, foregroundedAt, now })) {
    return null;
  }

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: alpha(theme.colors.destructive, 0.1),
          borderColor: alpha(theme.colors.destructive, 0.3),
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
          gap: theme.spacing.sm,
        },
      ]}
    >
      <SymbolView
        name="wifi.slash"
        size={16}
        tintColor={theme.colors.destructive}
        resizeMode="scaleAspectFit"
        style={styles.icon}
      />
      <View style={styles.text}>
        <Text variant="footnote" style={{ color: theme.colors.foreground, fontWeight: "600" }}>
          Connection lost
        </Text>
        {reason ? (
          <Text variant="caption1" color="mutedForeground" numberOfLines={2}>
            {reason}
          </Text>
        ) : null}
      </View>
      <Button
        title="Retry"
        variant="secondary"
        size="sm"
        onPress={() => void handleRetry()}
        disabled={pending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 16, height: 16 },
  text: { flex: 1, gap: 2 },
});
