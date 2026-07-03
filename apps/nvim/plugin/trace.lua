-- Registration only: nothing loads (and no daemon spawns) until :Trace runs.
if vim.g.loaded_trace_nvim then
  return
end
vim.g.loaded_trace_nvim = 1

vim.api.nvim_create_user_command("Trace", function(cmd_opts)
  require("trace").command(cmd_opts)
end, {
  nargs = "*",
  complete = function()
    return require("trace").complete()
  end,
  desc = "Trace: sessions, channels, and events inside Neovim",
})
