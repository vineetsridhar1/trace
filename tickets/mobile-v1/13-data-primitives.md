# 13 — Data Primitives: ListRow, Chip, StatusDot, Avatar, Skeleton, SegmentedControl, EmptyState

## Summary

Build the primitives screens use to display data: rows, chips, status indicators, avatars, loading placeholders, segmented controls, and empty states. Every one encodes polish defaults.

## What needs to happen

- **`ListRow.tsx`**:
  - Props: `title`, `subtitle?`, `leading?: ReactNode`, `trailing?: ReactNode`, `onPress?`, `destructive?`, `disclosureIndicator?` (chevron)
  - Tappable rows: haptic `light`, brief highlight on press
  - 17pt title, 13pt subtitle, correct iOS spacing, separator hairline
- **`Chip.tsx`**:
  - Status chip with variants: `'active' | 'needsInput' | 'done' | 'failed' | 'merged' | 'inReview'`
  - Each variant has a color from theme.
  - `'active'` variant pulses subtly (Reanimated opacity loop, UI thread).
  - Optional leading icon.
- **`StatusDot.tsx`**:
  - Small colored dot for agent status (`active` / `done` / `failed` / `stopped`).
  - `active` pulses.
- **`Avatar.tsx`**:
  - Renders user avatar from URL; fallback to colored-background initials on error or missing URL.
  - Sizes: `xs=20, sm=28, md=36, lg=48`.
- **`Skeleton.tsx`**:
  - Shimmer loading placeholder (Reanimated gradient sweep).
  - Props: `width`, `height`, `radius?`.
- **`SegmentedControl.tsx`**:
  - Wraps native `SegmentedControl` from `@react-native-segmented-control/segmented-control` for iOS-correct feel.
  - Props: `segments: string[]`, `selectedIndex`, `onChange`.
- **`EmptyState.tsx`**:
  - Icon + title + optional subtitle + optional action button.
  - Props: `icon` (SF Symbol name), `title`, `subtitle?`, `action?: { label, onPress }`.

## Dependencies

- [10 — Theme Tokens](10-theme-tokens.md)
- [11 — Core Primitives](11-core-primitives.md)
- Install: `@react-native-segmented-control/segmented-control`

## Completion requirements

- [x] All 7 primitives exported from `components/design-system/index.ts`
- [x] Each file <200 lines
- [x] All colors/spacing from theme
- [x] Active-status pulse animation runs on the UI thread (verify with Reanimated devtools)
- [x] Avatar falls back to initials gracefully

## Implementation notes (landed)

- **Chip variant → session-status mapping**: `Chip` exposes `active` as the in-progress variant. Session groups (see §10.4, ticket 17) use `in_progress` in their data contract — consumers map `in_progress → "active"` at the boundary.
- **Skeleton shimmer**: implemented as a translating highlight band (not a true gradient) to avoid adding `expo-linear-gradient`. Visual intent matches the plan; re-evaluate in the M6 polish pass if motion feels off on real devices.
- **Pulse cancellation**: when `Chip.variant` / `StatusDot.status` transitions away from `active`, the effect resets `opacity.value = 1`. If layering becomes visible, add `cancelAnimation(opacity)` before the reassign in ticket 30.

## How to test

1. Design-system dev route renders every primitive and every variant.
2. Chip `active` variant pulses; other variants don't.
3. SegmentedControl behaves exactly like iOS Settings app — haptic on change, crisp spring.
4. Skeleton animation is smooth.
