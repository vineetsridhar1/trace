# 14 — Haptics Wrapper, Motion Helpers, and Design System Dev Route

## Summary

Finalize the polish infrastructure: a typed haptic helper so callers use a tiny vocabulary rather than raw `expo-haptics` calls, motion helpers for common animation patterns, and an in-app dev-only route that renders every design-system primitive in every state for visual QA.

## What needs to happen

- **`apps/mobile/src/lib/haptics.ts`** (<50 lines):
  ```ts
  export const haptic = {
    selection: () => Haptics.selectionAsync(),
    light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
    heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
    success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
    error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  };
  ```
  Every primary action in the app goes through this, matching the haptic map in the plan (§11.6).
- **`apps/mobile/src/lib/motion.ts`** (<100 lines):
  - Reusable Reanimated helpers: `pressScale(ref)`, `fadeInFromBottom(delay)`, `pulse(duration)`, `slideInFromRight`.
  - Re-exports theme spring configs as convenient constants.
- **Design system dev route** (`app/(dev)/design-system.tsx`, enabled only in `__DEV__`):
  - A scrollable screen showing every primitive and its variants in a grid/list.
  - Sections: Typography, Buttons, IconButtons, Cards, Glass, Chips, Status dots, ListRows, Avatars, Skeletons, SegmentedControl, EmptyState, Sheet.
  - Acts as the internal Storybook — a single-file index of everything, used for visual regression during M6 polish.
  - Access via a dev-only entry in Settings (only visible when `__DEV__`).
  - QA checks to include while wiring this up:
    - Chip `active` variant pulses; flipping to any non-active variant stops immediately with no visual beat.
    - StatusDot `active` pulses; `stopped` renders in `dimForeground`.
    - Skeleton shimmer is a translating highlight band (no true gradient); confirm the sweep looks smooth and the track color matches `surfaceElevated`.
    - Avatar falls back from a 404 URI to the colored-initials view without a perceptible flash on first render.
- Exclude the dev route from production bundle via Metro config or route guard.

## Dependencies

- [11 — Core Primitives](11-core-primitives.md)
- [12 — Surface Primitives](12-surface-primitives-glass-sheet.md)
- [13 — Data Primitives](13-data-primitives.md)

## Completion requirements

- [ ] `haptic` helper used consistently across the app (verifiable in subsequent tickets)
- [ ] Motion helpers compile and animate smoothly
- [ ] `/design-system` dev route renders every primitive
- [ ] Route is only reachable in dev builds
- [ ] All files <200 lines

## How to test

1. In dev build, navigate to design-system route → scroll through every primitive.
2. On every interaction, verify haptic fires as expected.
3. Production build (preview profile) does not include the dev route.
