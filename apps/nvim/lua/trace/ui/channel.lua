-- Channel view: message stream + compose, on the shared view machinery.
-- Messages arrive normalized from the daemon (channel/messages pages and
-- channel/message notifications) — never raw events.
local M = {}

local view_helpers = require("trace.ui.view")

local ns = vim.api.nvim_create_namespace("trace-channel")

local views = {} -- channel_id -> view
local handlers_attached = false

local function message_lines(message)
  local stamp = (message.createdAt or ""):sub(12, 16)
  local name = message.actor and (message.actor.name or message.actor.id) or "?"
  if message.actor and message.actor.type == "agent" then
    name = name .. " (agent)"
  end
  local reply = message.parentMessageId and message.parentMessageId ~= vim.NIL and "↳ " or ""
  local lines = {}
  for i, line in ipairs(vim.split(message.text or "", "\n")) do
    if i == 1 then
      table.insert(lines, ("[%s] %s%s: %s"):format(stamp, reply, name, line))
    else
      table.insert(lines, "  " .. line)
    end
  end
  return lines
end

local function highlight_message(view, message, start_line, count)
  if message.mentionsMe then
    for line = start_line, start_line + count - 1 do
      pcall(vim.api.nvim_buf_set_extmark, view.buf, ns, line, 0, {
        end_row = line + 1,
        hl_group = "WarningMsg",
        hl_eol = true,
      })
    end
  end
end

local function append_message(view, message)
  if not message or not message.id or view.ids[message.id] then
    return
  end
  view.ids[message.id] = true
  local lines = message_lines(message)
  local follow = view_helpers.at_bottom(view.win, view.buf)
  local start_line = vim.api.nvim_buf_line_count(view.buf)
  if view.empty then
    view_helpers.buf_set(view.buf, 0, -1, lines)
    start_line = 0
    view.empty = false
  else
    view_helpers.buf_set(view.buf, start_line, start_line, lines)
  end
  highlight_message(view, message, start_line, #lines)
  if follow then
    view_helpers.scroll_to_bottom(view.win, view.buf)
  end
end

local function prepend_messages(view, messages)
  local lines = {}
  local spans = {}
  for _, message in ipairs(messages) do
    if message.id and not view.ids[message.id] then
      view.ids[message.id] = true
      local rendered = message_lines(message)
      table.insert(spans, { message = message, start = #lines, count = #rendered })
      vim.list_extend(lines, rendered)
    end
  end
  if #lines == 0 then
    return
  end
  local saved = view.win
      and vim.api.nvim_win_is_valid(view.win)
      and vim.api.nvim_win_call(view.win, vim.fn.winsaveview)
    or nil
  if view.empty then
    view_helpers.buf_set(view.buf, 0, -1, lines)
    view.empty = false
  else
    view_helpers.buf_set(view.buf, 0, 0, lines)
  end
  for _, span in ipairs(spans) do
    highlight_message(view, span.message, span.start, span.count)
  end
  if saved then
    saved.lnum = saved.lnum + #lines
    saved.topline = saved.topline + #lines
    vim.api.nvim_win_call(view.win, function()
      vim.fn.winrestview(saved)
    end)
  end
end

local function load_older(view)
  if view.loading or view.has_more == false then
    return
  end
  view.loading = true
  require("trace.rpc").request("channel/messages", {
    channelId = view.channel_id,
    before = view.oldest_created_at,
    limit = 50,
  }, function(err, result)
    view.loading = false
    if err or not result or not vim.api.nvim_buf_is_valid(view.buf) then
      return
    end
    view.has_more = result.hasMore == true
    if result.oldestCreatedAt and result.oldestCreatedAt ~= vim.NIL then
      view.oldest_created_at = result.oldestCreatedAt
    end
    prepend_messages(view, result.messages or {})
  end)
end

local function attach_handlers()
  if handlers_attached then
    return
  end
  handlers_attached = true
  require("trace.rpc").on_notification("channel/message", function(params)
    local view = views[params.channelId]
    if view and vim.api.nvim_buf_is_valid(view.buf) then
      append_message(view, params.message)
    end
  end)
end

local function close_view(channel_id)
  local view = views[channel_id]
  if not view then
    return
  end
  views[channel_id] = nil
  require("trace.rpc").request("scope/unsubscribe", {
    scopeType = "channel",
    scopeId = channel_id,
  }, nil)
  view.pair.close()
end

function M.open(channel_id)
  attach_handlers()
  local existing = views[channel_id]
  if existing and vim.api.nvim_win_is_valid(existing.win) then
    vim.api.nvim_set_current_win(existing.win)
    return
  end
  if existing then
    close_view(channel_id)
  end

  local rpc = require("trace.rpc")
  local state = require("trace.state")

  local pair = view_helpers.open_pair({
    filetype = "trace-channel",
    on_submit = function(text)
      rpc.request("channel/send", { channelId = channel_id, text = text }, function(err)
        if err then
          vim.notify("trace: send failed: " .. (err.message or "?"), vim.log.levels.ERROR)
        end
      end)
    end,
    on_close = function()
      close_view(channel_id)
    end,
  })

  local channel = state.channels[channel_id]
  if channel then
    vim.wo[pair.win].winbar = ("#%s (%s)"):format(channel.name, channel.type)
  end

  local view = {
    channel_id = channel_id,
    pair = pair,
    buf = pair.buf,
    win = pair.win,
    ids = {},
    empty = true,
    has_more = nil,
    oldest_created_at = nil,
    loading = false,
  }
  views[channel_id] = view

  rpc.request("scope/subscribe", { scopeType = "channel", scopeId = channel_id }, nil)
  rpc.request("channel/messages", { channelId = channel_id, limit = 50 }, function(err, result)
    if err or not result or not vim.api.nvim_buf_is_valid(view.buf) then
      return
    end
    view.has_more = result.hasMore == true
    if result.oldestCreatedAt and result.oldestCreatedAt ~= vim.NIL then
      view.oldest_created_at = result.oldestCreatedAt
    end
    for _, message in ipairs(result.messages or {}) do
      append_message(view, message)
    end
    view_helpers.scroll_to_bottom(view.win, view.buf)
  end)

  vim.api.nvim_create_autocmd("WinScrolled", {
    pattern = tostring(pair.win),
    callback = function()
      if not views[channel_id] then
        return true
      end
      if vim.fn.line("w0", pair.win) <= 1 and views[channel_id].has_more then
        load_older(views[channel_id])
      end
    end,
  })
end

function M.close(channel_id)
  close_view(channel_id)
end

--- Channel picker (`:Trace channels`) via vim.ui.select.
function M.pick()
  local state = require("trace.state")
  local channels = {}
  for _, channel in pairs(state.channels) do
    table.insert(channels, channel)
  end
  table.sort(channels, function(a, b)
    return (a.name or "") < (b.name or "")
  end)
  if #channels == 0 then
    vim.notify("trace.nvim: no channels — is the daemon healthy?", vim.log.levels.WARN)
    return
  end
  vim.ui.select(channels, {
    prompt = "Trace channels",
    format_item = function(channel)
      return ("#%s (%s, %d members)"):format(channel.name, channel.type, channel.memberCount or 0)
    end,
  }, function(choice)
    if choice then
      M.open(choice.id)
    end
  end)
end

--- Test seams.
function M._view(channel_id)
  return views[channel_id]
end

function M._load_older(channel_id)
  local view = views[channel_id]
  if view then
    load_older(view)
  end
end

function M._reset_for_tests()
  for channel_id in pairs(views) do
    close_view(channel_id)
  end
  handlers_attached = false
end

return M
