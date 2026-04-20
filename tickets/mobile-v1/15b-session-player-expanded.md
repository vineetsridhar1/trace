# 15b — Session Player (Expanded Modal)

## Summary

Tap the Active Sessions accessory (ticket 15a) to expand into a full-screen "Session Player" modal that sits on top of the tab bar. Three Reanimated detents drive the layout: **player-only** → **player + list** → **dismissed**. Horizontal swipe inside the player scrubs between active sessions (synced with the accessory's `activeAccessoryIndex`). Pull-down from the top reveals the in-progress list; a second pull-down dismisses. Everything runs on the UI thread via Reanimated worklets.

## What needs to happen

- **Route**: `app/(authed)/sheets/session-player.tsx` — registered under the existing `sheets/` formSheet group. Presentation is `formSheet` with the corner radius / detents driven by the `Sheet` primitive helper.
- **Gesture model** (Reanimated, UI-thread only):
  - Three detents: `"player"` (compact player) → `"playerAndList"` (player + in-progress list under it) → `"dismissed"` (closes the modal).
  - Pull-down from player → advance detent (player → playerAndList, then playerAndList → dismissed).
  - Horizontal swipe inside player → change `activeAccessoryIndex` (shared with 15a).
  - Close gestures + back swipe all route through the same `dismissPlayer()` action.
- **Single subscription invariant**:
  - Only one `sessionEvents` subscription is active at a time — the one for the session currently pointed to by `activeAccessoryIndex`. On index change, tear down the previous subscription before starting the new one (use the existing subscription manager in `useHydrate`/events layer).
- **UI structure** (top-to-bottom):
  - **Player card** (compact, always visible when open)
    - Session name, agent status dot, small play/pause or stop button (only if session is `active`)
    - Does **not** show the input composer in V1 (full composer stays in the session stream screen)
  - **In-progress list** (visible when detent is `playerAndList`)
    - Scrollable list of all active sessions — tap a row to snap the pager to that session
    - Does not include recently-done sessions in V1 (confirm below)
- **State** (Zustand UI store):
  - Extend `useMobileUIStore` with `playerOpen: boolean`, `playerDetent: "player" | "playerAndList"`, and setters.
  - Reuse `activeAccessoryIndex` from 15a — do not fork a separate player index.

## Open questions to confirm before implementing

- List reveal direction: up-from-below (pull down to reveal) vs. drop-from-top. Default in this ticket: **up-from-below** to match the iOS 26 Apple Music Now Playing pattern.
- Composer in player: default **no** for V1. The full composer lives in the session stream screen at `/sessions/[groupId]/[sessionId]`.
- Include recently-done sessions in the player's list: default **no** for V1 — player is strictly for currently-active sessions.

## Dependencies

- [15a — Active Sessions Accessory](15a-active-sessions-accessory.md) — provides the tap target and the shared index
- [12 — Surface Primitives (Sheet)](12-surface-primitives-glass-sheet.md)
- [14 — Haptics + Motion](14-haptics-motion-dev-route.md) — detent-change haptics
- [20 — Session Stream Shell](20-session-stream-shell-and-virtualization.md) — the single-subscription manager lives here

## Completion requirements

- [ ] `sheets/session-player.tsx` route registered under the existing formSheet layout
- [ ] Three-detent gesture (player / playerAndList / dismissed) running on the UI thread via Reanimated
- [ ] Horizontal swipe inside the player updates `activeAccessoryIndex` (shared with 15a accessory)
- [ ] Only one `sessionEvents` subscription is active at any moment (torn down on pager change)
- [ ] Player card shows session name, status, and stop-when-active action
- [ ] In-progress list reveals on pull-down (detent change) and reuses the same Zustand selector as 15a
- [ ] No composer in the player (V1 scope)
- [ ] Haptic on detent change: `light` at each boundary; `medium` on dismiss
- [ ] Every file in the player <200 lines (split into `SessionPlayerSheet.tsx`, `SessionPlayerCard.tsx`, `ActiveSessionsList.tsx` etc. as needed)

## How to test

1. Open the app with two active sessions.
2. Tap the accessory — player modal opens at the `"player"` detent.
3. Horizontal swipe the player card — `activeAccessoryIndex` changes, accessory below stays in sync.
4. Pull down — player stays, list appears below it at `"playerAndList"`.
5. Pull down again — modal dismisses.
6. Confirm the `sessionEvents` WebSocket only has one active subscription at any moment (verify via server logs or a debug panel).
7. With zero active sessions, verify neither the accessory nor the player can be opened (accessory returns `null`; no tap target).
