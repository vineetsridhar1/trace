# Fix Auto-Review Bugs

Three bugs in the auto-review feature, all straightforward fixes.

---

## Bug 1: Auto-review triggers when no files changed (e.g. merge-to-main)

**Root cause:** `writeToolCount` query in `eventService.ts:409-415` counts PostToolUse events across ALL sessions for the message. When merge-to-main reuses the same message ID, it picks up Write/Edit events from the **original task session**, falsely detecting file changes.

**Fix:** Add `sessionId: autoCompleteSessionId` to the where clause to scope the count to the current session only.

**File:** `server/src/services/eventService.ts` (~line 409)

---

## Bug 2: Auto-review fires while Claude is still working

**Root cause:** Each Stop event without a toolName starts a 5-second timer. If Claude has multiple intermediate stops during a session, an earlier timer can fire while Claude is still active. The check only verifies session ID + status — not whether Claude continued working.

**Fix:** After the 5-second timeout, check if any newer events exist in the session since our Stop event. If so, Claude kept working — bail out.

**File:** `server/src/services/eventService.ts` (after ~line 391, add newer-event check)

---

## Bug 3: Remove visible "Review the changes..." text

**Root cause:** The prompt includes both `<trace-internal>` instructions (hidden) and a visible line `"Review the changes made in this session and fix any issues."` The user already sees "Beginning Auto-Review" in the UI.

**Fix:** Remove the visible text after `</trace-internal>`, keeping the hidden instructions intact.

**File:** `src/hooks/useClaudeMessageActions.ts` (~line 529)

---

## Summary

| File | Change |
|------|--------|
| `server/src/services/eventService.ts` | Add `sessionId` filter to writeToolCount query |
| `server/src/services/eventService.ts` | Add newer-event check after timeout |
| `src/hooks/useClaudeMessageActions.ts` | Remove visible review prompt text |
