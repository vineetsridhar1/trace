# 16 - Session Switcher and Badges

## Summary

The core UX win: a floating session switcher sorted needs-input-first with status glyphs, a jump-to-needs-input mapping, statusline counts, and notifications. This is the direct replacement for floating-terminal juggling.

## Plan coverage

Owns plan lines:

- 28: `<leader>tt` floating session switcher
- 30-31: jump-to-needs-input and statusline counts
- 209-210: `ui/statusline.lua` and `ui/notify.lua` modules
- 220: switcher UX rules (needs-input-first, glyphs, `<CR>` to open)

## What needs to happen

- `ui/switcher.lua`: floating picker over `state.lua` sessions — sorted needs-input first, then active, then by recency; status glyphs per `agentStatus`/`sessionStatus` (`needs_input`, `active`, `done`, `failed`); line format: glyph, name, repo/branch, relative time. `<CR>` opens the session view (ticket 17), `<Esc>`/`q` closes. Implemented against `vim.ui.select`-compatible plumbing with a native floating-window default; a telescope extension is optional and separate.
- Jump-to-needs-input: mapping that opens the most recent `needs_input` session directly (no picker), cycling on repeat.
- `ui/statusline.lua`: `require("trace.statusline").component()` returning a compact string (e.g. `T:2!` for needs-input count, mention count) driven by `badge/update` state; consumable from lualine or any statusline.
- `ui/notify.lua`: `vim.notify` when a session enters `needs_input` and on mentions, debounced, with an opt-out. Notification names the session and the mapping to jump there.
- Default keymaps `<leader>tt` (switcher) and `<leader>tn` (jump), registered only if the user hasn't disabled defaults in `setup()`.
- The switcher re-renders from `entity/upserted`/`badge/update` while open (a session finishing while you look at the list updates its glyph).

## Dependencies

- [11 - Snapshot, Scope, and Action Methods](11-snapshot-scope-and-action-methods.md)
- [12 - Normalized Deltas](12-normalized-deltas.md)
- [15 - Neovim Plugin Scaffold and RPC Client](15-nvim-plugin-scaffold-and-rpc-client.md)

## Completion requirements

- [x] Switcher opens in <50ms from state (no RPC round-trip on open after hydration)
- [x] Sorting and glyphs correct across all status combinations
- [x] Jump mapping opens the right session and cycles through multiple needs-input sessions
- [x] Statusline component updates live as badges change
- [x] Notifications fire once per transition (debounced), with opt-out respected
- [x] All keymaps configurable/disable-able via `setup()`

## Implementation notes

- The picker reads state synchronously — hydration happened at `initialize`. If state is empty because the daemon is down, show the health hint instead of an empty list.
- Keep glyphs ASCII-fallback-safe (config option), since not everyone runs a patched font.

## How to test

1. Plenary specs with the stub daemon: seed sessions in every status, assert sort order, glyphs, and live re-render on a status-change notification.
2. Manual against `dev:local`: drive a session to `needs_input` from the web UI; observe notification, statusline change, and jump mapping.
3. Verify `setup({ default_keymaps = false })` registers nothing.
