# 15 — Expo Router Tabs & Navigation Skeleton

## Summary

Wire up the full route tree from the plan (§9): authed tab group with Home / Channels / Settings, plus the nested routes for channels, session groups, and session streams. Use **`NativeBottomTabs`** (`react-navigation`'s native iOS tab bar — wraps the real `UITabBarController` / `UITabBar`) so we get genuine Apple chrome, free Liquid Glass on iOS 26+, and the `bottomAccessory` slot used by ticket 15a. Every route renders a placeholder — subsequent tickets fill them in.

## What needs to happen

- Route tree via expo-router file structure:
  ```
  app/
    _layout.tsx                              — auth gate root
    (auth)/
      _layout.tsx
      sign-in.tsx                            — already exists from ticket 09
    (authed)/
      _layout.tsx                            — NativeBottomTabs layout
      index.tsx                              — Home placeholder
      channels/
        index.tsx                            — Channels list placeholder
        [id].tsx                             — Coding channel placeholder
      sessions/
        [groupId].tsx                        — Session group placeholder
        [groupId]/[sessionId].tsx            — Session stream placeholder
      settings.tsx                           — Settings placeholder
      (modal)/
        session-player.tsx                   — placeholder for ticket 15b
  ```
- Tabs (`apps/mobile/src/components/navigation/AuthedTabsLayout.tsx`, <200 lines) using `NativeBottomTabs` (or expo-router's `NativeTabs` sugar):
  - Three tabs: Home (`bolt.horizontal`), Channels (`tray`), Settings (`gearshape`) — passed as SF Symbol names so UIKit renders them natively.
  - **Liquid Glass and tab-bar morph behavior come from UITabBar automatically** on iOS 26+. We do **not** wrap the tab bar in our `Glass` primitive.
  - Active tint: theme `accent`. Inactive: system default (UIKit picks an appropriate muted tone).
  - Tab tap haptic: `selection` (wired via `tabPress` event).
  - Badge support: pass numeric badges through the `NativeBottomTabs` API. Home tab badge mirrors the current `needs_input` count from the entity store; Channels and Settings stay unbadged in V1.
  - `bottomAccessory` slot wired up to render `<ActiveSessionsAccessory placement={placement} />` from ticket 15a (returns `null` when no active sessions, so the slot collapses cleanly).
- Configure stack headers per route:
  - Home: `largeTitle` mode (native iOS title collapse via `react-native-screens`)
  - Channels list: `largeTitle` mode + search bar slot (search implementation in ticket 16)
  - Coding channel detail: regular title, back chevron
  - Session group: regular title, back chevron
  - Session stream: regular title (session name), back chevron, overflow menu slot
  - Settings: `largeTitle`
- Deep-link config in `app.json`:
  - Scheme: `trace`
  - Future: add `ios.associatedDomains` for universal links (ticket 28)
- Ensure swipe-back gesture works on all stacks (native, via `react-native-screens`).
- iOS 26+ note: confirm `NativeBottomTabs` exposes `bottomAccessory`, `tabBarMinimizeBehavior`, and SF Symbol icons. If a gap exists during the spike, fall back to the previously-planned custom tab bar with `Glass preset="tabBar"` and surface the gap in the ticket comment so 15a can adapt.

## Dependencies

- [09 — Sign-in Flow](09-sign-in-flow-and-hydration.md)
- [13 — Data Primitives (for tab icons)](13-data-primitives.md)
- Install: `react-native-screens` (already required), confirm version supports `NativeBottomTabs` + `bottomAccessory`

## Completion requirements

- [ ] All routes exist with placeholder content
- [ ] Tabs render via `NativeBottomTabs` (real `UITabBar`); Liquid Glass appears automatically on iOS 26+
- [ ] Tab switching works with `selection` haptic
- [ ] Home tab badge reflects the current `needs_input` count; other tabs remain unbadged
- [ ] `bottomAccessory` slot exists and renders the placeholder from ticket 15a (or `null` when no active sessions)
- [ ] Stack pushes and pops with native iOS transitions
- [ ] Swipe-back gesture works on every stack screen
- [ ] Navigation files total <200 lines each

## How to test

1. Launch app on iOS 26 simulator/device — verify three tabs at the bottom rendered by UIKit (genuine Liquid Glass, not our Glass primitive).
2. Launch app on iOS 17–25 — verify tabs still render with the system's pre-Liquid-Glass appearance (no breakage).
3. Put one session into `needs_input` and verify the Home tab badge increments while the other tabs stay unbadged.
4. Tap each tab — haptic fires, content switches, title changes.
5. Navigate Channels → [id] → Session group → Session stream; swipe back works at each level.
6. Session stream URL deep link via `xcrun simctl openurl booted trace://sessions/test-group/test-session` opens the stream screen.
7. With at least one active session, verify the `bottomAccessory` placeholder appears above the tab bar.
