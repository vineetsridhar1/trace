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

- Each suggestion type has a default TTL:
  - `ticket_suggestion`: 72 hours
  - `link_suggestion`: 48 hours
  - `session_suggestion`: 24 hours
  - `field_change_suggestion`: 48 hours
  - `comment_suggestion`: 24 hours
  - `message_suggestion`: 24 hours
- The expiry timestamp is stored in the InboxItem payload's `expiresAt` field
- A periodic background job (runs every 15 minutes) queries for active InboxItems past their expiry and resolves them as `expired`

### Dismissal suppression

- Track when users dismiss suggestions by type and scope
- If a user dismisses a suggestion of type X in scope Y, suppress suggestions of the same type in the same scope for 24 hours
- Store suppression state in Redis (key: `suppress:{orgId}:{scopeKey}:{itemType}`, TTL: 24h)
- The policy engine (ticket 12) checks this before allowing a suggestion

## Dependencies

- 14 (Suggestion Delivery)
- 12 (Policy Engine)

## Completion requirements

- [ ] Duplicate suggestions are detected and suppressed before creation
- [ ] Similarity check works with fuzzy title matching (not just exact match)
- [ ] Expiry background job resolves stale suggestions
- [ ] Dismissal suppression prevents repeated unwanted suggestions in the same scope
- [ ] All suppressed/expired/deduplicated suggestions are logged for observability

## How to test

1. Create a ticket suggestion "Login timeout bug" — then trigger a new suggestion "Login timeout issue" in the same scope — verify the second is suppressed as a duplicate
2. Create a suggestion with 1-minute TTL — wait 2 minutes — verify the expiry job resolves it
3. Dismiss a `ticket_suggestion` in a scope — trigger another `ticket_suggestion` in the same scope within 24 hours — verify it's suppressed
4. Trigger a `link_suggestion` in the same scope after dismissing a `ticket_suggestion` — verify it's NOT suppressed (different type)
