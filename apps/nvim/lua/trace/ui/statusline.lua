-- Statusline component driven by badge/update state. Consumable from lualine
-- (`{ require("trace.ui.statusline").component }`) or any statusline.
local M = {}

local attached = false

local function attach()
  if attached then
    return
  end
  attached = true
  require("trace.state").subscribe(function(kind)
    if kind == "badges" then
      vim.schedule(function()
        vim.cmd.redrawstatus({ bang = true })
      end)
    end
  end)
end

function M.component()
  attach()
  local badges = require("trace.state").badges
  local parts = {}
  if (badges.needsInputCount or 0) > 0 then
    table.insert(parts, ("T:%d!"):format(badges.needsInputCount))
  end
  if (badges.mentionCount or 0) > 0 then
    table.insert(parts, ("@%d"):format(badges.mentionCount))
  end
  return table.concat(parts, " ")
end

return M
