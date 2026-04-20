# 12 — Surface Primitives: Card, Glass, Sheet

## Summary

Build the surface primitives that establish depth and hierarchy: elevated cards, Liquid Glass containers (iOS 26+) with `expo-blur` fallback for earlier OS versions, and native iOS sheet presentation with detent support.

## What needs to happen

- **`Glass.tsx`** — Liquid Glass wrapper:
  - Uses `expo-glass-effect` on iOS 26+ (check at runtime via `Platform.Version`).
  - Falls back to `expo-blur` `<BlurView tint="systemThinMaterialDark" intensity={80}>` on iOS <26.
  - Props: `preset?: 'navBar' | 'input' | 'pinnedBar' | 'card' | 'sessionPlayer'` (pulls config from `theme.glass`), `children`, `style?`.
  - The `tabBar` preset defined in `theme/glass.ts` (ticket 10) is retained as a token but **not consumed here** — the tab bar uses `NativeBottomTabs` (see ticket 15), which gets Liquid Glass from UIKit directly.
  - If `expo-glass-effect` does not satisfy all presets adequately during spike in M2, fall back to writing a small custom Expo Module in `apps/mobile/native-modules/glass-effect/` wrapping `UIGlassEffect` directly. Budget: 1 day.
- **`Card.tsx`**:
  - Elevated surface: rounded corners (from theme), subtle shadow (from theme), background `surfaceElevated`
  - Props: `elevation?: 'low' | 'medium' | 'high'`, `padding?: keyof theme.spacing`, `onPress?` (makes it tappable with haptic + scale)
  - Optional `glass?: boolean` — uses `Glass` primitive instead of solid background
- **`Sheet.tsx`**:
  - Wraps expo-router's sheet presentation via `react-native-screens` `formSheet` / `pageSheet`.
  - Props: `detents?: ('small' | 'medium' | 'large')[]` (maps to iOS `.compact` / `.medium` / `.large`), `showGrabber?`, `dismissOnBackdropTap?`.
  - Renders content with safe-area aware padding.
  - Wrapping note: because expo-router uses file-based routing for modal presentations, the actual sheet route is defined in the route tree (`(authed)/sheets/foo.tsx`); `Sheet` is a *layout* primitive used inside those routes to provide consistent padding, grabber, and theming.

## Dependencies

- [10 — Theme Tokens](10-theme-tokens.md)
- [11 — Core Primitives](11-core-primitives.md)
- Install: `expo-blur`, `expo-glass-effect` (or decide on custom Expo module after spike)

## Completion requirements

- [ ] `Glass` renders correctly on iOS 26+ with real Liquid Glass
- [ ] `Glass` falls back cleanly to `BlurView` on iOS 17–25 (no visual breakage)
- [ ] `Card` renders with correct elevation shadows
- [ ] `Sheet` layout primitive composes with expo-router modal routes
- [ ] All files <200 lines

## How to test

1. Design-system dev route renders Glass over a scrollable background — verify refraction/specular on iOS 26 device, verify blur fallback on iOS 17 simulator.
2. Sheet appears with correct detents, grabber visible, swipe-to-dismiss works.
3. Cards at each elevation look distinct on device.
