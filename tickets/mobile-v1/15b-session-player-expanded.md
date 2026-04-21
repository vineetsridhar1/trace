# 15b — Session Player (Primary Session Surface)

## Summary

The Session Player is the primary session surface for V1 — a bottom-sheet-style modal that slides up over whichever tab the user is on and renders the complete session experience (header, tab strip, stream, pending-input bar, queued-messages strip, composer). It is opened from four entry points: tapping a session-group row in Channels, tapping a card in the Active Sessions bottom accessory, following a deep link, and tapping a push notification.

> **Scope change from earlier drafts.** This ticket originally scoped the Player as a "preview-only" overlay on top of the Active Sessions accessory with a three-detent gesture model. V1 has since unified the Player and the Session Stream Screen — the Player renders the full session, not a preview. See plan §10.8 for the updated surface description.

## What needs to happen

- **Route / mount point:** the Player mounts at the root of the authed layout (not a sub-route) via `SessionPlayerOverlay` in `apps/mobile/src/components/navigation/`. It sits on top of the tab bar when open.
- **State (Zustand UI store):**
  - `overlaySessionId: string | null` — the session currently shown by the Player. Null = Player closed.
  - `sessionPlayerOpen: boolean` — open/close flag (derivable from `overlaySessionId != null` but kept explicit for animation coordination).
  - `activeAccessoryIndex: number` — the bottom accessory's pager position; **not** used by the Player.
- **Entry points:**
  - **Session group row tap (§10.4)** — `tryOpenSessionPlayer(latestSessionId)` sets `overlaySessionId` and opens the Player.
  - **Bottom accessory card tap (§9.2.1)** — same call; targets the active session under the tapped card.
  - **Deep link (§9.4)** — the stack route `app/(authed)/sessions/[groupId]/[sessionId].tsx` opens the Player on mount and can pop itself.
  - **Push notification tap (§14)** — handler calls `tryOpenSessionPlayer`.
- **UI composition (top-to-bottom, inside the Player panel):**
  - Grabber + chevron-down close button + pull-down-to-dismiss gesture.
  - `SessionSurface` — a shared composition rendering `SessionGroupHeader` + `SessionTabStrip` + `SessionStream`. The tab strip calls back into `setOverlaySessionId` to switch sibling sessions without closing the Player.
  - Pending-input bar / active-todo strip / queued-messages strip / input composer — all mount **inside** the Player as their respective tickets (22/23/24) land.
- **Gesture model (V1):**
  - Single detent — Player is either open (full-screen over tabs) or dismissed.
  - Pull-down past threshold (120pt or velocity > 800) dismisses.
  - Horizontal swipe across sessions is deferred to V2 (the tab strip handles within-group sibling switching; the bottom accessory handles across-group scrubbing while the Player is closed).
  - The earlier "playerAndList" / "Up Next" detent is dropped; the bottom accessory is the parallel-session surface.
- **Single-subscription invariant:** only the session pointed to by `overlaySessionId` has an active `sessionEvents` + `sessionStatusChanged` subscription; switching sessions (via the tab strip or any other path) tears down the previous subscription before starting the new one. The `useSessionEvents` hook (ticket 20) already behaves this way because it keys on `sessionId`.
- **Close behavior:** `closeSessionPlayer()` sets `sessionPlayerOpen = false`. `overlaySessionId` is preserved so reopening returns to the last session (reset on sign-out / org switch).

## Dependencies

- [15a — Active Sessions Accessory](15a-active-sessions-accessory.md) — one of the entry points
- [19 — Session Group Detail shell](19-session-group-detail-and-tab-strip.md) — provides `SessionGroupHeader` + `SessionTabStrip`
- [20 — Session Stream Shell](20-session-stream-shell-and-virtualization.md) — provides `SessionStream` + the single-subscription manager
- [12 — Surface Primitives (Glass)](12-surface-primitives-glass-sheet.md)
- [14 — Haptics + Motion](14-haptics-motion-dev-route.md)

## Completion requirements

- [x] `SessionPlayerOverlay` mounts at the root of the authed layout and renders over the tab bar
- [x] `overlaySessionId` state + `tryOpenSessionPlayer(sessionId)` + `closeSessionPlayer()` wired in `useMobileUIStore`
- [x] Entry: session group row tap opens the Player (works for any session, not just active)
- [x] Entry: bottom accessory card tap opens the Player
- [ ] Entry: deep link opens the Player (tracked by ticket 28)
- [ ] Entry: push notification tap opens the Player (tracked by tickets 26/28)
- [x] Player renders `SessionSurface` (`SessionGroupHeader` + `SessionTabStrip` + `SessionStream`)
- [x] Tab strip inside the Player switches sibling sessions via `setOverlaySessionId`, not by navigating
- [x] Single-subscription invariant preserved (inherited from `useSessionEvents`)
- [ ] Pending-input bar, active-todo strip, queued-messages strip, composer mount inside the Player (tracked by tickets 22, 23, 24)
- [x] Pull-down-to-dismiss gesture at 120pt / 800 velocity; backdrop tap dismisses
- [x] Every file in the player <200 lines

## How to test

1. Tap a session group row in Channels — Player opens showing that group's latest session with the full stream.
2. Open a group with >1 session — tab strip appears inside the Player; tapping a sibling swaps the shown session without dismissing the Player.
3. Tap a card in the bottom accessory — Player opens to that session.
4. With the Player open, pull down past the threshold — Player dismisses.
5. Confirm the `sessionEvents` WebSocket has exactly one active subscription at any moment as sessions switch.
6. Open a *done* / *merged* session via the row tap — Player still opens (the active-only gate is gone in V1).
