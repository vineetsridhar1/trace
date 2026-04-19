# 32 — Empty, Error, and Keyboard State Review

## Summary

Ensure every screen handles empty data, load failures, network errors, and keyboard-up states correctly. This closes the gap between "works on the happy path" and "robust in real-world conditions."

## What needs to happen

- **Empty states** — per-screen audit:
  - Home: covered (ticket 25) — "All clear"
  - Channels: "No coding channels yet" (ticket 16)
  - Coding channel (each segment): "Nothing active / merged / archived"
  - Session stream: "Waiting for agent to start…" when no events yet
  - Org switcher: N/A (user always has ≥1 org)
  - Every empty state uses the `EmptyState` primitive (ticket 13)
- **Error states**:
  - Generic GraphQL error (non-auth): inline error card with "Retry" action where applicable
  - Network disconnection: global banner at top of app "No internet" + retry icon
  - Auth error (401): redirect to sign-in (already covered in ticket 09)
  - Rate-limit / 429: "Too many requests, try again shortly" with a backoff
  - Session-specific error: `lastError` card (covered in ticket 24)
  - Offline send/queue failure: keep the current draft visible in the session composer, mark it failed inline, and offer retry while the screen stays mounted (no cross-launch persistence in V1)
  - Push registration failure: silent retry, no user-facing error
- **Keyboard-up behavior** — per screen:
  - Session stream composer: ✅ (ticket 23)
  - Sign-in: no input in V1, N/A
  - Any future input fields must be inside `<KeyboardAvoidingView>` (or react-native-keyboard-controller replacement)
  - Tapping outside a focused input dismisses keyboard
- **Network status hook** (`useNetworkStatus.ts`, <50 lines):
  - Wraps `@react-native-community/netinfo`
  - Exposes `isConnected` and `type`
  - Global banner at top of authed root when offline (Liquid Glass dim variant)
- **Stale data indicator**: if ambient subscription WS disconnected for >10s, banner: "Reconnecting…" with subtle pulse.

## Dependencies

- All M1–M5 tickets complete.
- Install: `@react-native-community/netinfo`

## Completion requirements

- [ ] Every screen has a tested empty state
- [ ] Global network-offline banner works
- [ ] Subscription-disconnected banner works
- [ ] Every input field correctly avoids keyboard
- [ ] GraphQL error paths show user-meaningful messages
- [ ] Offline send/queue failure preserves the draft and exposes retry without introducing a durable outbox

## How to test

1. Fresh org with zero data → empty states appear on every screen.
2. Turn on airplane mode → offline banner appears; sessions can still be viewed (from cache).
3. Attempt to send or queue a message while offline → draft stays visible, failed state appears, retry works after reconnect.
4. Force server to return 500 on a query → error card shows with retry.
5. Cause WS disconnection (server restart) → reconnecting banner; resolves when back.
