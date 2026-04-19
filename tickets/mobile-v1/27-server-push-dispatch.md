# 27 — Server-Side Push Dispatch (Expo Push API)

## Summary

Server-side logic that fires push notifications via the Expo Push API (APNs underneath) for the event types listed in the plan (§14.2). Debounces per session to avoid storms on reconnection. Sends to all registered tokens for the target user in the target org.

## What needs to happen

- **Dispatch service** (`apps/server/src/services/pushDispatchService.ts`):
  - `async sendPushForEvent(event: Event)`:
    - Determines target user(s) and notification content from event type + subtype
    - Loads active push tokens for target user via `pushTokenService.listActiveTokensForUser(userId, orgId)`
    - Calls Expo Push API (`https://exp.host/--/api/v2/push/send`) with batched payloads
    - Handles receipts: parse response, remove tokens the API marks as `DeviceNotRegistered`
  - Debounce: maintain an in-memory (or Redis) TTL set keyed by `${sessionId}:${eventCategory}` with 5s TTL; skip dispatch if set hit.
- **Event → payload mapping** (per plan §14.2):
  | Trigger | User | Title | Body |
  |---|---|---|---|
  | `session_output` (question_pending) | session owner | "Session needs input" | `{sessionName}: {question}` |
  | `session_output` (plan_pending) | session owner | "Plan ready for review" | `{sessionName}` |
  | `session_terminated` | session owner | "Session stopped" | `{sessionName}` |
  | `session_pr_opened` | session owner | "PR opened" | `{sessionName}` |
  | `session_pr_merged` | session owner | "PR merged" | `{sessionName}` |
  | `session_output` (recovery_failed) | session owner | "Session errored" | `{sessionName}: {error}` |
  - All include `data.deepLink = trace://sessions/{groupId}/{sessionId}`
  - `badge` field populated with current `needs_input` count for target user
- **Wire-up**: call `pushDispatchService.sendPushForEvent(event)` from the existing event-broadcast pipeline (same place events are broadcast to subscribers). Does not block broadcast — fire-and-forget with logging.
- **Expo access token** — configuration via env var `EXPO_PUSH_ACCESS_TOKEN` (optional but recommended). Document in env docs.
- **Logging** — log push dispatches (user, event type, success/failure). Integrate with existing logging if present.

## Dependencies

- [08 — Server Push Token Mutations](08-server-push-token-registration.md)
- Must land before [26 — Client Registration](26-push-notification-registration-client.md) is testable end-to-end (can land in either order; tested together).

## Completion requirements

- [ ] `pushDispatchService` exists and is called from the event broadcast pipeline
- [ ] All 6 event triggers map to push payloads with correct title, body, data
- [ ] Debounce prevents storms (verified by unit test)
- [ ] Invalid tokens auto-removed on receipt error
- [ ] Dispatch is fire-and-forget; never blocks event broadcast
- [ ] Unit + integration tests cover each event trigger

## How to test

1. Unit tests for event→payload mapping and debounce behavior.
2. Integration: in dev, trigger a `question_pending` on a session owned by a user with a real registered token → Expo Push receipt returned; banner on real device.
3. Force 5 `session_output`/recovery_failed events in quick succession → only 1 push dispatched (debounce).
4. Verify `DeviceNotRegistered` receipt results in token row deletion.
