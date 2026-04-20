# 11 — Core Primitives: Screen, Text, Button, IconButton, Spinner

## Summary

Build the bottom-layer UI primitives every screen uses. Each primitive is one file, under 200 lines, typed from the theme, and encodes polish defaults (haptics, safe areas, correct typography) so screens inherit feel automatically.

## What needs to happen

- **`Screen.tsx`** — root wrapper for every screen:
  - Applies safe-area insets (`react-native-safe-area-context`)
  - Sets status bar style via `expo-status-bar`
  - Background from theme
  - Props: `edges?: ('top' | 'bottom' | 'left' | 'right')[]`, `background?: keyof theme.colors`
- **`Text.tsx`** — typography wrapper:
  - Variant prop: `'largeTitle' | 'title1' | 'title2' | 'headline' | 'body' | 'callout' | 'subheadline' | 'footnote' | 'caption1' | 'caption2' | 'mono'`
  - Color prop: keyof `theme.colors`
  - `numberOfLines`, `align`
  - Respects Dynamic Type via `allowFontScaling` (on by default)
- **`Button.tsx`**:
  - Variants: `'primary' | 'secondary' | 'ghost' | 'destructive'`
  - Sizes: `'sm' | 'md' | 'lg'`
  - Props: `title`, `onPress`, `disabled`, `loading`, `icon?`, `haptic?: 'light' | 'medium' | 'heavy'` (default per variant)
  - On press: haptic fires, scale-down animation (`0.98` via Reanimated), spring-back
  - Loading state replaces label with `Spinner`, disables interaction
- **`IconButton.tsx`**:
  - Uses native SF Symbols via `expo-symbols`
  - Props: `symbol` (typed as `SFSymbol`), `size`, `color`, `onPress`, `haptic?`, `accessibilityLabel` required
  - Context menu support via `react-native-context-menu-view` (optional `menuItems` prop)
- **`Spinner.tsx`**:
  - Native `UIActivityIndicator` via `ActivityIndicator` from RN
  - Sizes: `'small' | 'large'`
  - Color from theme

## Dependencies

- [10 — Theme Tokens](10-theme-tokens.md)
- Install: `react-native-reanimated`, `react-native-gesture-handler`, `react-native-safe-area-context`, `expo-status-bar`, `expo-haptics`, `expo-symbols`, `react-native-context-menu-view`

## Completion requirements

- [x] All 5 primitives exported from `components/design-system/index.ts`
- [x] Each file <200 lines
- [x] No hard-coded colors or font sizes — all from theme
- [x] Button haptic fires on press (verifiable on device)
- [x] Text respects Dynamic Type on device
- [x] `IconButton` renders native SF Symbols and supports an optional `menuItems` context menu
- [x] No `any` types

## How to test

1. Render each primitive in the design-system dev route (ticket 14) and visually confirm.
2. On device: increase Dynamic Type in system settings; verify Text scales appropriately.
3. Tap a primary Button → feel the haptic, see the scale animation.
4. Long-press an IconButton with menuItems → native iOS context menu appears.
