import { useColorScheme } from "react-native";
import { colors, type ThemeColors } from "./colors";
import { typography, type ThemeTypography } from "./typography";
import { spacing, type ThemeSpacing } from "./spacing";
import { radius, type ThemeRadius } from "./radius";
import { motion, type ThemeMotion } from "./motion";
import { shadows, type ThemeShadows } from "./shadows";
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
  shadows,
  glass,
};

/**
 * Returns the active theme.
 *
 * V1 is dark-only. We still read `useColorScheme` so the hook re-renders when
 * the system preference changes — this keeps consumers stable when a future
 * light variant lands; no consumer code has to change.
 */
export function useTheme(): Theme {
  useColorScheme();
  return darkTheme;
}

export { colors, typography, spacing, radius, motion, shadows, glass };
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
