# 12 — Surface Primitives: Card, Glass, Sheet

## Summary

Build the surface primitives that establish depth and hierarchy: elevated cards, Liquid Glass containers (iOS 26+) with `expo-blur` fallback for earlier OS versions, and native iOS sheet presentation with detent support.

## What needs to happen

- **`Glass.tsx`** — Liquid Glass wrapper:
  - Uses `expo-glass-effect` on iOS 26+ (check at runtime via `Platform.Version`).
  - Falls back to `expo-blur` `<BlurView tint="systemThinMaterialDark" intensity={80}>` on iOS <26.
  - Props: `preset?: 'tabBar' | 'navBar' | 'input' | 'pinnedBar' | 'card'` (pulls config from `theme.glass`), `children`, `style?`.
  - If `expo-glass-effect` does not satisfy all presets adequately during spike in M2, fall back to writing a small custom Expo Module in `apps/mobile/native-modules/glass-effect/` wrapping `UIGlassEffect` directly. Budget: 1 day.
- **`Card.tsx`**:
  - Elevated surface: rounded corners (from theme), subtle shadow (from theme), background `surfaceElevated`
  - Props: `elevation?: 'low' | 'medium' | 'high'`, `padding?: keyof theme.spacing`, `onPress?` (makes it tappable with haptic + scale)
  - Optional `glass?: boolean` — uses `Glass` primitive instead of solid background
- **`Sheet.tsx`**:
  - Layout primitive used inside a form-sheet route body to configure the sheet and style content.
  - Props: `detents?: ('small' | 'medium' | 'large')[]` (mapped to fractional heights: small=0.35, medium=0.5, large=1.0 via `sheetAllowedDetents`), `showGrabber?`, `swipeToDismiss?`, `padding?: keyof ThemeSpacing`.
  - Dynamically sets `sheetAllowedDetents`, `sheetGrabberVisible`, `sheetCornerRadius`, and `gestureEnabled` via an inline `<Stack.Screen>`.
  - Wraps content with the theme surface color, horizontal/top padding from the theme scale, and a safe-area-aware bottom inset.
  - **Presentation note**: `presentation: 'formSheet'` must be declared by the *parent layout* (e.g. `app/(authed)/sheets/_layout.tsx`) when the sheet route is registered — expo-router applies options via `setOptions` in a post-mount `useEffect`, which is too late for `presentation` to take effect if declared from inside the screen body. iOS backdrop-tap dismissal on dimmed detents is always on and is not toggleable; `swipeToDismiss` only controls the native swipe-down gesture.

## Dependencies

- [10 — Theme Tokens](10-theme-tokens.md)
- [11 — Core Primitives](11-core-primitives.md)
- Install: `expo-blur`, `expo-glass-effect` (or decide on custom Expo module after spike)

## Completion requirements

- [x] `Glass` renders correctly on iOS 26+ with real Liquid Glass
- [x] `Glass` falls back cleanly to `BlurView` on iOS 17–25 (no visual breakage)
- [x] `Card` renders with correct elevation shadows
- [x] `Sheet` layout primitive composes with expo-router modal routes
- [x] All files <200 lines

## How to test

1. Design-system dev route renders Glass over a scrollable background — verify refraction/specular on iOS 26 device, verify blur fallback on iOS 17 simulator.
2. Sheet appears with correct detents, grabber visible, swipe-to-dismiss works.
3. Cards at each elevation look distinct on device.
