# 23 — Session Input Composer and Queued Messages Strip

## Summary

The bottom-pinned composer: plain-text input, interaction-mode toggle (code / plan / ask), and a send button that flips between "Send" and "Queue" based on agent state. Above it, a horizontally scrolling strip showing currently queued messages with tap-to-remove.

## What needs to happen

- **`SessionInputComposer.tsx`** (<200 lines):
  - Liquid Glass background (input preset) that interpolates tint + border toward the current interaction mode's accent colour.
  - Suppressed by `SessionSurface` whenever the event stream has an unresolved pending-input event (plan or question). When the session is waiting on the user, `PendingInputBar` (ticket 22) owns the bottom slot and the composer is hidden — same replace-not-stack model as web's `AskUserQuestionBar` / `PlanResponseBar`. The gate is derived from events via `findMostRecentPendingInput`, not `sessionStatus === 'needs_input'`, so the swap happens as soon as the event arrives rather than waiting for a status flip.
  - `TextInput` (multiline) that animates its own height via Reanimated between `MIN_INPUT_HEIGHT` (28) and `MAX_INPUT_HEIGHT` (240) based on `onContentSizeChange`.
  - Interaction-mode pill on the left: cycles `code → plan → ask → code` on tap. Visual variants per mode (shared tint palette used by the glass card, card border, chip, and send button). Haptic `selection` on cycle.
  - Send button on the right:
    - Arrow-up SF Symbol on all states; `accessibilityLabel` switches between "Send message" and "Queue message" based on `agentStatus === 'active'`.
    - Disabled when input is empty or a send/queue is already in flight.
    - Disabled with the placeholder flipped to "Worktree deleted" / "Session merged" when the session has reached a terminal state. Terminal = `worktreeDeleted === true || sessionStatus === 'merged'` only. `done`, `failed`, and `stopped` are resumable (web's `canSendMessage` treats them as resumable), so the composer stays live for those.
    - Haptic `light` on send/queue (fired inside the shared `useComposerSubmit` hook).
  - On send (not active): calls `sendSessionMessage({ sessionId, text, interactionMode, clientMutationId })`. Optimistic insert via client-core's `optimisticallyInsertSessionMessage`. Clears input on success.
  - On queue (active): calls `queueSessionMessage({ sessionId, text, interactionMode })`. The `queued_message_added` event drives the store upsert through the shared handler — no optimistic write from the client. Clears input on success.
  - On send/queue failure: roll back the optimistic entry (send path only), restore the draft text via the hook's `onFailure` callback, and render an inline tap-to-retry row above the input. Toast isn't used because the composer is the only surface that needs the error; the retry row carries the affordance.
  - V1 offline behavior: no durable offline outbox. Failed drafts remain visible only while the screen stays mounted; cross-launch persistence is deferred.
  - Model + hosting chips render as read-only display only. Making them tappable is deferred to [36 — Composer Model & Runtime Pickers](36-composer-model-and-runtime-pickers.md).
  - Keyboard handling: `SessionSurface` uses `react-native-keyboard-controller`'s `KeyboardStickyView` to keep the composer locked to the native keyboard, while native `Keyboard` events still drive the stream/composer insets so the newest message stays visible.
  - Send/queue logic lives in the shared `useComposerSubmit` hook (`apps/mobile/src/hooks/useComposerSubmit.ts`); the mode-tint palette + the five `useAnimatedStyle` bindings live in `useComposerModePalette` (`apps/mobile/src/hooks/useComposerModePalette.ts`). Splitting both out keeps `SessionInputComposer` focused on layout and under the 200-line budget. The submit hook owns the optimistic insert, prompt wrapping (via `wrapPrompt` / `ASK_PREFIX` / `PLAN_PREFIX` shared from `@trace/client-core`), error rollback, and haptic — `SessionInputComposer` just calls `submit(draft, mode)` and reacts to the resolved state.
- **`QueuedMessagesStrip.tsx`** (<150 lines):
  - Horizontal scroll strip above the composer, only visible when session has queued messages.
  - Each message: chip with truncated text, `×` button on the right (haptic `light`, calls `removeQueuedMessage`).
  - "Clear all" trailing button when >1 message.
  - Count label: "Queued (N)".
  - Reads from entity store via `useQueuedMessageIdsForSession(sessionId)` (sorted by `position`).
  - Live updates from `queued_message_*` events via existing handlers in `@trace/client-core/events/handlers`.
- **Per-session hydration.** `queuedMessages` must be populated in the store when the composer mounts. `useSessionDetail` (invoked from `SessionSurface`) runs the mobile `SESSION_DETAIL_QUERY`, upserts into the entity store, and refreshes `_queuedMessageIdsBySession` — this handles the deep-link / another-user's-link case where `mySessions` didn't pre-hydrate.
- Focus behavior: `FlashList` uses `keyboardDismissMode="interactive"` + `keyboardShouldPersistTaps="handled"`, so dragging down or tapping outside dismisses the keyboard without interfering with interactive rows.

## Dependencies

- [20 — Session Stream Shell](20-session-stream-shell-and-virtualization.md)
- [22 — Pending-Input Bar (for focus-with-prefill interaction)](22-pending-input-and-active-todo-bars.md)

## Completion requirements

- [x] Composer sends when agent idle; queues when active
- [x] Optimistic update inserts event or queued-message immediately
- [x] Server event reconciles optimistic entry; mutation failures roll it back and restore the draft
- [x] Interaction mode toggle cycles correctly with haptic
- [x] Completed/stopped sessions disable the composer and show the completion hint
- [x] Queued strip displays and updates live
- [x] Keyboard behavior: composer rises, stream adjusts, no jank
- [x] All files <200 lines

## How to test

1. Agent idle → type → Send → message appears optimistically → reconciles when event arrives.
2. Agent running → type → Queue → chip appears in strip.
3. Force a send/queue mutation failure → optimistic send rolls back, draft text is restored, inline "Failed to send. Tap to retry" row appears; tapping it retries with the same mode.
4. Tap `×` on chip → chip disappears as the `queued_message_removed` event round-trips; `REMOVE_QUEUED_MESSAGE_MUTATION` fires on tap.
5. Delete the worktree or merge the session → placeholder flips to "Worktree deleted" / "Session merged", input becomes non-editable, send button disables. `done` / `failed` / `stopped` should leave the composer live.
6. Agent completes → queued messages drain one-by-one → chips disappear as they drain.
7. Cycle interaction mode → tint, chip, border, and send-button colours interpolate smoothly and haptic fires each tap.
8. Keyboard interactions on device: composer rises with the keyboard, the stream frame shrinks so the last message stays visible, dragging the list down dismisses the keyboard without a jump.
