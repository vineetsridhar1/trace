import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { BlurView, type BlurTint } from "expo-blur";
import {
  GlassEffectStyleConfig,
  GlassStyle,
  GlassView,
  isLiquidGlassAvailable,
  type GlassViewProps,
} from "expo-glass-effect";
import Animated, { AnimatedStyle, type AnimatedProps } from "react-native-reanimated";
import { useTheme, type GlassShape, type GlassUseCase, type Theme } from "@/theme";

const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);

export interface GlassProps {
  preset?: GlassUseCase;
  children?: ReactNode;
  tint?: string;
  /**
   * Reanimated-driven props applied to the underlying `GlassView` — most
   * often `{ tintColor }` from `useAnimatedProps` for mode-based tint
   * interpolation. Ignored on the `BlurView` fallback path (pre-iOS 26 /
   * Android).
   */
  animatedProps?: AnimatedProps<GlassViewProps>;
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
  glassStyleEffect?: StyleProp<AnimatedStyle<GlassStyle | GlassEffectStyleConfig | undefined>>;
}

const FALLBACK_TINT: BlurTint = "systemThinMaterialDark";

function shapeRadius(shape: GlassShape, theme: Theme): number {
  switch (shape) {
    case "rect":
      return 0;
    case "roundedSm":
      return theme.radius.sm;
    case "roundedMd":
      return theme.radius.md;
    case "roundedLg":
      return theme.radius.lg;
    case "capsule":
      return theme.radius.full;
  }
}

export function Glass({
  preset = "card",
  glassStyleEffect = "regular",
  children,
  tint,
  animatedProps,
  interactive,
  style,
}: GlassProps) {
  const theme = useTheme();
  const config = theme.glass[preset];
  const radius = shapeRadius(config.shape, theme);
  const resolvedTint = tint ?? config.tint;

  const baseStyle: ViewStyle = {
    backgroundColor: resolvedTint ?? theme.colors.glassTint,
    borderRadius: radius,
    overflow: "hidden",
  };

  if (isLiquidGlassAvailable()) {
    return (
      <AnimatedGlassView
        glassEffectStyle={glassStyleEffect}
        isInteractive={interactive}
        {...(resolvedTint ? { tintColor: resolvedTint } : {})}
        colorScheme={theme.scheme === "dark" ? "dark" : "light"}
        style={[baseStyle, style]}
        animatedProps={animatedProps}
      >
        {children}
      </AnimatedGlassView>
    );
  }

  // Pre-iOS 26 / Android: native BlurView with its own tint enum. Per-preset
  // intensity still differentiates tabBar vs card vs input.
  return (
    <BlurView tint={FALLBACK_TINT} intensity={config.intensity} style={[baseStyle, style]}>
      {children}
    </BlurView>
  );
}
