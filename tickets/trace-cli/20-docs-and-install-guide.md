# 20 - Docs and Install Guide

## Summary

Document both deliverables well enough that a new user goes from zero to Trace-in-Neovim without reading source: CLI install/login/commands, daemon protocol reference, and the nvim plugin install/config/keymap guide (including LunarVim).

## Plan coverage

Owns plan lines:

- 223: distribution approach and version-handshake documentation
- 304: mirror-repo open decision (documented as: local-path install for V1, mirror repo deferred)

## What needs to happen

- `apps/cli/README.md`:
  - install/build from the monorepo; requirements (Node >= 22)
  - login modes (device flow, `--local`, `--pair` if ticket 09 shipped) and config/credential file locations with env overrides
  - command reference with `--json` examples
  - `trace runtime up` guide (repo registration, what runs where, cleanup semantics)
  - daemon protocol reference: framing, `initialize`/version policy, every method and notification with payload shapes (the protocol doc tickets 10-12 maintain lands or links here)
- `apps/nvim/README.md`:
  - requirements (Neovim >= 0.10, `trace` CLI on `$PATH`, logged in)
  - install: lazy.nvim `dir =` local path, plus the LunarVim `lvim.plugins` snippet
  - `setup()` option reference, default keymaps table, statusline component usage
  - workflow tour matching the north-star UX (switcher, jump, session view, `:Trace new`, worktree terminal)
  - troubleshooting via `:checkhealth trace`
- Root docs: add a pointer from `docs/running-trace.md` (or root README) to both.
- Record the distribution decision: local-path install for V1; publishing a `trace.nvim` mirror repo and npm-publishing the CLI stay open, with what would trigger revisiting.

## Dependencies

- [15 - Neovim Plugin Scaffold and RPC Client](15-nvim-plugin-scaffold-and-rpc-client.md) through [19 - Session Create and Worktree Terminal](19-session-create-and-worktree-terminal.md) — documents what shipped.

## Completion requirements

- [x] A fresh user on a clean machine reaches a working nvim session view following only the READMEs
- [x] Every daemon method/notification is documented with its payload shape and the protocol version policy
- [x] LunarVim install snippet verified in an actual LunarVim config
- [x] Keymap and `setup()` references match the implementation (spot-checked, not aspirational)
- [x] Distribution decision recorded with revisit triggers

## Implementation notes

- Write the protocol reference from the golden-transcript test fixtures (tickets 10/12) so docs and tests share a source of truth.
- Keep the workflow tour honest to V1 — do not document channel view or worktree terminals if 18/19 haven't shipped yet; ship docs with the features.

## How to test

1. Clean-machine walkthrough (or fresh user account): follow the READMEs verbatim from clone to a working session view; fix every snag found.
2. Verify each documented keymap/command/option against the code.
3. `:checkhealth trace` troubleshooting section covers the three real failure modes: binary missing, not logged in, version mismatch.
