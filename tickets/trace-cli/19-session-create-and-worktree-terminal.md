# 19 - Session Create and Worktree Terminal

## Summary

Start sessions without leaving the editor (`:Trace new`) and add the escape hatch back to raw terminal access: a floating `:terminal` cd'd into a local session's worktree.

## Plan coverage

Owns plan lines:

- 32: `:Trace new`
- 33: worktree floating terminal (`<leader>tw`)
- 221: worktree-terminal implementation rule (daemon exposes the worktree path)

## What needs to happen

- `:Trace new` flow:
  - pick repo via `vim.ui.select` from a `repos/list` daemon snapshot — add that method to the daemon in this ticket (small addition alongside ticket 11's snapshot set; keep its payload shape consistent)
  - optional branch input (`vim.ui.input`, default from repo `defaultBranch`), tool selection defaulting to the user's `defaultSessionTool`, optional initial prompt
  - send `session/create`; when the session's `entity/upserted` arrives, open its session view (ticket 17) automatically
- Worktree terminal:
  - session snapshots already carry connection metadata including worktree path for local sessions (ticket 11)
  - `<leader>tw` from a session view (or the switcher) opens a floating `:terminal` with `cwd` set to the worktree; keybind to toggle/close; reuse one terminal per session rather than stacking
  - hidden/disabled with a clear message for sessions whose runtime is not local or has no worktree yet (pre-`workspace_ready`)
- Both features respect the fire-and-forget rule: `:Trace new` gets its ack, then waits for events; no polling.

## Dependencies

- [16 - Session Switcher and Badges](16-session-switcher-and-badges.md)
- [17 - Session View](17-session-view.md)

## Completion requirements

- [ ] `:Trace new` creates and opens a session end to end against a local runtime (desktop bridge or `trace runtime up`)
- [ ] Tool/branch defaults come from user settings and repo metadata, not hardcoded values
- [ ] Worktree terminal opens in the correct directory and toggles per session
- [ ] Non-local / not-ready sessions show the explanatory message instead of a broken terminal
- [ ] `repos/list` is documented in the protocol doc alongside the other snapshot methods

## Implementation notes

- Session creation failures (no runtime available, no environment) come back as events/status updates — surface them via `vim.notify` from the session's status transitions rather than inventing an error channel.
- The worktree path can change (retry/move); read it from current state at open time, don't cache it at session-open.

## How to test

1. Manual: `:Trace new` against `dev:local` + local runtime; session view opens on creation; prompt flows.
2. `<leader>tw` in a running local session lands in the worktree (`pwd` check); toggling reuses the terminal.
3. `:Trace new` with no connected runtime surfaces the failure status visibly.
