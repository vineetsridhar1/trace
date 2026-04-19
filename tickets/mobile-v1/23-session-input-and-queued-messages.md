# 23 — Session Input Composer and Queued Messages Strip

## Summary

The bottom-pinned composer: plain-text input, interaction-mode toggle (code / plan / ask), and a send button that flips between "Send" and "Queue" based on agent state. Above it, a horizontally scrolling strip showing currently queued messages with tap-to-remove.

## What needs to happen

- **`SessionInputComposer.tsx`** (<200 lines):
  - Liquid Glass background (input preset).
  - `TextInput` (multiline, grows up to 6 lines then scrolls internally).
  - Interaction-mode pill on the left: cycles `code → plan → ask → code` on tap. Visual variants per mode. Haptic `selection` on cycle.
  - Send button on the right:
    - Disabled when input is empty
    - Label "Send" when `agentStatus !== 'active'`; label "Queue" when active
    - Haptic `light` on send/queue
  - On send (not active): calls `sendSessionMessage({ sessionId, text, interactionMode, clientMutationId })`. Optimistic insert via client-core's `insertOptimisticMessage` helper. Clears input.
  - On queue (active): calls `queueSessionMessage({ sessionId, text, interactionMode })`. Optimistic upsert into `queuedMessages`. Clears input.
  - Keyboard handling via `react-native-keyboard-controller` — composer rises smoothly above keyboard; stream inset adjusts.
- **`QueuedMessagesStrip.tsx`** (<150 lines):
  - Horizontal scroll strip above the composer, only visible when session has queued messages.
  - Each message: chip with truncated text, `×` button on the right (haptic `light`, calls `removeQueuedMessage`).
  - "Clear all" trailing button when >1 message.
  - Count label: "Queued (N)".
  - Reads from entity store via `useEntityStore(s => s._queuedMessageIdsBySession[sessionId] ?? [])`.
  - Live updates from `queued_message_*` events via existing handlers.
- Focus behavior: tapping the stream dismisses keyboard. Pull-to-refresh at top also dismisses keyboard.

## Dependencies

- [20 — Session Stream Shell](20-session-stream-shell-and-virtualization.md)
- [22 — Pending-Input Bar (for focus-with-prefill interaction)](22-pending-input-and-active-todo-bars.md)
- Install: `react-native-keyboard-controller`

## Completion requirements

- [ ] Composer sends when agent idle; queues when active
- [ ] Optimistic update inserts event or queued-message immediately
- [ ] Server event reconciles optimistic entry
- [ ] Interaction mode toggle cycles correctly with haptic
- [ ] Queued strip displays and updates live
- [ ] Keyboard behavior: composer rises, stream adjusts, no jank
- [ ] All files <200 lines

## How to test

1. Agent idle → type → Send → message appears optimistically → reconciles when event arrives.
2. Agent running → type → Queue → chip appears in strip.
3. Tap `×` on chip → chip disappears (optimistic), `removeQueuedMessage` fires.
4. Agent completes → queued messages drain one-by-one → chips disappear as they drain.
5. Cycle interaction mode → visual + haptic changes.
6. Keyboard interactions on device: no layout shift or jank.
