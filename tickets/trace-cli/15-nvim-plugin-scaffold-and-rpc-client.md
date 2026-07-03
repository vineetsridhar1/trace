# 15 - Neovim Plugin Scaffold and RPC Client

## Summary

Create `apps/nvim` (`trace.nvim`): plugin skeleton, daemon spawn/respawn, NDJSON-RPC client, the state module, and `:checkhealth trace`. After this ticket the plugin can initialize against a real daemon; UI tickets build on it.

## Plan coverage

Owns plan lines:

- 14: `trace.nvim` deliverable
- 88: `apps/nvim` location and non-workspace status
- 194-213: plugin module layout
- 217: state-module rule (state updated only from daemon notifications)
- 222: compatibility rules (Neovim >= 0.10, plain APIs, LunarVim-compatible without depending on it)
- 223: handshake version checking via `:checkhealth` (distribution docs are ticket 20)

## What needs to happen

- Layout per the plan: `lua/trace/{init,config,rpc,state,health}.lua`, `lua/trace/ui/` (populated by later tickets), `plugin/trace.lua` registering `:Trace`.
- `config.lua`: defaults + `setup(opts)` merge — server binary path (default `trace` on `$PATH`), keymap toggles, UI options. No behavior beyond config storage.
- `rpc.lua`:
  - spawn `trace daemon --stdio` via `jobstart` (or `vim.system`), with stderr routed to a log buffer/file
  - stdout line buffering tolerant of partial chunks; `vim.json.decode` per line
  - request/response correlation by id with callbacks; notification dispatch registry
  - all editor-facing callbacks wrapped in `vim.schedule`
  - `initialize` on spawn with the plugin's supported protocol version; structured failure surfaced to health
  - respawn with backoff on daemon death, with a `vim.notify` warning; give up after N attempts
- `state.lua`: entity tables (sessions, channels, tickets, badges, connection state) updated **only** by notification handlers (`entity/upserted`, `badge/update`, `connection/state`) and snapshot responses. UI modules read state and subscribe to change signals; they never own data.
- `health.lua`: binary found + version, daemon spawns, handshake succeeds (protocol version match), auth state — each failure with an actionable message ("run `trace login`", "update trace CLI").

## Dependencies

- [10 - Daemon RPC Core](10-daemon-rpc-core.md)

## Completion requirements

- [ ] Plugin loads under plain Neovim >= 0.10 and under LunarVim with a `dir =` local install
- [ ] `initialize` handshake completes against a real daemon; `:checkhealth trace` reports OK
- [ ] Handshake/auth failures produce actionable checkhealth output, not errors on startup
- [ ] Daemon crash triggers respawn with notice; repeated failure degrades gracefully (plugin inert, health explains)
- [ ] RPC layer survives split/joined stdout chunks (unit-tested with a stub daemon)
- [ ] No state writes from anywhere except notification/snapshot handlers

## Implementation notes

- Ship a stub daemon script (test asset) speaking canned NDJSON so plugin specs run without a server; specs use `plenary.nvim` busted, headless.
- Lazy-load: do not spawn the daemon until the first `:Trace` command or mapped key; editor startup must be unaffected.
- Keep `rpc.lua` free of Trace domain knowledge (methods are strings, payloads opaque) — it should be reusable for any daemon speaking the protocol.

## How to test

1. Headless plenary specs for framing (partial lines, batched lines), correlation, and notification dispatch against the stub daemon.
2. Manual: `lazy.nvim` local install, `:checkhealth trace` green against a logged-in CLI; kill the daemon process and observe respawn + notice.
3. Loading the plugin adds no measurable startup time before first use (defer everything).
