# 15 — Expo Router Tabs & Navigation Skeleton

## Summary

Wire up the full route tree from the plan (§9): authed tab group with Home / Channels / Settings, plus the nested routes for channels, session groups, and session streams. Customize the tab bar with Liquid Glass, SF Symbol icons, and badge support. Every route renders a placeholder — subsequent tickets fill them in.

## What needs to happen

- Route tree via expo-router file structure:
  ```
  app/
    _layout.tsx                              — auth gate root
    (auth)/
      _layout.tsx
      sign-in.tsx                            — already exists from ticket 09
    (authed)/
      _layout.tsx                            — tabs layout
      index.tsx                              — Home placeholder
      channels/
        index.tsx                            — Channels list placeholder
        [id].tsx                             — Coding channel placeholder
      sessions/
        [groupId].tsx                        — Session group placeholder
        [groupId]/[sessionId].tsx            — Session stream placeholder
      settings.tsx                           — Settings placeholder
      sheets/
        _layout.tsx                          — registers every sheet child with `presentation: 'formSheet'`
  ```
  The `sheets/` segment's `_layout.tsx` declares `presentation: 'formSheet'` at route registration time because the `Sheet` layout primitive (ticket 12) can only dynamically update sheet options (`sheetAllowedDetents`, `sheetGrabberVisible`, etc.) via `setOptions` — `presentation` itself must be set when the route is registered. Sheet route files for subsequent tickets (e.g. `sheets/org-switcher.tsx` in ticket 18) go inside this segment.
- Custom tab bar (`apps/mobile/src/components/navigation/TabBar.tsx`, <200 lines):
  - Three tabs: Home (`bolt.horizontal`), Channels (`tray`), Settings (`gearshape`)
  - Background uses `Glass` primitive with `preset="tabBar"` (Liquid Glass on iOS 26+)
  - Active tab: accent tint; inactive: muted
  - Tap haptic: `selection`
  - Badge support (pass count prop; shown when >0)
  - Home tab badge is wired to the current `needs_input` count from the store; Channels and Settings stay unbadged in V1
- Configure expo-router stack headers per route:
  - Home: `largeTitle` mode (native iOS title collapse behavior via `react-native-screens`)
  - Channels list: `largeTitle` mode + search bar slot (search implementation in ticket 16)
  - Coding channel detail: regular title, back chevron
  - Session group: regular title, back chevron
  - Session stream: regular title (session name), back chevron, overflow menu slot
  - Settings: `largeTitle`
- Deep-link config in `app.json`:
  - Scheme: `trace`
  - Future: add `ios.associatedDomains` for universal links (ticket 28)
- Ensure swipe-back gesture works on all stacks (native, via `react-native-screens`).

## Dependencies

- [09 — Sign-in Flow](09-sign-in-flow-and-hydration.md)
- [12 — Surface Primitives (Glass)](12-surface-primitives-glass-sheet.md)
- [13 — Data Primitives (for tab icons)](13-data-primitives.md)

## Completion requirements

- [x] All routes exist with placeholder content
- [x] Tab bar uses Liquid Glass on iOS 26+
- [x] Tab switching works with haptic
- [x] Home tab badge reflects the current `needs_input` count; other tabs remain unbadged
- [x] Stack pushes and pops with native iOS transitions
- [x] Swipe-back gesture works on every stack screen
- [x] Navigation files total <200 lines each
- [x] Home tab uses `largeTitle` header (via `(home)` route group with inner Stack)
- [x] Settings tab uses `largeTitle` header (via `(settings)` route group with inner Stack)

## How to test

1. Launch app, verify three tabs at the bottom with glass effect.
2. Put one session into `needs_input` and verify the Home tab badge increments while the other tabs stay unbadged.
3. Tap each tab — haptic fires, content switches, title changes.
4. Navigate Channels → [id] → Session group → Session stream; swipe back works at each level.
5. Session stream URL deep link via `xcrun simctl openurl booted trace://sessions/test-group/test-session` opens the stream screen.
