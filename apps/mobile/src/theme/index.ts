import { useColorScheme } from "react-native";
import { colors, alpha, type ThemeColors } from "./colors";
import { typography, type ThemeTypography } from "./typography";
import { spacing, type ThemeSpacing } from "./spacing";
import { radius, type ThemeRadius } from "./radius";
import { motion, type ThemeMotion } from "./motion";
import { makeShadows, type ThemeShadows } from "./shadows";
import { glass, type ThemeGlass } from "./glass";

export type ThemeScheme = "dark" | "light";

export interface Theme {
  scheme: ThemeScheme;
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: ThemeSpacing;
  radius: ThemeRadius;
  motion: ThemeMotion;
  shadows: ThemeShadows;
  glass: ThemeGlass;
}

const darkTheme: Theme = {
  scheme: "dark",
  colors: colors.dark,
  typography,
  spacing,
  radius,
  motion,
  shadows: makeShadows(colors.dark.shadow),
  glass,
};

/**
 * Returns the active theme.
 *
 * V1 is dark-only. The `useColorScheme()` call subscribes the hook to OS
 * appearance changes so when a future light variant lands, consumers
 * automatically re-render with it — intentionally kept even though the
 * return value is currently unused.
 */
export function useTheme(): Theme {
  useColorScheme();
  return darkTheme;
}

export { colors, alpha, typography, spacing, radius, motion, glass, makeShadows };
export type {
  ThemeColors,
  ThemeTypography,
  ThemeSpacing,
  ThemeRadius,
  ThemeMotion,
  ThemeShadows,
  ThemeGlass,
};
export type { TypographyVariant } from "./typography";
export type { ShadowLevel } from "./shadows";
export type { GlassShape, GlassPreset, GlassUseCase } from "./glass";
export type { SpringConfig } from "./motion";
