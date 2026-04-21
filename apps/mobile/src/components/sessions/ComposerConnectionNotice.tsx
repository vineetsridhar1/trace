import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { RETRY_SESSION_CONNECTION_MUTATION } from "@trace/client-core";
import { Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { alpha, useTheme } from "@/theme";

interface ComposerConnectionNoticeProps {
  sessionId: string;
  canRetry: boolean;
}

/**
 * Caption + Retry affordance shown above the composer when the session's
 * connection state is `disconnected`. Separate from the in-stream
 * `ConnectionLostBanner` (ticket 21) — this one lives in the bottom overlay
 * so the message is adjacent to the (disabled) input. When `canRetry` is
 * false the Retry button is disabled and tinted with the destructive color.
 */
export function ComposerConnectionNotice({
  sessionId,
  canRetry,
}: ComposerConnectionNoticeProps) {
  const theme = useTheme();
  const [pending, setPending] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleRetry() {
    if (pending || !canRetry) return;
    setPending(true);
    void haptic.light();
    await getClient()
      .mutation(RETRY_SESSION_CONNECTION_MUTATION, { sessionId })
      .toPromise();
    if (mountedRef.current) setPending(false);
  }

  const retryActive = canRetry && !pending;

  return (
    <View
      style={[
        styles.row,
        {
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.xs,
          gap: theme.spacing.sm,
        },
      ]}
    >
      <Text
        variant="caption1"
        color="mutedForeground"
        style={styles.caption}
        numberOfLines={1}
      >
        Session offline — retry to reconnect
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry connection"
        disabled={!retryActive}
        onPress={() => void handleRetry()}
        style={({ pressed }) => [
          styles.retry,
          {
            borderColor: canRetry
              ? alpha(theme.colors.foreground, 0.16)
              : alpha(theme.colors.destructive, 0.3),
            backgroundColor: canRetry
              ? "transparent"
              : alpha(theme.colors.destructive, 0.08),
            opacity: retryActive ? (pressed ? 0.7 : 1) : 0.5,
          },
        ]}
      >
        <Text
          variant="caption1"
          style={{
            color: canRetry ? theme.colors.foreground : theme.colors.destructive,
            fontWeight: "600",
          }}
        >
          Retry
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  caption: { flex: 1 },
  retry: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
