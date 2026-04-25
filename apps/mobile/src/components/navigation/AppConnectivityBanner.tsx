import { useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Glass, Text } from "@/components/design-system";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { alpha, useTheme } from "@/theme";
import { useConnectionStore } from "@/stores/connection";

const RECONNECTING_DELAY_MS = 10_000;

export function AppConnectivityBanner() {
  const theme = useTheme();
  const { isConnected } = useNetworkStatus();
  const wsConnected = useConnectionStore((s) => s.connected);
  const disconnectedAt = useConnectionStore((s) => s.disconnectedAt);
  const hasConnectedBefore = useConnectionStore((s) => s.hasConnectedBefore);
  const [now, setNow] = useState(Date.now());
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!disconnectedAt || wsConnected || !hasConnectedBefore || !isConnected) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [disconnectedAt, hasConnectedBefore, isConnected, wsConnected]);

  const reconnecting =
    isConnected &&
    hasConnectedBefore &&
    !wsConnected &&
    disconnectedAt !== null &&
    now - disconnectedAt >= RECONNECTING_DELAY_MS;
  const offline = !isConnected;

  useEffect(() => {
    if (!reconnecting) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withTiming(0.45, { duration: theme.motion.durations.slow, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse, reconnecting, theme.motion.durations.slow]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const banner = useMemo(() => {
    if (offline) {
      return {
        icon: "wifi.slash" as const,
        title: "No internet",
        detail: "Some actions will retry when your connection comes back.",
        borderColor: alpha(theme.colors.warning, 0.35),
      };
    }
    if (reconnecting) {
      return {
        icon: "arrow.triangle.2.circlepath" as const,
        title: "Reconnecting…",
        detail: "Live updates are paused while the app reconnects.",
        borderColor: alpha(theme.colors.accent, 0.35),
      };
    }
    return null;
  }, [offline, reconnecting, theme.colors.accent, theme.colors.warning]);

  if (!banner) return null;

  return (
    <Glass preset="pinnedBar" style={[styles.banner, { borderColor: banner.borderColor }]}>
      <Animated.View style={reconnecting ? pulseStyle : null}>
        <SymbolView
          name={banner.icon}
          size={15}
          tintColor={theme.colors.foreground}
          resizeMode="scaleAspectFit"
        />
      </Animated.View>
      <Text variant="caption1" style={styles.title}>
        {banner.title}
      </Text>
      <Text variant="caption2" color="mutedForeground" numberOfLines={1} style={styles.detail}>
        {banner.detail}
      </Text>
    </Glass>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: { fontWeight: "600" },
  detail: { flex: 1 },
});
