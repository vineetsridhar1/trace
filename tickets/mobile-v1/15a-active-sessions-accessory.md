# 15a — Active Sessions Tab Bar Accessory

## Summary

Replace the `FakeSessionAccessory` stub wired in ticket 15 with a real, data-driven mini accessory that rides in the native `UITabBarController`'s `.tabViewBottomAccessory` slot on iOS 26+. Shows the user's currently-in-progress sessions as a horizontal pager; taps expand to the full Session Player (ticket 15b). Hides cleanly when there are no active sessions so the tab bar collapses back to its normal height.

## What needs to happen

- **Data selector** (Zustand):
  - A `selectActiveSessions(state)` selector over `useEntityStore` returns every session the user is still interacting with: **exclude `sessionStatus === "merged"`, `agentStatus === "failed"`, and sessions whose `sessionGroup` is archived**. Include everything else (`in_progress`, `needs_input`, `in_review`, `done`, `not_started`, `stopped`). Sort by `_sortTimestamp` descending. Memoize via `useShallow`.
  - When `activeSessions.length === 0`, the accessory component returns `null`. Keep `renderBottomAccessoryView` **always passed** (and identity-stable) on `NativeTabs` — toggling the prop on/off crashes with `UIViewControllerHierarchyInconsistency` because `react-native-bottom-tabs` rebuilds the native `TabHostingController` while a child `RNSNavigationController` is still attached. Library limitation: when JS returns `null`, the native slot still reserves its default height; with the broader filter above, the empty case is rare enough to live with in V1.
- **Shared pager index** (Zustand UI store):
  - Add `activeAccessoryIndex: number` to `useMobileUIStore` with `setActiveAccessoryIndex(i)` action.
  - This is the single source of truth for which session is shown in the accessory *and* in the expanded player (ticket 15b) — pulling in the player must not reset or fork pager position.
- **`ActiveSessionsAccessory` component** (`src/components/navigation/ActiveSessionsAccessory.tsx`, <200 lines):
  - Horizontal `FlatList` / `ScrollView` (paginated, snap-to-item) over active sessions
  - Per-session row: SF Symbol + session name + 1-line subtitle ("Agent · N steps · status") + up-chevron hint
  - Drives `activeAccessoryIndex` on scroll via `onMomentumScrollEnd`
  - Tap → open the Session Player modal (ticket 15b). Until 15b lands, no-op with a TODO comment.
  - No `Glass` wrapper — UITabBar wraps the accessory in the native material automatically.
- **Wire in `(authed)/_layout.tsx`**:
  - Replace `renderBottomAccessoryView={() => <FakeSessionAccessory />}` with `() => <ActiveSessionsAccessory />`.
  - Delete `FakeSessionAccessory.tsx`.
- **minimizeBehavior regression check** — upstream issue #496 can make the accessory jitter inside a nested Stack. If it bites, prefer `minimizeBehavior="automatic"` and document the reason next to the prop.

## Dependencies

- [15 — Navigation Skeleton](15-navigation-tabs.md) — wires the slot and ships the stub
- [04 — Events + Mutations](04-extract-events-and-mutations.md) — sessions live in the entity store

## Completion requirements

- [ ] `ActiveSessionsAccessory` renders one pager card per active session, driven off the entity store
- [ ] Accessory returns `null` when no active sessions (prop stays passed to avoid a native-VC rebuild crash)
- [ ] `activeAccessoryIndex` lives in `useMobileUIStore` and is updated by pager scroll
- [ ] Tap on a session invokes the placeholder player open handler (real wiring in 15b)
- [ ] `FakeSessionAccessory.tsx` deleted
- [ ] No manual `Glass` wrapper — native UITabBar material only
- [ ] `minimizeBehavior` does not cause jitter when used with our nested Stack layout (test; document if we switch to `"automatic"`)
- [ ] Component file <200 lines

## How to test

1. With zero active sessions: tab bar renders normal height, no accessory visible.
2. Put one session into `active`: accessory appears with that session's info.
3. Add a second active session: pager has two pages, swipe horizontally — `activeAccessoryIndex` updates.
4. Resolve the first session (agentStatus → done): accessory drops back to a single page, pager snaps back to the still-active session.
5. Scroll the underlying Home screen — both the tab bar and accessory minimize together.
