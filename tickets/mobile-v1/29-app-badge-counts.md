# 29 — App Badge Counts

## Summary

The iOS app badge reflects the count of sessions in `needs_input` for the active org. Updated both client-side (as events arrive via the ambient subscription) and server-side (`badge` field in push payloads — ticket 27 already includes this). Clears when the user addresses the pending input.

## What needs to happen

- **Client-side badge update**:
  - In `apps/mobile/src/hooks/useBadgeSync.ts` (<100 lines):
    - Derive the needs-input count via a Zustand selector: `sessions.filter(s => s.sessionStatus === 'needs_input' && s.createdBy.id === currentUserId).length`.
    - Whenever the count changes, call `Notifications.setBadgeCountAsync(count)`.
  - Mount this hook in the authed `_layout.tsx` so it runs for the session duration.
- **Clear on sign-out**: setBadgeCountAsync(0) in the sign-out handler.
- **Interaction with pushes**: server pushes include an explicit `badge` field (ticket 27). iOS uses the larger of "push badge" or client setting — coordinate so the server number is authoritative at delivery; client adjusts afterwards as events come in.
- **Settings/Notifications**: no user-facing toggle in V1; badge is always on if push permissions granted.

## Dependencies

- [25 — Home Screen (provides the selector basis)](25-home-screen.md)
- [26 — Push Client Registration](26-push-notification-registration-client.md)

## Completion requirements

- [ ] Badge count matches needs-input session count
- [ ] Badge updates as sessions transition in/out of needs_input
- [ ] Badge clears on sign-out
- [ ] No user-facing setting introduced for V1

## How to test

1. User has 0 needs-input sessions → no badge.
2. Web: trigger a question on a session owned by user → mobile badge = 1.
3. Mobile: answer the question → badge = 0.
4. Sign out → badge cleared.
