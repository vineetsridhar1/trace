/**
 * Liquid Glass presets per use-case. Consumed by the `Glass` primitive
 * which uses `expo-glass-effect`'s `GlassView` on iOS 26+ and falls back to
 * `expo-blur`'s `BlurView` on iOS <26 and Android.
 *
 * - `tint`      — the color applied to the glass on iOS 26+ (via
 *                 `GlassView.tintColor`). The `BlurView` fallback uses its
 *                 own native `BlurTint` enum (`systemThinMaterialDark`) and
 *                 ignores this value.
 * - `intensity` — 0-100; higher is a stronger blur. Drives `BlurView` only;
 *                 `GlassView` renders at a system-managed intensity.
 * - `shape`     — how the container's edges are finished; `capsule` rounds
 *                 to the container's height.
 */
export type GlassShape = "rect" | "roundedSm" | "roundedMd" | "roundedLg" | "capsule";

export interface GlassPreset {
  tint?: string;
  intensity: number;
  shape: GlassShape;
}

export type GlassUseCase = "input" | "pinnedBar" | "card";

export type ThemeGlass = Record<GlassUseCase, GlassPreset>;

export const glass: ThemeGlass = {
  input: { intensity: 60, shape: "capsule" },
  pinnedBar: { intensity: 70, shape: "roundedMd" },
  card: { intensity: 50, shape: "roundedLg" },
};
