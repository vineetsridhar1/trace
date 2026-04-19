import type { ViewStyle } from "react-native";

/**
 * iOS-style elevation shadows. Android uses `elevation`; iOS uses the
 * `shadow*` fields. Defining them together means the same token renders
 * correctly on both platforms.
 *
 * `none` exists so consumers can toggle elevation without conditionals.
 */
export type ShadowLevel = "none" | "sm" | "md" | "lg";

export type ThemeShadows = Record<ShadowLevel, ViewStyle>;

export const shadows: ThemeShadows = {
  none: {
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  sm: {
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  md: {
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  lg: {
    shadowColor: "#000",
    shadowOpacity: 0.38,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
};
