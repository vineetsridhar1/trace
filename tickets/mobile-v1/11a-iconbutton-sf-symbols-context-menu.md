# 11a — IconButton: SF Symbols + Context Menu

## Summary

Ticket 11 shipped an initial `IconButton` backed by `@expo/vector-icons` Ionicons, with no context menu support. This ticket upgrades `IconButton` to the real target: native SF Symbols and built-in context menu, matching plan §11.3 and the symbol names already referenced by tickets 15, 19, and 24. Lands before any M3/M4 ticket that consumes `IconButton` so downstream authors can write `symbol="ellipsis.circle"` directly.

## What needs to happen

- Install `expo-symbols` (native SF Symbols on iOS 16+, graceful fallback on Android) and `react-native-context-menu-view`.
- Rebuild the Expo dev client so both native modules are available — document the rebuild step in `apps/mobile/README.md` so new contributors don't hit a "module not found" at runtime.
- **`IconButton.tsx` migration**:
  - Replace `Ionicons` + `keyof typeof Ionicons.glyphMap` with `SymbolView` from `expo-symbols`. Type `symbol` as `SymbolViewProps['name']` (SF Symbol identifier string).
  - Keep the existing `size`, `color`, `onPress`, `haptic?`, `accessibilityLabel`, `disabled` props and their defaults — the API shape stays the same for call sites added in ticket 10 and later.
  - Add `menuItems?: ContextMenuItem[]` prop. When present, wrap the Pressable in `<ContextMenuView menuConfig={...}>`; when absent, the Pressable renders unwrapped so the default path stays lightweight.
  - `ContextMenuItem` shape: `{ key: string; title: string; systemIcon?: string; destructive?: boolean; onPress: () => void }`. Map internally to the native menu-view config. `destructive` maps to the iOS destructive attribute; `systemIcon` accepts an SF Symbol name.
  - Keep file under 200 lines.
- Update any existing call sites that imported `IconButton` during ticket 11 testing to pass SF Symbol names.

## Dependencies

- [11 — Core Primitives](11-core-primitives.md)

## Completion requirements

- [ ] `expo-symbols` + `react-native-context-menu-view` installed and the dev client rebuild step is documented
- [ ] `IconButton` renders native SF Symbols on iOS; verifiable with a symbol like `ellipsis.circle`
- [ ] `IconButton` accepts an optional `menuItems` prop and renders a native iOS context menu on long-press when provided
- [ ] Haptics still fire on tap; context-menu activation has its own platform haptic (native default)
- [ ] File stays under 200 lines
- [ ] No `any` types

## How to test

1. In the design-system dev route (ticket 14), render an `IconButton` with `symbol="ellipsis.circle"` — verify it renders as the native SF Symbol, not a vector-icon glyph.
2. Render an `IconButton` with three `menuItems` (one destructive); long-press → native iOS context menu animates in; tap each item → matching `onPress` fires.
3. On Android, verify the symbol falls back gracefully (e.g., to a default icon or a vector-icon equivalent) without crashing. V1 is iOS-first; Android just needs to not crash.
