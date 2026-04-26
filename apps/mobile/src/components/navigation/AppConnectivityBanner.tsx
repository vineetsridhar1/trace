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
import { useAppForegroundStatus } from "@/hooks/useAppForegroundStatus";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useNowTicker } from "@/hooks/useNowTicker";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  getAppConnectivityBannerKind,
  shouldTickConnectivityClock,
} from "@/lib/connectivityVisibility";
import { alpha, useTheme } from "@/theme";
import { useConnectionStore } from "@/stores/connection";

export function AppConnectivityBanner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isConnected, isResolved } = useNetworkStatus();
  const { appActive, foregroundedAt } = useAppForegroundStatus();
  const reducedMotion = useReducedMotion();
  const wsConnected = useConnectionStore((s) => s.connected);
  const disconnectedAt = useConnectionStore((s) => s.disconnectedAt);
  const hasConnectedBefore = useConnectionStore((s) => s.hasConnectedBefore);
  const [networkDisconnectedAt, setNetworkDisconnectedAt] = useState<number | null>(null);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!appActive || !isResolved || isConnected) {
      setNetworkDisconnectedAt(null);
      return;
    }
    setNetworkDisconnectedAt((current) => current ?? Date.now());
  }, [appActive, isConnected, isResolved]);

  const initialNow = Date.now();
  const tickEnabled = shouldTickConnectivityClock({
    appActive,
    disconnectedAt,
    foregroundedAt,
    hasConnectedBefore,
    isConnected,
    isResolved,
    networkDisconnectedAt,
    now: initialNow,
    wsConnected,
  });
  const now = useNowTicker(tickEnabled);

  const bannerKind = getAppConnectivityBannerKind({
    appActive,
    disconnectedAt,
    foregroundedAt,
    hasConnectedBefore,
    isConnected,
    isResolved,
    networkDisconnectedAt,
    now,
    wsConnected,
  });
  const reconnecting = bannerKind === "reconnecting";

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
    if (bannerKind === "offline") {
      return {
        icon: "wifi.slash" as const,
        title: "No internet",
        detail: "Actions will retry when you're back online.",
        borderColor: alpha(theme.colors.warning, 0.35),
        tint: alpha(theme.colors.warning, 0.14),
      };
    }
    if (bannerKind === "reconnecting") {
      return {
        icon: "arrow.triangle.2.circlepath" as const,
        title: "Reconnecting…",
        detail: "Live updates are paused while the session stream recovers.",
        borderColor: alpha(theme.colors.accent, 0.35),
        tint: alpha(theme.colors.accent, 0.14),
      };
    }
    return null;
  }, [bannerKind, theme.colors.accent, theme.colors.warning]);

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
