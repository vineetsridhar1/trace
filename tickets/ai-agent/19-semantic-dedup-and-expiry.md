# 19 — Semantic Deduplication & Suggestion Expiry

## Summary

Prevent the agent from suggesting the same thing twice. If users discuss the same bug at 9am and 3pm, the event IDs differ but the agent shouldn't create two ticket suggestions for the same issue. Also clean up suggestions that nobody acts on.

## What needs to happen

### Semantic deduplication

- Before creating any suggestion (InboxItem), check for existing open suggestions in the same scope with the same item type
- Compare the new suggestion's title against existing ones using trigram similarity or Levenshtein distance
- If similarity exceeds a threshold (0.7), skip the duplicate suggestion and log it
- Implementation options:
  - Postgres `pg_trgm` extension with `similarity()` function
  - Simple Levenshtein distance check in application code
- This runs in the suggestion creation path (ticket 14), not in the policy engine

### Suggestion expiry

<!-- Updated after implementation: TTL values match ticket #14's implementation in suggestion.ts EXPIRY_DEFAULTS_MS. Expiry job runs every 60s (not 15min) for faster cleanup; processed event cleanup runs every ~15min. -->

- Each suggestion type has a default TTL (as implemented in ticket #14):
  - `ticket_suggestion`: 72 hours
  - `field_change_suggestion`: 72 hours
  - `link_suggestion`: 48 hours
  - `comment_suggestion`: 48 hours
  - `agent_suggestion`: 48 hours
  - `session_suggestion`: 24 hours
  - `message_suggestion`: 24 hours
- The expiry timestamp is stored in the InboxItem payload's `expiresAt` field
- A periodic background maintenance worker (runs every 60s) queries for active InboxItems past their expiry and resolves them as `expired`

### Processed event cleanup

<!-- Added after ticket 08: The `ProcessedAgentEvent` table (ticket 08) grows unboundedly as the worker processes events. Add a periodic cleanup job that deletes records older than 7 days (events are unlikely to be replayed after that). Run alongside the suggestion expiry job. Query: `DELETE FROM "ProcessedAgentEvent" WHERE "processedAt" < NOW() - INTERVAL '7 days'` -->

- Add a periodic cleanup for the `ProcessedAgentEvent` table (from ticket 08)
- Delete records older than 7 days — events older than this are safe to reprocess if replayed
- Run as part of the same background job that handles suggestion expiry

### Dismissal suppression

- Track when users dismiss suggestions by type and scope
- If a user dismisses a suggestion of type X in scope Y, suppress suggestions of the same type in the same scope for 24 hours
- Store suppression state in Redis (key: `suppress:{orgId}:{scopeKey}:{itemType}`, TTL: 24h)
- The policy engine (ticket 12) checks this before allowing a suggestion

## Dependencies

- 14 (Suggestion Delivery)
- 12 (Policy Engine)
  <!-- Ticket 12 created: Dismissal tracking is currently in-memory in `./agent/policy-engine.js` via `recordDismissal()` and an internal `Map<string, DismissalRecord>`. This works for single-worker but needs migration to Redis for multi-worker deployment. Replace the in-memory `dismissals` Map with Redis SET/GET on key `suppress:{orgId}:{scopeType}:{scopeId}:{actionType}` with TTL 24h. The `recordDismissal({ organizationId, scopeType, scopeId, actionType })` export is the write path — call it from the suggestion dismiss handler. The `isDismissalCooldownActive()` internal function is the read path — refactor it to check Redis instead. Similarly, suggestion rate limiting is in-memory (`suggestionRates` Map) — consider migrating to Redis INCR with TTL for multi-worker consistency. -->

## Completion requirements

- [x] Duplicate suggestions are detected and suppressed before creation
- [x] Similarity check works with fuzzy title matching (not just exact match)
- [x] Expiry background job resolves stale suggestions
- [x] Dismissal suppression prevents repeated unwanted suggestions in the same scope
- [x] All suppressed/expired/deduplicated suggestions are logged for observability

## How to test

1. Create a ticket suggestion "Login timeout bug" — then trigger a new suggestion "Login timeout issue" in the same scope — verify the second is suppressed as a duplicate
2. Create a suggestion with 1-minute TTL — wait 2 minutes — verify the expiry job resolves it
3. Dismiss a `ticket_suggestion` in a scope — trigger another `ticket_suggestion` in the same scope within 24 hours — verify it's suppressed
4. Trigger a `link_suggestion` in the same scope after dismissing a `ticket_suggestion` — verify it's NOT suppressed (different type)
