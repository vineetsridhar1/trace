# 17 - Session View

## Summary

The session view: a floating window (or split) rendering the transcript from normalized nodes, with a prompt input at the bottom, viewport-driven subscriptions, and scroll-back pagination. With tickets 15/16 this completes the V1 Neovim experience.

## Plan coverage

Owns plan lines:

- 29: session view UX (transcript + prompt, fire-and-forget)
- 207: `ui/session.lua` module
- 218-219: transcript rendering rules and viewport-driven subscribe/unsubscribe

## What needs to happen

- `ui/session.lua`:
  - transcript buffer: `nofile`, unmodifiable to the user, one per open session; content appended via `nvim_buf_set_lines`; per-node-kind highlighting and chrome (prompt prefixes, tool-use one-liners, plan/question blocks) via extmarks
  - opening a session: render seed nodes from state/`session/timeline`, send `scope/subscribe`; auto-scroll when the cursor is at bottom, hold position otherwise
  - `session/nodes` handling: appends add lines; patches (streaming agent text) rewrite the node's line range via extmark-tracked boundaries
  - prompt input: small window below the transcript; `<CR>` sends `session/prompt` and clears; the optimistic node arrives as a daemon append (no local rendering shortcut)
  - status header: session name, tool/model, agentStatus via winbar or virtual line, updated from `entity/upserted`
  - closing: `BufWinLeave`/`WinClosed` autocmds send `scope/unsubscribe`; re-opening re-seeds
  - pagination: scrolling to the top triggers `session/timeline { beforeEventId }`, prepends nodes, preserves the cursor position
- Node-kind rendering is table-driven (`kind → render function`) so new kinds fail soft as plain text with a highlight, never an error.

## Dependencies

- [11 - Snapshot, Scope, and Action Methods](11-snapshot-scope-and-action-methods.md)
- [12 - Normalized Deltas](12-normalized-deltas.md)
- [15 - Neovim Plugin Scaffold and RPC Client](15-nvim-plugin-scaffold-and-rpc-client.md)

## Completion requirements

- [ ] Transcript matches the web session view's content for the same session (same nodes, same order)
- [ ] Streaming agent output updates in place without flicker or duplicate blocks
- [ ] Prompt appears optimistically and reconciles without duplication
- [ ] Open/close drives `scope/subscribe`/`unsubscribe` exactly once each (no leaks across repeated open/close)
- [ ] Scroll-to-top pagination prepends and preserves the viewport
- [ ] A long transcript (1000+ nodes) opens and scrolls smoothly

## Implementation notes

- The buffer is a *projection of node state*, not the source of truth — keep a Lua-side `nodeId → extmark/line-range` index so patches are surgical. Never re-render the whole buffer on an append.
- Multiple session views can be open (splits); the scope registry (ticket 11) refcounts, but the plugin should also handle two windows onto one buffer.
- Word-wrap: let Neovim wrap (`wrap`, `linebreak`) rather than hard-wrapping node text, so resizes reflow for free.

## How to test

1. Plenary specs with the stub daemon: scripted `session/nodes` sequences (append, streaming patches, optimistic reconcile) asserting buffer content and extmark integrity.
2. Manual against `dev:local`: run a real session; compare against the web transcript; type prompts; scroll back through history.
3. Open/close the view 10 times; assert one live subscription at a time (daemon-side logging or transcript assertions).
