# 18 - Channel View

## Summary

Channel reading and posting inside Neovim: a message-stream buffer with a compose input, reusing the session view's buffer machinery and the same viewport-driven subscription pattern.

## Plan coverage

Owns plan lines:

- 34: channel views in the north-star UX
- 208: `ui/channel.lua` module

## What needs to happen

- `ui/channel.lua`, built on the buffer/window machinery from ticket 17 (extract shared pieces into a `ui/view.lua` helper rather than copying):
  - message stream rendered from channel scope state: actor prefix (user/agent glyph), timestamp, text; session/agent activity events rendered as compact system lines
  - compose input below the stream; `<CR>` sends `channel/send`
  - open → `scope/subscribe { channel }`; close → unsubscribe; pagination on scroll-to-top mirroring the session view
- Channel picker entry: extend the ticket 16 switcher (or a `:Trace channels` variant) to open channel views with unread indication from badge/ambient state.
- Mentions render highlighted; a mention notification (ticket 16's notify module) can deep-link to the channel view.

## Dependencies

- [11 - Snapshot, Scope, and Action Methods](11-snapshot-scope-and-action-methods.md)
- [17 - Session View](17-session-view.md)

## Completion requirements

- [x] Channel view shows recent messages and streams new ones live
- [x] Sending from the compose input appears in web clients (and vice versa)
- [x] Open/close drives channel scope subscribe/unsubscribe with no leaks
- [x] Shared view machinery is extracted, not duplicated, and ticket 17's specs still pass
- [x] Mentions are visually distinct

## Implementation notes

- Channel message payloads come through the daemon normalized like everything else; if the channel stream needs a different node/message shape than sessions, define it in the protocol doc as part of this ticket.
- Threads/replies exist in the schema (`parentMessageId`) — render inline markers only; a thread UI is out of scope.

## How to test

1. Plenary specs: seeded channel stream renders; compose sends `channel/send`; subscription lifecycle on open/close.
2. Manual two-client test: nvim ↔ web conversation in one channel, both directions live.
3. Pagination through a long channel history.
