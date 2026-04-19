import type { ViewStyle } from "react-native";

/**
 * iOS-style elevation shadows. Android uses `elevation`; iOS uses the
 * `shadow*` fields. Defining them together means the same token renders
 * correctly on both platforms.
 *
 * `makeShadows` takes the shadow color from the theme so no color is
 * hard-coded here — a future light variant can pass a softer color without
 * touching this file.
 */
export type ShadowLevel = "none" | "sm" | "md" | "lg";

export type ThemeShadows = Record<ShadowLevel, ViewStyle>;

export function makeShadows(shadowColor: string): ThemeShadows {
  return {
    none: {
      shadowColor: "transparent",
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 0,
    },
    sm: {
      shadowColor,
      shadowOpacity: 0.18,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
    md: {
      shadowColor,
      shadowOpacity: 0.28,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    lg: {
      shadowColor,
      shadowOpacity: 0.38,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 14,
    },
  };
}
