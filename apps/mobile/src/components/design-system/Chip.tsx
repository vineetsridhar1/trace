import { useEffect, type ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
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
  const palette = variantPalette(theme, variant);
  const opacity = useSharedValue(1);

  useEffect(() => {
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
  }, [variant, opacity, theme.motion.durations.fast]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
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
