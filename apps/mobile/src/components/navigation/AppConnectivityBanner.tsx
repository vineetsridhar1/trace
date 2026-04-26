import { useEffect, useMemo, useState } from "react";
import { AppState, StyleSheet, View, type AppStateStatus } from "react-native";
import { SymbolView } from "expo-symbols";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glass, Text } from "@/components/design-system";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { alpha, useTheme } from "@/theme";
import { useConnectionStore } from "@/stores/connection";

const RECONNECTING_DELAY_MS = 10_000;
const OFFLINE_DELAY_MS = 3_000;
const FOREGROUND_GRACE_MS = 4_000;

export function AppConnectivityBanner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isConnected, isResolved } = useNetworkStatus();
  const reducedMotion = useReducedMotion();
  const wsConnected = useConnectionStore((s) => s.connected);
  const disconnectedAt = useConnectionStore((s) => s.disconnectedAt);
  const hasConnectedBefore = useConnectionStore((s) => s.hasConnectedBefore);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [foregroundedAt, setForegroundedAt] = useState(Date.now());
  const [networkDisconnectedAt, setNetworkDisconnectedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const pulse = useSharedValue(1);
  const appActive = appState === "active";

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      setAppState(nextState);
      if (nextState === "active") {
        const timestamp = Date.now();
        setForegroundedAt(timestamp);
        setNow(timestamp);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!appActive || !isResolved || isConnected) {
      setNetworkDisconnectedAt(null);
      return;
    }
    setNetworkDisconnectedAt((current) => current ?? Date.now());
  }, [appActive, isConnected, isResolved]);

  useEffect(() => {
    if (!appActive) return;
    const inForegroundGrace = now - foregroundedAt < FOREGROUND_GRACE_MS;
    const waitingForOfflineDelay =
      isResolved && !isConnected && networkDisconnectedAt !== null;
    const waitingForReconnectDelay =
      isConnected && hasConnectedBefore && !wsConnected && disconnectedAt !== null;
    if (!inForegroundGrace && !waitingForOfflineDelay && !waitingForReconnectDelay) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [
    appActive,
    disconnectedAt,
    foregroundedAt,
    hasConnectedBefore,
    isConnected,
    isResolved,
    networkDisconnectedAt,
    now,
    wsConnected,
  ]);

  const foregroundGraceElapsed = appActive && now - foregroundedAt >= FOREGROUND_GRACE_MS;
  const reconnecting =
    foregroundGraceElapsed &&
    isConnected &&
    hasConnectedBefore &&
    !wsConnected &&
    disconnectedAt !== null &&
    now - disconnectedAt >= RECONNECTING_DELAY_MS;
  const offline =
    foregroundGraceElapsed &&
    isResolved &&
    !isConnected &&
    networkDisconnectedAt !== null &&
    now - networkDisconnectedAt >= OFFLINE_DELAY_MS;

  useEffect(() => {
    if (!reconnecting || reducedMotion) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withTiming(0.45, { duration: theme.motion.durations.slow, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse, reconnecting, reducedMotion, theme.motion.durations.slow]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const banner = useMemo(() => {
    if (offline) {
      return {
        icon: "wifi.slash" as const,
        title: "No internet",
        detail: "Actions will retry when you're back online.",
        borderColor: alpha(theme.colors.warning, 0.35),
        tint: alpha(theme.colors.warning, 0.14),
      };
    }
    if (reconnecting) {
      return {
        icon: "arrow.triangle.2.circlepath" as const,
        title: "Reconnecting…",
        detail: "Live updates are paused while the session stream recovers.",
        borderColor: alpha(theme.colors.accent, 0.35),
        tint: alpha(theme.colors.accent, 0.14),
      };
    }
    return null;
  }, [offline, reconnecting, theme.colors.accent, theme.colors.warning]);

  if (!banner) return null;

  return (
    <View pointerEvents="box-none" style={styles.host}>
      <Glass
        preset="pinnedBar"
        tint={alpha(theme.colors.surfaceElevated, 0.92)}
        style={[
          styles.banner,
          {
            marginTop: insets.top + 8,
            borderColor: banner.borderColor,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.iconChip,
            { backgroundColor: banner.tint, borderColor: banner.borderColor },
            reconnecting && !reducedMotion ? pulseStyle : null,
          ]}
        >
          <SymbolView
            name={banner.icon}
            size={13}
            tintColor={theme.colors.foreground}
            resizeMode="scaleAspectFit"
          />
        </Animated.View>
        <View style={styles.textBlock}>
          <Text variant="caption1" style={styles.title} numberOfLines={1}>
            {banner.title}
          </Text>
          <Text variant="caption2" color="mutedForeground" numberOfLines={1}>
            {banner.detail}
          </Text>
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    alignItems: "center",
  },
  banner: {
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 50,
    width: "auto",
    maxWidth: 460,
  },
  iconChip: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  textBlock: {
    flexShrink: 1,
    gap: 1,
  },
  title: { fontWeight: "600" },
});
