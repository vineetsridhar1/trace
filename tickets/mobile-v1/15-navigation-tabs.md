# 15 — Expo Router Tabs & Navigation Skeleton

## Summary

Wire up the full route tree from the plan (§9): authed tab group with Home / Channels / Settings, plus the nested routes for channels, session groups, and session streams. Use the **native** `UITabBarController` (via `react-native-bottom-tabs` + `@bottom-tabs/react-navigation`) so iOS 26 Liquid Glass, tab-switch animations, haptics, minimize-on-scroll, and the bottom-accessory slot come from UIKit rather than a custom JS tab bar. Every route renders a placeholder — subsequent tickets fill them in.

## What needs to happen

- **Dependencies** (added in `apps/mobile/package.json`):
  - `react-native-bottom-tabs` — native `UITabBarController` component + codegen
  - `@bottom-tabs/react-navigation` — react-navigation adapter that `withLayoutContext` can wrap
  - `"react-native-bottom-tabs"` added to `expo.plugins` in `app.json`
- Route tree via expo-router file structure:
  ```
  app/
    _layout.tsx                              — auth gate root
    (auth)/
      _layout.tsx
      sign-in.tsx                            — already exists from ticket 09
    (authed)/
      _layout.tsx                            — native tabs layout
      (home)/
        _layout.tsx                          — Stack for Home (largeTitle)
        index.tsx                            — Home placeholder
      channels/
        _layout.tsx                          — Stack for Channels (largeTitle + search slot)
        index.tsx                            — Channels list placeholder
        [id].tsx                             — Coding channel placeholder
      sessions/
        _layout.tsx                          — Stack (back chevron)
        [groupId].tsx                        — Session group placeholder
        [groupId]/[sessionId].tsx            — Session stream placeholder
      (settings)/
        _layout.tsx                          — Stack for Settings (largeTitle)
        index.tsx                            — Settings placeholder
      sheets/
        _layout.tsx                          — registers every sheet child with `presentation: 'formSheet'`
  ```
  Home and Settings each live under a pathless group (`(home)`, `(settings)`) so they can have their own Stack + `headerLargeTitle`. The `sheets/` segment's `_layout.tsx` declares `presentation: 'formSheet'` at route registration time because the `Sheet` primitive (ticket 12) can only dynamically update sheet options via `setOptions` — `presentation` must be set when the route is registered. Sheet route files for subsequent tickets (e.g. `sheets/org-switcher.tsx` in ticket 18) go inside this segment.
- **`(authed)/_layout.tsx`** — native tabs navigator:
  - Use `createNativeBottomTabNavigator().Navigator` and wrap with `withLayoutContext` so expo-router's file-based routing talks to the native navigator.
  - Three visible tabs: Home (`bolt.horizontal`), Channels (`tray`), Settings (`gearshape`) via `tabBarIcon: () => ({ sfSymbol: "..." })`.
  - Home tab badge — `tabBarBadge: String(count)` from a Zustand selector over `needs_input` sessions. Channels and Settings stay unbadged in V1.
  - Non-tab routes (`sessions`, `sheets`) declared as `NativeTabs.Screen` with `{ tabBarItemHidden: true }` so they're routable but not in the tab bar.
  - `minimizeBehavior="onScrollDown"` on the navigator so screens with a scroll view collapse the bar + accessory (known nested-Stack edge case: upstream issue #496 — track in 15a if it bites).
  - `renderBottomAccessoryView` slot wired in this ticket with a stub preview. Real accessory content lands in ticket 15a.
- **Per-tab stacks** (each `_layout.tsx`):
  - Home: `headerLargeTitle: true`
  - Channels list: `headerLargeTitle: true` + `headerSearchBarOptions` (search implementation in ticket 16)
  - Channel detail: regular title, back chevron
  - Session group: regular title, back chevron
  - Session stream: regular title (session name), back chevron, overflow menu slot (ticket 24)
  - Settings: `headerLargeTitle: true`
- **`TopBarPill`** (`src/components/navigation/TopBarPill.tsx`):
  - Renders a row of `Pressable`s (icon action buttons) + an optional trailing `Avatar`, with no manual `Glass` wrapper — iOS 26's native-stack header wraps `headerRight` content in its own Liquid Glass capsule automatically. Pre-iOS 26 it renders as a plain row.
  - Wired via `headerRight` on the Home/Channels/Settings stacks.
- **Deep-link config** in `app.json`:
  - Scheme: `trace`
  - Future: add `ios.associatedDomains` for universal links (ticket 28)
- Ensure swipe-back gesture works on all stacks (native, via `react-native-screens`).
- **Not using our `Glass` primitive for the tab bar.** The `Glass` preset `tabBar` was removed from `theme/glass.ts` — UITabBar provides its own Liquid Glass material. `Glass` remains for the remaining nav, input, pinnedBar, and card surfaces.

## Dependencies

- [09 — Sign-in Flow](09-sign-in-flow-and-hydration.md)
- [12 — Surface Primitives (Glass)](12-surface-primitives-glass-sheet.md) — still used for header/input/pinned surfaces
- [13 — Data Primitives (for Avatar in TopBarPill)](13-data-primitives.md)

## Completion requirements

- [x] Native bottom tabs wired via `react-native-bottom-tabs` + `@bottom-tabs/react-navigation` + `withLayoutContext`
- [x] All routes exist with placeholder content
- [x] Tab bar uses Liquid Glass on iOS 26+ (provided by native UITabBar)
- [x] Tab switching works with haptic (native, provided by UITabBar)
- [x] Home tab badge reflects the current `needs_input` count; other tabs remain unbadged
- [x] Stack pushes and pops with native iOS transitions
- [x] Swipe-back gesture works on every stack screen
- [x] Navigation files total <200 lines each
- [x] Home tab uses `largeTitle` header (via `(home)` route group with inner Stack)
- [x] Settings tab uses `largeTitle` header (via `(settings)` route group with inner Stack)
- [x] `TopBarPill` renders in `headerRight` as a native-wrapped glass pill (no double-Glass)
- [x] `renderBottomAccessoryView` slot is wired (stubbed preview; replaced by real content in ticket 15a)
- [x] `minimizeBehavior="onScrollDown"` configured (real verification comes when a tab screen has real scrollable content)

## Follow-ups

- **15a** — replace the stub `FakeSessionAccessory` with a real active-sessions pager
- **15b** — tap-to-expand Session Player modal launched from the accessory

## How to test

1. Launch app, verify three tabs at the bottom with native UITabBar + iOS 26 Liquid Glass (if on iOS 26).
2. Put one session into `needs_input` and verify the Home tab badge increments while the other tabs stay unbadged.
3. Tap each tab — native haptic fires, content switches, title changes.
4. Navigate Channels → [id] → Session group → Session stream; swipe back works at each level.
5. Session stream URL deep link via `xcrun simctl openurl booted trace://sessions/test-group/test-session` opens the stream screen.
6. Scroll the Home screen — tab bar + bottom accessory collapse via native `minimizeBehavior`.
7. On iOS 26+: confirm `headerRight` content in Home/Channels/Settings renders inside a single native glass pill (not double-wrapped).
