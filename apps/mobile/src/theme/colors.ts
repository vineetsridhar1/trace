/**
 * Semantic color tokens for the mobile app.
 *
 * Token names mirror the web app's semantic tokens (`--th-*` CSS vars in
 * `apps/web/src/index.css`) wherever possible so the brand reads the same on
 * both platforms.
 *
 * V1 is dark-only. A future light variant can be added by exporting a
 * sibling `light` palette and selecting between them in `useTheme()` — no
 * consumer changes required, since the `ThemeColors` shape is frozen.
 */

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceDeep: string;

  foreground: string;
  mutedForeground: string;
  dimForeground: string;

  accent: string;
  accentForeground: string;
  accentMuted: string;

  destructive: string;
  destructiveForeground: string;
  destructiveMuted: string;

  success: string;
  warning: string;

  border: string;
  borderMuted: string;

  glassTint: string;
  glassTintLight: string;

  shadow: string;

  statusActive: string;
  statusNeedsInput: string;
  statusInReview: string;
  statusDone: string;
  statusFailed: string;
  statusMerged: string;
}

const dark: ThemeColors = {
  background: "#0a0a0a",
  surface: "#171717",
  surfaceElevated: "#262626",
  surfaceDeep: "#0a0a0a",

  foreground: "#d4d4d8",
  mutedForeground: "#a1a1aa",
  dimForeground: "#71717a",

  accent: "#3b82f6",
  accentForeground: "#ffffff",
  accentMuted: "rgba(59,130,246,0.16)",

  destructive: "#ef4444",
  destructiveForeground: "#ffffff",
  destructiveMuted: "rgba(239,68,68,0.16)",

  success: "#22c55e",
  warning: "#f59e0b",

  border: "#262626",
  borderMuted: "#1f1f1f",

  glassTint: "rgba(23,23,23,0.72)",
  glassTintLight: "rgba(23,23,23,0.55)",

  shadow: "#000000",

  statusActive: "#3b82f6",
  statusNeedsInput: "#f59e0b",
  statusInReview: "#06b6d4",
  statusDone: "#22c55e",
  statusFailed: "#ef4444",
  statusMerged: "#a855f7",
};

export const colors = { dark } as const;

/**
 * Returns `color` at the given alpha (0..1). Accepts 3-digit hex (`#abc`),
 * 6-digit hex (`#aabbcc`), or `rgba(...)` / `hsl(...)` (passed through
 * unchanged — callers that already specify alpha own it). Any other format
 * throws, which fails loud in development rather than silently rendering as
 * transparent.
 */
export function alpha(color: string, a: number): string {
  if (color.startsWith("rgba") || color.startsWith("hsla")) return color;
  if (color.startsWith("hsl") || color.startsWith("rgb")) return color;

  if (color.startsWith("#")) {
    const hex = color.slice(1);
    let r: number;
    let g: number;
    let b: number;
    if (hex.length === 3) {
      r = parseInt(hex[0]! + hex[0]!, 16);
      g = parseInt(hex[1]! + hex[1]!, 16);
      b = parseInt(hex[2]! + hex[2]!, 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else {
      throw new Error(`alpha(): unsupported hex length in "${color}"`);
    }
    return `rgba(${r},${g},${b},${a})`;
  }

  throw new Error(`alpha(): unsupported color format "${color}"`);
}
