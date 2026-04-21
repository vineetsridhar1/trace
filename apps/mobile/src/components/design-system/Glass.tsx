import type { ReactNode } from "react";
import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { BlurView, type BlurTint } from "expo-blur";
import {
  GlassContainer as NativeGlassContainer,
  GlassView,
  isLiquidGlassAvailable,
  type GlassViewProps,
} from "expo-glass-effect";
import Animated, { type AnimatedProps } from "react-native-reanimated";
import {
  useTheme,
  type GlassShape,
  type GlassUseCase,
  type Theme,
} from "@/theme";

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
}

const FALLBACK_TINT: BlurTint = "systemThinMaterialDark";

interface GlassContainerProps extends ViewProps {
  spacing?: number;
}

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
  children,
  tint,
  animatedProps,
  interactive,
  style,
}: GlassProps) {
  const theme = useTheme();
  const config = theme.glass[preset];
  const radius = shapeRadius(config.shape, theme);

  const baseStyle: ViewStyle = {
    borderRadius: radius,
    overflow: "hidden",
  };

  if (isLiquidGlassAvailable()) {
    const resolvedTint = tint ?? config.tint;
    return (
      <AnimatedGlassView
        glassEffectStyle="regular"
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
    <BlurView
      tint={FALLBACK_TINT}
      intensity={config.intensity}
      style={[baseStyle, style]}
    >
      {children}
    </BlurView>
  );
}

export function GlassContainer({ spacing, ...props }: GlassContainerProps) {
  if (isLiquidGlassAvailable()) {
    return <NativeGlassContainer spacing={spacing} {...props} />;
  }

  return <View {...props} />;
}
