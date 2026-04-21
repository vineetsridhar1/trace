# 24 — Session Actions and Connection Handling

## Summary

The remaining session-screen actions: the header overflow menu (stop, copy link, open PR), confirmation sheets for destructive actions, and surfaced connection-state banners with retry. Completes the session-interaction loop.

## What needs to happen

- **Overflow menu on session header** (extends `SessionGroupHeader` from ticket 19):
  - Reuses the native context menu component; items vary by session state:
    - "Stop session" (destructive) — visible when `agentStatus === 'active'`
    - "Open PR" — visible when `prUrl` is set
    - "Copy link" — always visible: copies `trace://sessions/{groupId}/{sessionId}`
    - "Archive workspace" (destructive) — archives the entire group (at group screen level, not session)
- **Stop confirmation sheet** (`app/(authed)/sheets/confirm-stop-session.tsx`):
  - Native iOS-style confirmation sheet (small detent).
  - Title: "Stop this session?", subtitle: "The agent will stop working. You can't resume after stopping.", two buttons: "Stop" (destructive, haptic heavy) and "Cancel".
  - Confirm: dispatches `dismissSession` mutation (V1 uses `dismiss` rather than `terminate` — matches the behavior web's SessionInput uses in the corresponding flow).
- **Connection-lost / restored handling**:
  - The `ConnectionLostBanner` node (from ticket 21) is one representation.
  - Additionally, when `session.connection.state === 'lost'`, the composer input is **disabled** and shows "Session offline — retry to reconnect" caption above the input.
  - A tiny "Retry" button next to the caption: fires `retrySessionConnection` mutation.
  - When `canRetry === false`, disabled + error-tint.
- **Error surfacing**:
  - If the session has a recent `lastError`, display a small non-blocking error card pinned below the pending-input bar (or at the top if no pending-input): "Something went wrong: {lastError}". Tap to dismiss (local only).
  - Retry button if `canRetry === true`.
- **Unauthorized (401) handling on focused subscriptions** (carried over from ticket 20): `useSessionEvents` currently logs errors but does not handle `isUnauthorized` like `useHydrate.ts` does. Port the same pattern so a token expiring mid-session tears down the focused subscription, resets the entity store, and punts to the sign-in screen.

## Dependencies

- [19 — Session Group Header](19-session-group-detail-and-tab-strip.md)
- [21 — Connection Lost Banner node](21-session-message-node-renderers.md)
- [23 — Input Composer](23-session-input-and-queued-messages.md)

## Completion requirements

- [ ] Overflow menu shows correct items per state
- [ ] Stop confirmation sheet dispatches dismissSession on confirm
- [ ] Composer disables when connection lost; re-enables when restored
- [ ] Retry action triggers reconnection mutation
- [ ] Error card surfaces lastError and allows retry
- [ ] All files <200 lines

## How to test

1. Active session → overflow → Stop → confirm sheet → Stop → session moves to `done`, composer disables.
2. Force connection loss on server → mobile shows connection-lost banner + composer disabled + retry action.
3. Tap Retry → `retrySessionConnection` fires → connection restored → composer re-enables.
4. Simulate a runtime error (server returns `lastError`) → error card appears → tap retry → mutation fires.
