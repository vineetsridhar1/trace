# trace.nvim

Trace inside Neovim: a session switcher sorted needs-input-first, streaming
session transcripts with prompting, channel views, statusline badges, and
notifications — all rendered from the `trace` CLI's editor daemon. Neovim owns
rendering and input; the daemon owns transport, state, and normalization.

## Requirements

- Neovim >= 0.10 (plain APIs only; no plugin dependencies)
- the [`trace` CLI](../cli/README.md) on `$PATH` (or `trace_bin` configured)
- logged in: run `trace login` once in a terminal

## Install

Local-path install for V1 (see [Distribution](#distribution)).

**lazy.nvim**

```lua
{
  dir = "~/Developer/trace/apps/nvim",
  name = "trace.nvim",
  config = function()
    require("trace").setup({})
  end,
}
```

**LunarVim** (`~/.config/lvim/config.lua`)

```lua
table.insert(lvim.plugins, {
  dir = "~/Developer/trace/apps/nvim",
  name = "trace.nvim",
  config = function()
    require("trace").setup({})
  end,
})
```

Nothing loads at startup (0.05ms to register `:Trace`); the daemon spawns on
first use.

## setup() reference

Defaults shown; every key is optional.

```lua
require("trace").setup({
  trace_bin = "trace",              -- path to the trace CLI
  server = nil,                     -- optional --server URL override
  protocol_version = 1,             -- handshake version (leave alone)
  respawn_max_attempts = 3,         -- daemon respawns before going inert
  icons = "unicode",                -- or "ascii" for unpatched fonts
  notify = { enabled = true },      -- needs-input / mention notifications
  keymaps = {
    enabled = true,                 -- false registers nothing
    switcher = "<leader>tt",
    next_needs_input = "<leader>tn",
    worktree_terminal = "<leader>tw",
  },
  log_file = vim.fn.stdpath("state") .. "/trace.nvim.log",
})
```

## Workflow

| Mapping / command                | What it does                                                                                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<leader>tt` / `:Trace sessions` | Floating session switcher: needs-input first, then active, then recency, with status glyphs. `<CR>` opens, `q`/`<Esc>` closes. Re-renders live.                                                 |
| `<leader>tn` / `:Trace next`     | Jump straight to the most recent needs-input session; repeat to cycle.                                                                                                                          |
| _(session view)_                 | Transcript streams live; `i` focuses the prompt input, `<CR>` sends (fire-and-forget, optimistic echo), scroll to top pages history, `q` closes. The winbar shows name, tool/model, and status. |
| `:Trace channels`                | Channel picker → message stream + compose. Mentions highlighted.                                                                                                                                |
| `:Trace new`                     | Start a session: repo → branch (repo default) → tool (your default first) → optional prompt. The view opens when the session lands.                                                             |
| `<leader>tw` / `:Trace worktree` | Floating `:terminal` cd'd into the current session's local worktree; toggles, one per session. Remote/not-ready sessions get a notice.                                                          |
| `:Trace status`                  | One-line daemon/connection/badge summary.                                                                                                                                                       |

**Statusline**: `require("trace.ui.statusline").component()` returns a compact
string like `T:2! @1` (needs-input count, mentions), empty when all clear.
lualine example:

```lua
lualine_x = { function() return require("trace.ui.statusline").component() end },
```

## Troubleshooting

`:checkhealth trace` covers the real failure modes with actionable advice:

- **binary missing** — install the CLI or set `trace_bin`
- **not logged in** — `run \`trace login\` in a terminal`, then re-run
- **protocol version mismatch** — update the CLI or the plugin so the
  `initialize` handshake versions match

The daemon's stderr lands in `log_file`. If the daemon dies repeatedly the
plugin goes inert (a notification says so); `:checkhealth trace` explains why.

## Distribution

V1 installs by local path from this monorepo. Publishing a `trace.nvim`
mirror repo for plugin managers is deferred; the revisit trigger is the first
user who wants the plugin without cloning the monorepo.
