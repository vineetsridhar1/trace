import { useEffect, useRef, type ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { alpha, useTheme, type Theme } from "@/theme";
import { Text } from "./Text";

export type ChipVariant =
  | "inProgress"
  | "needsInput"
  | "done"
  | "failed"
  | "merged"
  | "inReview";

export interface ChipProps {
  label: string;
  variant: ChipVariant;
  icon?: ReactNode;
  style?: ViewStyle;
}

interface VariantPalette {
  fg: string;
  bg: string;
}

function variantPalette(theme: Theme, variant: ChipVariant): VariantPalette {
  switch (variant) {
    case "inProgress":
      return { fg: theme.colors.statusActive, bg: alpha(theme.colors.statusActive, 0.16) };
    case "needsInput":
      return { fg: theme.colors.statusNeedsInput, bg: alpha(theme.colors.statusNeedsInput, 0.16) };
    case "done":
      return { fg: theme.colors.statusDone, bg: alpha(theme.colors.statusDone, 0.16) };
    case "failed":
      return { fg: theme.colors.statusFailed, bg: alpha(theme.colors.statusFailed, 0.16) };
    case "merged":
      return { fg: theme.colors.statusMerged, bg: alpha(theme.colors.statusMerged, 0.16) };
    case "inReview":
      return { fg: theme.colors.statusInReview, bg: alpha(theme.colors.statusInReview, 0.16) };
  }
}

export function Chip({ label, variant, icon, style }: ChipProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const palette = variantPalette(theme, variant);
  const opacity = useSharedValue(1);
  // Brief scale flash when the variant changes (per ticket 30 §11.4 "status
  // chip on change"). Skip on the very first render so chips don't pop
  // unsolicited when a list mounts.
  const scale = useSharedValue(1);
  const previousVariant = useRef(variant);

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(opacity);
      opacity.value = 1;
      return;
    }
    if (variant !== "inProgress") {
      cancelAnimation(opacity);
      opacity.value = withTiming(1, { duration: theme.motion.durations.fast });
      return;
    }
    opacity.value = withRepeat(
      withTiming(0.55, {
        duration: 900,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [opacity, reducedMotion, theme.motion.durations.fast, variant]);

  useEffect(() => {
    if (previousVariant.current === variant) return;
    previousVariant.current = variant;
    if (reducedMotion) {
      scale.value = 1;
      return;
    }
    scale.value = withSequence(
      withTiming(1.08, { duration: theme.motion.durations.instant }),
      withSpring(1, theme.motion.springs.snap),
    );
  }, [reducedMotion, scale, theme.motion.durations.instant, theme.motion.springs.snap, variant]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: palette.bg,
          borderRadius: theme.radius.full,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.xs,
        },
        animatedStyle,
        style,
      ]}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text variant="caption1" style={{ color: palette.fg, fontWeight: "600" }}>
        {label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  icon: {
    marginRight: 4,
  },
});
