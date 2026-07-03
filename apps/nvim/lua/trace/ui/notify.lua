-- vim.notify when sessions enter needs_input (and on new mentions), debounced
-- into one notification per burst. Opt out via setup({ notify = { enabled = false } }).
local M = {}

local DEBOUNCE_MS = 500

local attached = false
local seen_status = {} -- session id -> last sessionStatus
local seen_mentions = nil
local pending = {} -- session names entering needs_input this burst
local pending_mentions = 0
local timer = nil

local function flush()
  timer = nil
  local names = pending
  local mentions = pending_mentions
  pending = {}
  pending_mentions = 0
  if #names == 0 and mentions == 0 then
    return
  end
  local config = require("trace.config")
  local jump = config.options.keymaps.next_needs_input or ":Trace next"
  local parts = {}
  if #names > 0 then
    table.insert(parts, ("%s needs input (%s to jump)"):format(table.concat(names, ", "), jump))
  end
  if mentions > 0 then
    table.insert(parts, ("%d new mention%s"):format(mentions, mentions == 1 and "" or "s"))
  end
  vim.notify("trace: " .. table.concat(parts, " · "), vim.log.levels.INFO)
end

local function schedule_flush()
  if timer then
    return
  end
  timer = vim.defer_fn(flush, DEBOUNCE_MS)
end

local function on_change(kind)
  local config = require("trace.config")
  local state = require("trace.state")
  if kind == "sessions" then
    for id, session in pairs(state.sessions) do
      local previous = seen_status[id]
      -- First sight (hydration) records without announcing.
      if
        previous ~= nil
        and previous ~= "needs_input"
        and session.sessionStatus == "needs_input"
        and config.options.notify.enabled
      then
        table.insert(pending, session.name or id)
        schedule_flush()
      end
      seen_status[id] = session.sessionStatus
    end
  elseif kind == "badges" then
    local count = state.badges.mentionCount or 0
    if seen_mentions ~= nil and count > seen_mentions and config.options.notify.enabled then
      pending_mentions = pending_mentions + (count - seen_mentions)
      schedule_flush()
    end
    seen_mentions = count
  end
end

function M.attach()
  if attached then
    return
  end
  attached = true
  require("trace.state").subscribe(on_change)
end

--- Test seam.
function M._reset_for_tests()
  seen_status = {}
  seen_mentions = nil
  pending = {}
  pending_mentions = 0
  timer = nil
end

return M
