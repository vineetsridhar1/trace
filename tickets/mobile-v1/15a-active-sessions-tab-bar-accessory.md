# 15a — Active Sessions Tab Bar Accessory (Mini)

## Summary

Render a Liquid Glass mini-player above the system tab bar showing the user's currently in-progress sessions, using `NativeBottomTabs`'s `bottomAccessory` slot (iOS 26+). The user can swipe horizontally to scrub between sessions and tap to expand into the full session player (ticket 15b). Behaves and feels like Apple Music's now-playing mini bar.

## Scope decision: which sessions appear?

For V1 the accessory shows sessions where `agentStatus === 'active' OR sessionStatus === 'needs_input'`, owned by the current user, sorted by `_sortTimestamp` desc. Rationale: both are "in-flight" from the user's perspective — the agent is either working or paused waiting on the user. If product wants `active`-only, it's a one-line change to the selector.

## What needs to happen

- New mobile UI store slice in `apps/mobile/src/stores/ui.ts` (or co-located with related UI state):
  - `activeAccessoryIndex: number` — which active session is currently centered in the pager
  - Setter: `setActiveAccessoryIndex(index: number)`
  - Reconciler: `reconcileActiveAccessoryIndex(activeIds: string[])` — called when the active set changes; preserves the same session id if still present, else clamps to nearest valid index, else resets to 0
- New shared selector hook `useActiveSessions()` in `apps/mobile/src/hooks/useActiveSessions.ts`:
  - Memoized Zustand selector over the entity store
  - Returns `{ sessions: Session[], ids: string[] }` (ids derived for cheap equality)
  - Filter: `agentStatus === 'active' || sessionStatus === 'needs_input'`, owned by current user
  - Sort: `_sortTimestamp` desc
  - Used by both the accessory (this ticket) and the expanded player (15b)
- New component `apps/mobile/src/components/navigation/ActiveSessionsAccessory.tsx` (<200 lines):
  - Props: `placement: 'regular' | 'inline'`
  - Renders a horizontal `react-native-pager-view` of active sessions
  - **Important per React Navigation docs:** `bottomAccessory` is rendered twice (once per placement). All shared state (active index, page sync) MUST live in the Zustand UI store, not local state.
  - On page change → call `setActiveAccessoryIndex(newIndex)` (haptic `selection`)
  - On `activeAccessoryIndex` change from store → imperatively scroll the pager to that page (so the regular and inline versions stay in lock-step)
  - Tap (anywhere on a card) → push the modal route `/session-player` (ticket 15b)
  - Long-press → native context menu (`react-native-context-menu-view`): "Stop session", "Open PR" (if `prUrl`), "Copy link"
- New components `apps/mobile/src/components/navigation/AccessorySessionCard.regular.tsx` and `.inline.tsx`:
  - **Regular** (full-size, used when placement is `regular`):
    - One row: animated `StatusDot` (pulses when `agentStatus === 'active'`), session name (truncate), current todo or last activity preview (truncate), trailing chevron
    - Theme: respects safe area + accessory padding from UIKit
  - **Inline** (compact, used when placement is `inline` after `tabBarMinimizeBehavior` collapses the tab bar on scroll):
    - Animated `StatusDot` + session name only (no preview, no chevron)
- Wire `bottomAccessory` into `(authed)/_layout.tsx`:
  ```tsx
  <NativeTabs
    bottomAccessory={({ placement }) =>
      activeIds.length > 0
        ? <ActiveSessionsAccessory placement={placement} />
        : null
    }
  >
    {/* tabs */}
  </NativeTabs>
  ```
  - Returning `null` when no active sessions hides the accessory; UITabBar animates the appearance/disappearance for free.
- Subscribe to `useActiveSessions()` at the layout level so `activeIds.length > 0` reacts live.
- iOS <26 fallback: `bottomAccessory` simply doesn't render (system no-op). The accessory is iOS 26+ only in V1 — this is acceptable because the data is also accessible from Home and Channels.

## Dependencies

- [15 — Navigation Skeleton](15-navigation-tabs.md)
- [13 — Data Primitives](13-data-primitives.md) (StatusDot, Chip)
- [09 — Sign-in + Hydration](09-sign-in-flow-and-hydration.md) (entity store populated)
- Install: `react-native-pager-view`, `react-native-context-menu-view`

## Completion requirements

- [ ] Accessory renders above the tab bar on iOS 26+ with system Liquid Glass
- [ ] Accessory hides cleanly when no active sessions exist (UITabBar animates the removal)
- [ ] Horizontal pager works with paging snap and `selection` haptic on page change
- [ ] `regular` and `inline` placements stay in sync via the Zustand UI store (no drift after the tab bar collapses on scroll)
- [ ] Tap routes to `/session-player` modal (ticket 15b)
- [ ] Long-press opens a native context menu with the documented actions
- [ ] Status dot pulses when the centered session is `agentStatus === 'active'`
- [ ] Live updates from `orgEvents` — when a new session becomes active, it appears in the pager; when one ends, the index reconciles without crashing
- [ ] All files <200 lines

## How to test

1. Sign in with at least one active session. Verify the accessory appears above the tab bar with Liquid Glass on an iOS 26 device.
2. Start additional sessions. Pager gains pages; swipe between them; haptic fires on page change.
3. Stop a session. Accessory pages reduce; index reconciles to the nearest valid session (no crash, no blank page).
4. Stop all sessions. Accessory disappears with a UITabBar animation.
5. Scroll a long list to trigger `tabBarMinimizeBehavior` (if enabled) — verify the inline placement appears with the same active session and that horizontal swipes there move the same shared index.
6. Long-press a card → context menu appears with Stop / Open PR / Copy link.
7. Tap a card → expanded session player opens (covered by ticket 15b).
8. iOS 17 simulator: app boots fine, accessory simply doesn't render.
