local M = {}

M.defaults = {
  -- Path to the trace CLI (the daemon host). Defaults to $PATH lookup.
  trace_bin = "trace",
  -- Optional --server URL override passed to the daemon.
  server = nil,
  -- Protocol version this plugin speaks; checked during the initialize handshake.
  protocol_version = 1,
  -- Respawn attempts after unexpected daemon death before going inert.
  respawn_max_attempts = 3,
  keymaps = {
    enabled = true,
    switcher = "<leader>tt",
    next_needs_input = "<leader>tn",
    worktree_terminal = "<leader>tw",
  },
  log_file = vim.fn.stdpath("state") .. "/trace.nvim.log",
}

M.options = vim.deepcopy(M.defaults)

function M.setup(opts)
  M.options = vim.tbl_deep_extend("force", vim.deepcopy(M.defaults), opts or {})
end

return M
