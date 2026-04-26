import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
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
import { alpha, useTheme } from "@/theme";
import { useConnectionStore } from "@/stores/connection";

const RECONNECTING_DELAY_MS = 10_000;

export function AppConnectivityBanner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
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
            reconnecting ? pulseStyle : null,
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
