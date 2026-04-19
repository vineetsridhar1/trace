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
  ```
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
- [11a — IconButton SF Symbols + Context Menu](11a-iconbutton-sf-symbols-context-menu.md) — tab-bar icons use SF Symbol names
- [12 — Surface Primitives (Glass)](12-surface-primitives-glass-sheet.md)
- [13 — Data Primitives (for tab icons)](13-data-primitives.md)

## Completion requirements

- [ ] All routes exist with placeholder content
- [ ] Tab bar uses Liquid Glass on iOS 26+
- [ ] Tab switching works with haptic
- [ ] Home tab badge reflects the current `needs_input` count; other tabs remain unbadged
- [ ] Stack pushes and pops with native iOS transitions
- [ ] Swipe-back gesture works on every stack screen
- [ ] Navigation files total <200 lines each

## How to test

1. Launch app, verify three tabs at the bottom with glass effect.
2. Put one session into `needs_input` and verify the Home tab badge increments while the other tabs stay unbadged.
3. Tap each tab — haptic fires, content switches, title changes.
4. Navigate Channels → [id] → Session group → Session stream; swipe back works at each level.
5. Session stream URL deep link via `xcrun simctl openurl booted trace://sessions/test-group/test-session` opens the stream screen.
