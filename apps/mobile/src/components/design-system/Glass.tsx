import type { ReactNode } from "react";
import type { ViewStyle } from "react-native";
import { BlurView, type BlurTint } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import {
  useTheme,
  type GlassShape,
  type GlassUseCase,
  type Theme,
} from "@/theme";

export interface GlassProps {
  preset?: GlassUseCase;
  children?: ReactNode;
  tint?: string;
  style?: ViewStyle;
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
  children,
  tint,
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
      <GlassView
        glassEffectStyle="regular"
        {...(resolvedTint ? { tintColor: resolvedTint } : {})}
        colorScheme={theme.scheme === "dark" ? "dark" : "light"}
        style={[baseStyle, style]}
      >
        {children}
      </GlassView>
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
