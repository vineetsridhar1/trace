# 15b — Session Player (Expanded Modal)

## Summary

Tap-to-expand "session player" modal that slides up from the tab bar accessory. The user can:
- **Swipe left/right** to scrub between in-progress sessions (same set as the accessory).
- **Swipe down** to reveal a list of all in-progress sessions; from the list, swipe down again to dismiss the modal entirely.
- **Tap "Open full session"** to navigate into the regular session stream screen.

Inspired by Apple Music's now-playing screen.

## Interaction model

Two-detent custom Reanimated sheet. The modal has three resting states:

1. **Player only** (initial, after tap on accessory) — pager fills the screen; the in-progress sessions list is hidden below the visible area.
2. **Player + list** (after a downward drag past the first threshold) — the pager scales/translates up to make room; the list panel slides up from the bottom into ~50% of the screen.
3. **Dismissed** (after a downward drag from state 2, or a downward drag past the second threshold from state 1, or a tap on the grabber).

Velocity-based snap decisions, just like native iOS sheets.

> **Note on the "swipe down" gesture:** the user-facing description ("swipe down to see the list") maps to a downward drag on the pager content. Visually, the pager moves down/shrinks slightly and the list slides up from underneath. If the spec wants the list to actually drop down from the top instead, this is a layout-only swap — the gesture and state-machine stay identical.

## What needs to happen

- New route `app/(authed)/(modal)/session-player.tsx` (placeholder created in ticket 15):
  - Presentation: custom Reanimated transition (slide up from accessory position). Use `presentation: "transparentModal"` so the previous screen remains visible underneath while we animate.
  - On open: read `useUIStore.activeAccessoryIndex` and prime the pager to that page.
  - On close: leaves `activeAccessoryIndex` unchanged (so the accessory continues showing the same session).
- New screen composition `apps/mobile/src/components/session-player/SessionPlayerScreen.tsx` (~100 lines):
  - Vertical layout: `<DragHandle />`, `<SessionPager />`, `<ActiveSessionList />` (positioned below, revealed via gesture).
  - Owns the Reanimated `sharedValue` for the modal's vertical translation + list-reveal progress.
  - Wires the `useSessionPlayerGestures()` hook for the pan handler.
- New component `apps/mobile/src/components/session-player/SessionPager.tsx` (<200 lines):
  - Horizontal `react-native-pager-view` of `<ExpandedSessionCard sessionId={id} />`.
  - On page change → `setActiveAccessoryIndex` (same store as accessory).
  - On `activeAccessoryIndex` change from store → imperatively set page (so list-tap and accessory both can drive it).
  - Vertical pan inside the pager (using `simultaneousHandlers` with the horizontal pager): forwards y-translation to the parent reveal progress.
- New component `apps/mobile/src/components/session-player/ExpandedSessionCard.tsx` (<200 lines):
  - Reads session via `useEntityField('session', id, ...)` for fine-grained re-renders.
  - Subscribes to `sessionEvents` only for the **currently centered** session (via the active index) to avoid N parallel subscriptions. Use `useSessionEvents(activeSessionId)` mounted at the screen level, not per-card.
  - Layout:
    - Large session title + branch (mono)
    - Status chip + animated `StatusDot`
    - Current todo strip (if available) — same renderer as ticket 22's active todo strip
    - Last 1–2 events preview (assistant message excerpt, last tool call summary)
    - Quick-action row: `Stop`, `Open PR` (if `prUrl`), `Open full session` (primary)
  - "Open full session" → `router.push('/sessions/[groupId]/[sessionId]')` then dismiss the modal.
  - "Stop" → confirmation sheet → `dismissSession` mutation (reuse helper from ticket 24 once it lands; until then, stub with a toast).
- New component `apps/mobile/src/components/session-player/ActiveSessionList.tsx` (<200 lines):
  - `FlashList` of all in-progress sessions (same `useActiveSessions()` hook from 15a).
  - Each row: status dot, name, branch (mono), relative timestamp, trailing chevron.
  - The currently-centered session is visually highlighted (accent tint + check icon).
  - Tap row → `setActiveAccessoryIndex(index)` and animate the reveal back to "player only" detent.
  - Liquid Glass background (preset `sessionPlayer` added to `theme/glass.ts` via this ticket; falls back to solid surface on iOS <26).
- New gesture hook `apps/mobile/src/hooks/useSessionPlayerGestures.ts` (<200 lines):
  - Reanimated worklet bundle: vertical pan gesture, snap detents, dismiss decision.
  - Detents (relative to screen height): `0` (player only), `0.5` (player + list), `1` (dismissed).
  - Snap thresholds: pull-distance > 80pt OR velocity > 600 → advance to next detent; below threshold → spring back.
  - Returns `{ panGesture, contentStyle, listStyle, opacity }` for the screen to apply.
  - Uses `gestureHandlerRootHOC` and runs entirely on the UI thread.
- New `theme/glass.ts` preset entry: `sessionPlayer` (large surface; intensity slightly higher than `pinnedBar` for separation from the underlying screen). Theme is in ticket 10 (already shipped); we extend the consumer side here without modifying ticket 10 (the user has marked 1–10 done). We add the new preset value to `theme/glass.ts` as a small additive change — note this in the ticket if the preset doesn't already exist.
- Haptic map:
  - `selection` on horizontal page change
  - `light` on snap to "player + list" detent
  - `medium` on snap to dismiss
- Performance:
  - Pager + reveal animation runs at 60/120fps (UI-thread only); zero JS bridging during gesture.
  - Subscribe to `sessionEvents` for **only one session at a time** (the centered one); unsubscribe on page change. Other cards render from the store snapshot at last subscription.
  - File splits keep every file <200 lines.

## Open questions to confirm before implementation

1. Reveal direction: list slides **up from below** (current plan) vs. drops **down from above** when the user pulls the player down. Default is the up-from-below interpretation; flip if the spec disagrees.
2. Should the player include the input composer (so the user can send a message without leaving the player)? V1 default: **no** — player is a glance/control surface; full composer lives in the session stream screen reached via "Open full session". Easier to add later than to remove.
3. Should the list also include `done`/`recently completed` sessions (like Apple Music's "history" pull-up)? V1 default: **no** — only in-progress.

## Dependencies

- [15a — Tab Bar Accessory](15a-active-sessions-tab-bar-accessory.md) (shares `useActiveSessions`, `activeAccessoryIndex`)
- [13 — Data Primitives](13-data-primitives.md) (StatusDot, Chip)
- [12 — Surface Primitives](12-surface-primitives-glass-sheet.md) (Glass for the list panel + drag handle)
- [22 — Pending-Input + Todo Bars](22-pending-input-and-active-todo-bars.md) — todo strip renderer reused inside the expanded card (soft dependency: stub if 22 hasn't landed)
- [24 — Session Actions](24-session-actions-and-connection-handling.md) — "Stop" action handler (soft dependency: stub until 24 lands)
- Install: `react-native-reanimated` v3 (already required), `react-native-gesture-handler` (already required), `react-native-pager-view` (added in 15a)

## Completion requirements

- [ ] Tapping the accessory opens the player with the currently-centered session focused
- [ ] Horizontal swipe scrubs between sessions; the index syncs back to the accessory after dismiss
- [ ] Pull-down on the pager reveals the session list with a snap detent
- [ ] Pull-down from the "list visible" state dismisses the modal
- [ ] Tap on the drag handle / grabber dismisses the modal directly
- [ ] Tap a row in the list switches the active page (animates back to player-only detent)
- [ ] "Open full session" navigates to the session stream screen and dismisses the modal
- [ ] Animations run on the UI thread (no frame drops on iPhone 13+)
- [ ] Only one `sessionEvents` subscription is open at a time
- [ ] All files <200 lines

## How to test

1. With ≥1 active session, tap the accessory: verify slide-up animation aligns visually with the accessory's origin.
2. Swipe horizontally — page changes; dismiss; verify the accessory shows the same session you ended on.
3. Pull the pager down a small distance — list peeks; release before threshold — snaps back.
4. Pull down past the threshold — snaps to the "list visible" detent.
5. From the list-visible state, pull down again — modal dismisses with `medium` haptic.
6. Tap the drag handle in the player-only state — modal dismisses immediately.
7. Tap a row in the list — pager snaps to that session's page; reveal animates back to player-only.
8. Tap "Open full session" — lands on the session stream screen; the modal is no longer visible.
9. Add/remove an active session while the player is open — the list and pager update without flicker.
10. Profile on a device: vertical reveal + horizontal scrub do not drop frames.
