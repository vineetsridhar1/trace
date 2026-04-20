# 13 — Data Primitives: ListRow, Chip, StatusDot, Avatar, Skeleton, SegmentedControl, EmptyState

## Summary

Build the primitives screens use to display data: rows, chips, status indicators, avatars, loading placeholders, segmented controls, and empty states. Every one encodes polish defaults.

## What needs to happen

- **`ListRow.tsx`**:
  - Props: `title`, `subtitle?`, `leading?: ReactNode`, `trailing?: ReactNode`, `onPress?`, `destructive?`, `disclosureIndicator?` (chevron)
  - Tappable rows: haptic `light`, brief highlight on press
  - 17pt title, 13pt subtitle, correct iOS spacing, separator hairline
- **`Chip.tsx`**:
  - Status chip with variants: `'inProgress' | 'needsInput' | 'done' | 'failed' | 'merged' | 'inReview'` (names mirror the `sessionStatus` data contract in camelCase).
  - Each variant has a color from theme; muted backgrounds come from the shared `alpha()` helper in `theme/colors.ts`.
  - `'inProgress'` variant pulses subtly (Reanimated opacity loop, UI thread); `cancelAnimation` is called on variant change to stop layering.
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
- [x] Pulse animations (Chip `inProgress`, StatusDot `active`) run on the UI thread (verify with Reanimated devtools)
- [x] Avatar falls back to initials gracefully

## Implementation notes (landed)

- **Chip variant → session-status mapping**: `Chip` variant names are the camelCase form of `sessionStatus` (`in_progress → inProgress`, `needs_input → needsInput`, `in_review → inReview`). Consumers do the snake-to-camel translation at the data boundary (see ticket 17).
- **Skeleton shimmer**: implemented as a translating highlight band (not a true gradient) to avoid adding `expo-linear-gradient`. Visual intent matches the plan; re-evaluate in the M6 polish pass if motion feels off on real devices.
- **Pulse cancellation**: `Chip` and `StatusDot` both call `cancelAnimation(opacity)` and tween back to 1 when the pulsing state ends — no visible beat when a row transitions out of `inProgress`/`active`.
- **Alpha helper**: `alpha(color, a)` lives in `theme/colors.ts` and is exported via `@/theme`. Handles 3- and 6-digit hex and passes through `rgba`/`hsl` unchanged; used by Chip for muted backgrounds derived from status colors.
- **SegmentedControl iOS-26 pill clip (added during ticket 16)**: iOS 26's native `UISegmentedControl` draws a capsule selection indicator inside a less-rounded rectangular track, which reads as mismatched shapes. The primitive now wraps the native control in a clip `View` with `borderRadius: height/2` + `overflow: "hidden"` so the outer track matches the indicator. The primitive also fixes `height` at 32pt to make the pill radius deterministic.

## How to test

1. Design-system dev route renders every primitive and every variant.
2. Chip `active` variant pulses; other variants don't.
3. SegmentedControl behaves exactly like iOS Settings app — haptic on change, crisp spring.
4. Skeleton animation is smooth.
