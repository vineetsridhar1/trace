# 10 — Theme Tokens

## Summary

Create a typed theme system for the mobile app: colors, typography, spacing, radius, motion, shadows, and Liquid Glass presets. Tokens map 1:1 to the web app's semantic tokens where possible so branding stays consistent. V1 is dark-only; the structure supports a future light variant without rewrites.

## What needs to happen

- Create `apps/mobile/src/theme/` with:
  - `colors.ts` — semantic tokens:
    - `background`, `surface`, `surfaceElevated`, `surfaceDeep`
    - `foreground`, `mutedForeground`, `dimForeground`
    - `accent`, `accentForeground`, `accentMuted`
    - `destructive`, `destructiveForeground`, `destructiveMuted`
    - `success`, `warning`
    - `border`, `borderMuted`
    - `glassTint` (dark), `glassTintLight` (pre-iOS-26 fallback)
    - Status colors: `statusActive`, `statusNeedsInput`, `statusInReview`, `statusDone`, `statusFailed`, `statusMerged`
  - `typography.ts`:
    - Font family: iOS system (`.AppleSystemUIFont`) via the system default
    - Variants: `largeTitle` (34/41), `title1` (28/34), `title2` (22/28), `headline` (17/22 semibold), `body` (17/22), `callout` (16/21), `subheadline` (15/20), `footnote` (13/18), `caption1` (12/16), `caption2` (11/13), `mono` (16/21 monospace)
  - `spacing.ts` — 4pt scale: `xs=4, sm=8, md=12, lg=16, xl=24, xxl=32, xxxl=48`
  - `radius.ts` — `sm=6, md=10, lg=14, xl=20, full=9999`
  - `motion.ts` — spring configs (`snap: damping 25/stiffness 400`, `smooth: damping 20/stiffness 250`, `gentle: damping 18/stiffness 180`), durations for timing-based
  - `shadows.ts` — iOS-style subtle shadows per elevation level
  - `glass.ts` — Liquid Glass presets: `{ tint, intensity, shape }` per use-case (`tabBar`, `navBar`, `input`, `pinnedBar`, `card`)
- Create `useTheme()` hook returning the current theme (dark-only for now; wire up `useColorScheme` but always return dark).
- Export everything from `apps/mobile/src/theme/index.ts`.
- Match web semantic token names where possible (see `apps/web/src/index.css` / CSS vars for reference).

## Dependencies

- [05 — Mobile App Scaffold](05-mobile-app-scaffold.md)

## Completion requirements

- [ ] All token files exist, strongly typed (no `any`)
- [ ] `useTheme()` hook returns the full token set
- [ ] All files <200 lines
- [ ] Dark-mode palette matches web's visual identity (spot-check in screenshots)
- [ ] Future light-mode variant can be added by extending `colors.ts` without touching consumers

## How to test

1. Type check passes.
2. Render a screen using `theme.colors.background`, `theme.typography.headline`, `theme.spacing.md` — visually matches web dark theme.
3. Adding a hypothetical `light` variant to `colors.ts` should not require changes elsewhere (spike, don't commit).
