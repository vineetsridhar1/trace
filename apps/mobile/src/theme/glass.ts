/**
 * Liquid Glass presets per use-case. Consumed by the `Glass` primitive
 * (added in ticket 12) which wraps `expo-glass-effect` on iOS 26+ and falls
 * back to `expo-blur` elsewhere.
 *
 * - `tint`      — the color laid over the blurred backdrop. Only read on
 *                 iOS; the Android `BlurView` fallback uses its own tint
 *                 enum (`systemThinMaterialDark` etc.) and ignores this.
 * - `intensity` — 0-100; higher is a stronger blur / more opaque glass
 * - `shape`     — how the container's edges are finished; `capsule` rounds
 *                 to the container's height, `pill` matches the radius scale
 */
export type GlassShape = "rect" | "roundedSm" | "roundedMd" | "roundedLg" | "capsule";

export interface GlassPreset {
  tint: string;
  intensity: number;
  shape: GlassShape;
}

export type GlassUseCase =
  | "tabBar"
  | "navBar"
  | "input"
  | "pinnedBar"
  | "card";

export type ThemeGlass = Record<GlassUseCase, GlassPreset>;

export const glass: ThemeGlass = {
  tabBar: { tint: "rgba(10,10,10,0.72)", intensity: 80, shape: "rect" },
  navBar: { tint: "rgba(10,10,10,0.68)", intensity: 70, shape: "rect" },
  input: { tint: "rgba(23,23,23,0.64)", intensity: 60, shape: "capsule" },
  pinnedBar: { tint: "rgba(23,23,23,0.70)", intensity: 70, shape: "roundedMd" },
  card: { tint: "rgba(38,38,38,0.60)", intensity: 50, shape: "roundedLg" },
};
