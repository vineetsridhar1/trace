# 22 — Pending-Input Bar and Active Todo Strip

## Summary

Two pinned UI strips above the stream that surface the most important session state: when the session needs the user's input (pending question or pending plan), and when the agent is actively working through a todo list.

## What needs to happen

- **`PendingInputBar.tsx`** (<200 lines):
  - Pinned below the header when `session.sessionStatus === 'needs_input'`.
  - Liquid Glass container (pinned variant).
  - Two sub-variants based on the pending event:
    - **Question variant**: renders the question text + answer buttons inline. For multi-option questions, renders option buttons; for free-form, a tiny inline input + Send.
    - **Plan variant**: compact card showing plan title + summary preview + two buttons: "Accept" (primary) and "Send feedback" (ghost — focuses the main composer with a prefilled prefix like "Feedback on plan: ").
  - Reads the pending question/plan from the most recent `session_output` event of that subtype in the scoped event store.
  - Actions dispatch through `sendSessionMessage` with the same body format web uses (see `apps/web/src/components/session/messages/AskUserQuestionInline.tsx` and `PlanReviewCard.tsx` for canonical text).
  - Collapse animation on dismiss (Reanimated layout).
- **`ActiveTodoStrip.tsx`** (<150 lines):
  - Pinned below the pending-input bar (or directly below the header if no pending input).
  - Only rendered when `session.agentStatus === 'active'` and the most-recent todo-list event has todos.
  - Single-line display: current-todo checkmark + text + "N of M" progress on the right.
  - No expand/collapse in V1 — just a status strip.
  - Smooth cross-fade when the current todo changes.
- **Integration into session stream**: both strips mount inside `SessionStreamScreen.tsx` above the `FlashList`. When the list scrolls, they stay pinned. Layout adjusts so the list inset accounts for their heights.

## Dependencies

- [20 — Session Stream Shell](20-session-stream-shell-and-virtualization.md)
- [12 — Glass](12-surface-primitives-glass-sheet.md)

## Completion requirements

- [ ] Pending-input bar appears when session needs input and disappears when resolved
- [ ] Question variant renders question + buttons correctly
- [ ] Plan variant renders compact card + Accept / Send feedback
- [ ] Answering or accepting dispatches the right mutation body
- [ ] Active todo strip shows when agent is active with a todo list
- [ ] Both use Liquid Glass on iOS 26+
- [ ] Files <200 lines

## How to test

1. Trigger an agent question on web → mobile shows pending-input bar with buttons → tap an option → bar disappears, agent resumes.
2. Trigger a plan on web → mobile shows plan card → tap Accept → agent proceeds; tap Send feedback → composer focuses with prefill.
3. During active agent run with todos, strip shows current todo and progress → updates as agent advances.
