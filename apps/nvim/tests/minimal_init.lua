-- Minimal init for headless specs: rtp gets the plugin plus plenary.
local here = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":h")
local plugin_root = vim.fn.fnamemodify(here, ":h")
vim.opt.rtp:prepend(plugin_root)

local candidates = {
  os.getenv("PLENARY_DIR") or "",
  vim.fn.expand("~/.local/share/lunarvim/site/pack/lazy/opt/plenary.nvim"),
  vim.fn.expand("~/.local/share/nvim/lazy/plenary.nvim"),
  vim.fn.expand("~/.local/share/nvim/site/pack/packer/start/plenary.nvim"),
}
for _, path in ipairs(candidates) do
  if path ~= "" and vim.fn.isdirectory(path) == 1 then
    vim.opt.rtp:prepend(path)
    break
  end
end
