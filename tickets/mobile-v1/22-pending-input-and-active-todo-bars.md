# 22 — Pending-Input Bar and Active Todo Strip

## Summary

Two pinned UI strips that surface the most important session state: when the session needs the user's input (pending question or pending plan), and when the agent is actively working through a todo list.

## What needs to happen

- **`PendingInputBar.tsx`** (<80 lines) + **`PendingInputShell.tsx`** (<200 lines):
  - Pinned at the bottom of `SessionSurface` when `session.sessionStatus === 'needs_input'`, taking over the slot that the composer (ticket 23) will occupy when idle. This mirrors web's `AskUserQuestionBar` / `PlanResponseBar` behavior of replacing the composer rather than stacking with it.
  - Flat surface bar with a top accent border + uppercase accent header. Shared `PendingInputShell` owns the container + header + the compact accent `PendingInputSendButton` and chevron `PendingInputPagerButton`. No Liquid Glass surface — matching web's chrome so both platforms read the same.
  - Two sub-variants based on the pending event (rendered by `PendingInputBar.tsx`, which dispatches to `PendingInputQuestion.tsx` or `PendingInputPlan.tsx`):
    - **Question variant (`PendingInputQuestion.tsx`)**: renders the question text + option pills + inline "Other…" free-form input. Tapping an option toggles a per-question selection (radio for single-select, checkbox for multi-select) without sending. Chevron pager navigates multi-question payloads. Send fires only after every question has an answer, then dispatches the combined `{header}: {answer}` response via a single `sendSessionMessage` mutation. Uses the shared `useQuestionState` hook from `@trace/client-core` (promoted from `apps/web/src/hooks/useQuestionState.ts`).
    - **Plan variant (`PendingInputPlan.tsx`)**: renders a single "Approve" preset pill (toggles on/off) plus an inline "Suggest changes to revise the plan…" input. Approving without feedback sends `"Approved. Implement this plan."`. Sending feedback sends `"Please revise the plan: ${text}"` with `interactionMode: "plan"` — matching web's `PlanResponseBar` exactly. V1 does not expose the web's "Approve (new session)" clear-context path.
  - Reads the pending question/plan from the most recent `session_output` assistant event that contains a `question` or `plan` block in the scoped event store (via `lib/pending-input.ts:findMostRecentPendingInput`).
  - Action strings and `interactionMode` values MUST stay byte-for-byte identical to web's `AskUserQuestionBar` + `PlanResponseBar` so the server contract is shared.
- **`QuestionOptionPill.tsx`** (<110 lines):
  - Mirrors `apps/web/src/components/session/messages/QuestionOptionPill.tsx`: checkbox glyph for multi-select, radio dot for single-select, accent-tinted border + text when selected. Haptic `selection` on toggle.
- **`ActiveTodoStrip.tsx`** (<150 lines):
  - Pinned directly below the session tab strip, above the stream. When the pending-input bar is mounted at the bottom, the strip stays at the top as usual.
  - Only rendered when `session.agentStatus === 'active'` and the most-recent todo-list event has todos.
  - Single-line display: current-todo spinner/checkmark + text + "N of M" progress on the right.
  - Uses Liquid Glass (`pinnedBar` preset) on iOS 26+ with the native BlurView fallback below.
  - No expand/collapse in V1 — just a status strip.
  - Smooth cross-fade (Reanimated `withTiming`, 220ms) when the current todo changes.
- **Integration into session surface**: `SessionSurface.tsx` mounts `ActiveTodoStrip` above the stream and `PendingInputBar` below the stream. The pending-input bar effectively replaces the ticket 23 composer when needs-input is active.

## Dependencies

- [20 — Session Stream Shell](20-session-stream-shell-and-virtualization.md)
- [12 — Glass](12-surface-primitives-glass-sheet.md) (ActiveTodoStrip only)

## Completion requirements

- [x] Pending-input bar appears when session needs input and disappears when resolved
- [x] Question variant renders question + options + free-form input with multi-question paging
- [x] Plan variant renders Approve preset + inline revise input + single Send button
- [x] Answering / approving / revising dispatches the exact message body and `interactionMode` web uses
- [x] Active todo strip shows the current todo + progress when agent is active with a todo list
- [x] Active todo strip uses Liquid Glass on iOS 26+ (pending-input bar intentionally uses flat chrome to match web's `AskUserQuestionBar` / `PlanResponseBar`)
- [x] All files under their line budgets (see sizes in each bullet above)
- [x] `useQuestionState` promoted to `@trace/client-core` and shared by web + mobile

## How to test

1. Trigger an agent question on web → mobile shows the question bar → tap an option (or type into "Other…") → tap Send → bar disappears once the session leaves `needs_input`. For multi-question payloads, the chevrons page between them and Send is disabled until every page has an answer.
2. Trigger a plan on web → mobile shows the plan bar → tap Approve → Send → `"Approved. Implement this plan."` goes through `sendSessionMessage`. Or type into the revise field → Send → `"Please revise the plan: …"` goes through with `interactionMode: "plan"`.
3. During an active agent run with todos, the strip at the top of the surface shows the current todo + "N of M" progress and cross-fades as the agent advances.

## Notes for downstream tickets

- Ticket 23 (Session Input + Queued) must render the composer only when `sessionStatus !== 'needs_input'` so the composer and `PendingInputBar` never stack. The bar owns the bottom slot while the session is waiting on the user.
