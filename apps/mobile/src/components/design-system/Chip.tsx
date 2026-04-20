import { useEffect, type ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme, type Theme } from "@/theme";
import { Text } from "./Text";

export type ChipVariant =
  | "active"
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
    case "active":
      return { fg: theme.colors.statusActive, bg: withAlpha(theme.colors.statusActive, 0.16) };
    case "needsInput":
      return { fg: theme.colors.statusNeedsInput, bg: withAlpha(theme.colors.statusNeedsInput, 0.16) };
    case "done":
      return { fg: theme.colors.statusDone, bg: withAlpha(theme.colors.statusDone, 0.16) };
    case "failed":
      return { fg: theme.colors.statusFailed, bg: withAlpha(theme.colors.statusFailed, 0.16) };
    case "merged":
      return { fg: theme.colors.statusMerged, bg: withAlpha(theme.colors.statusMerged, 0.16) };
    case "inReview":
      return { fg: theme.colors.statusInReview, bg: withAlpha(theme.colors.statusInReview, 0.16) };
  }
}

function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith("rgba")) return hex;
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function Chip({ label, variant, icon, style }: ChipProps) {
  const theme = useTheme();
  const palette = variantPalette(theme, variant);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (variant !== "active") {
      opacity.value = 1;
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
  }, [variant, opacity]);

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
          paddingVertical: 4,
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
