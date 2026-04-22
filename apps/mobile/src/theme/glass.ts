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
  input: { tint: "rgba(23,23,23,0.64)", intensity: 60, shape: "capsule" },
  pinnedBar: { tint: "rgba(23,23,23,0.70)", intensity: 70, shape: "roundedMd" },
  card: { tint: "rgba(38,38,38,0.60)", intensity: 50, shape: "roundedLg" },
};
