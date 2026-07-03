-- Session view: transcript buffer projected from normalized protocol nodes,
-- prompt input below, viewport-driven scope subscription, scroll-back paging.
-- The buffer is a projection of node state — a nodeIndex → line-range index
-- keeps patches surgical; appends never re-render the whole buffer.
local M = {}

local view_helpers = require("trace.ui.view")

local ns = vim.api.nvim_create_namespace("trace-session")

local HIGHLIGHTS = {
  user_prompt = "Identifier",
  agent_text = "Normal",
  tool_use = "Comment",
  command = "Statement",
  read_group = "Comment",
  plan = "Type",
  question = "WarningMsg",
  pr = "Special",
  error = "ErrorMsg",
}

-- Table-driven node rendering: unknown kinds fail soft as plain text.
local renderers = {
  user_prompt = function(node)
    local lines = {}
    for i, line in ipairs(vim.split(node.text or "", "\n")) do
      lines[i] = (i == 1 and "you > " or "      ") .. line
    end
    return lines
  end,
  agent_text = function(node)
    return vim.split(node.text or "", "\n")
  end,
  tool_use = function(node)
    local summary = node.summary
    return { ("[tool] %s%s"):format(node.name or "?", summary and summary ~= "" and (" " .. summary) or "") }
  end,
  command = function(node)
    local exit = node.exitCode ~= vim.NIL and node.exitCode ~= nil and (" (exit %d)"):format(node.exitCode) or ""
    return { ("$ %s%s"):format(node.command or "", exit) }
  end,
  read_group = function(node)
    local lines = {}
    for _, item in ipairs(node.items or {}) do
      table.insert(lines, ("[%s] %s"):format((item.toolName or "read"):lower(), item.filePath or ""))
    end
    return lines
  end,
  plan = function(node)
    local lines = { ("[plan] %s"):format(node.filePath or "") }
    for _, line in ipairs(vim.split(node.content or "", "\n")) do
      table.insert(lines, "  " .. line)
    end
    return lines
  end,
  question = function(node)
    local lines = {}
    for _, question in ipairs(node.questions or {}) do
      table.insert(lines, ("[question] %s"):format(question.question or ""))
      for i, option in ipairs(question.options or {}) do
        table.insert(lines, ("  (%d) %s"):format(i, option.label or ""))
      end
    end
    return lines
  end,
  pr = function(node)
    return { ("[pr] %s%s"):format(node.action or "", node.url and (" " .. node.url) or "") }
  end,
  error = function(node)
    return { ("[error] %s"):format(node.message or "") }
  end,
}

local function render_node(node)
  local renderer = renderers[node.kind]
  if renderer then
    local ok, lines = pcall(renderer, node)
    if ok and #lines > 0 then
      return lines
    end
  end
  return { ("[%s] %s"):format(node.kind or "?", node.text or node.id or "") }
end

local views = {} -- session_id -> view
local handlers_attached = false

local function buf_set(view, start_line, end_line, lines)
  view_helpers.buf_set(view.buf, start_line, end_line, lines)
end

local function highlight_range(view, node, start_line, count)
  local group = HIGHLIGHTS[node.kind]
  if not group or group == "Normal" then
    return
  end
  for line = start_line, start_line + count - 1 do
    pcall(vim.api.nvim_buf_set_extmark, view.buf, ns, line, 0, {
      end_row = line + 1,
      hl_group = group,
      hl_eol = true,
    })
  end
end

local function segment_offset(view)
  local offset = 0
  for _, range in ipairs(view.history) do
    offset = offset + range.count
  end
  return offset
end

local function live_start(view, index)
  local line = segment_offset(view)
  for i = 1, index - 1 do
    line = line + (view.live[i] and view.live[i].count or 0)
  end
  return line
end

local function at_bottom(view)
  return view_helpers.at_bottom(view.win, view.buf)
end

local function scroll_to_bottom(view)
  view_helpers.scroll_to_bottom(view.win, view.buf)
end

--- Apply a session/nodes delta { patched, appended, truncateFrom, count }.
function M._apply_delta(view, delta)
  local follow = at_bottom(view)

  if delta.truncateFrom ~= nil then
    local from_index = delta.truncateFrom + 1 -- lua 1-based
    local start_line = live_start(view, from_index)
    buf_set(view, start_line, -1, {})
    for i = #view.live, from_index, -1 do
      table.remove(view.live, i)
    end
  end

  for _, patch in ipairs(delta.patched or {}) do
    local index = patch.index + 1
    local existing = view.live[index]
    if existing then
      local start_line = live_start(view, index)
      local lines = render_node(patch.node)
      buf_set(view, start_line, start_line + existing.count, lines)
      existing.count = #lines
      existing.node = patch.node
      highlight_range(view, patch.node, start_line, #lines)
    end
  end

  for _, node in ipairs(delta.appended or {}) do
    local lines = render_node(node)
    local start_line = vim.api.nvim_buf_line_count(view.buf)
    if view.empty then
      -- Replace the initial blank line instead of appending after it.
      buf_set(view, 0, -1, lines)
      start_line = 0
      view.empty = false
    else
      buf_set(view, start_line, start_line, lines)
    end
    table.insert(view.live, { count = #lines, node = node })
    highlight_range(view, node, start_line, #lines)
  end

  if follow then
    scroll_to_bottom(view)
  end
end

--- Prepend a page of history nodes (from session/timeline), preserving view.
function M._prepend_history(view, nodes)
  -- Dedup anything the live segment already shows.
  local live_ids = {}
  for _, range in ipairs(view.live) do
    live_ids[range.node.id] = true
  end
  local lines = {}
  local ranges = {}
  for _, node in ipairs(nodes) do
    if not live_ids[node.id] then
      local rendered = render_node(node)
      table.insert(ranges, { count = #rendered, node = node })
      vim.list_extend(lines, rendered)
    end
  end
  if #lines == 0 then
    return 0
  end

  local saved = view.win and vim.api.nvim_win_is_valid(view.win)
      and vim.api.nvim_win_call(view.win, vim.fn.winsaveview)
    or nil
  if view.empty then
    buf_set(view, 0, -1, lines)
    view.empty = false
  else
    buf_set(view, 0, 0, lines)
  end
  -- history grows at the front: new ranges go before existing history
  for i = #ranges, 1, -1 do
    table.insert(view.history, 1, ranges[i])
  end
  local line = 0
  for _, range in ipairs(view.history) do
    highlight_range(view, range.node, line, range.count)
    line = line + range.count
  end
  if saved then
    saved.lnum = saved.lnum + #lines
    saved.topline = saved.topline + #lines
    vim.api.nvim_win_call(view.win, function()
      vim.fn.winrestview(saved)
    end)
  end
  return #lines
end

local function update_winbar(view)
  if not (view.win and vim.api.nvim_win_is_valid(view.win)) then
    return
  end
  local state = require("trace.state")
  local session = state.sessions[view.session_id]
  if not session then
    return
  end
  local model = session.model and session.model ~= vim.NIL and (" · " .. session.model) or ""
  vim.wo[view.win].winbar = ("%s [%s%s] %s · %s"):format(
    session.name or view.session_id,
    session.tool or "?",
    model,
    session.agentStatus or "?",
    session.sessionStatus or "?"
  )
end

local function attach_handlers()
  if handlers_attached then
    return
  end
  handlers_attached = true
  local rpc = require("trace.rpc")
  rpc.on_notification("session/nodes", function(params)
    local view = views[params.sessionId]
    if view and vim.api.nvim_buf_is_valid(view.buf) then
      M._apply_delta(view, params)
    end
  end)
end

local function load_older(view)
  if view.loading_older or view.has_older == false then
    return
  end
  view.loading_older = true
  local rpc = require("trace.rpc")
  rpc.request("session/timeline", {
    sessionId = view.session_id,
    beforeEventId = view.oldest_event_id,
    limit = 50,
  }, function(err, result)
    view.loading_older = false
    if err or not result then
      return
    end
    view.has_older = result.hasOlder == true
    if result.oldestEventId and result.oldestEventId ~= vim.NIL then
      view.oldest_event_id = result.oldestEventId
    end
    if vim.api.nvim_buf_is_valid(view.buf) then
      M._prepend_history(view, result.nodes or {})
    end
  end)
end

local function close_view(session_id)
  local view = views[session_id]
  if not view then
    return
  end
  views[session_id] = nil
  view.unsubscribe_state()
  require("trace.rpc").request("scope/unsubscribe", {
    scopeType = "session",
    scopeId = session_id,
  }, nil)
  if view.pair then
    view.pair.close()
  end
end

local function send_prompt(session_id, text)
  text = vim.trim(text)
  if text == "" then
    return
  end
  require("trace.rpc").request("session/prompt", {
    sessionId = session_id,
    text = text,
  }, function(err, result)
    if err then
      vim.notify("trace: prompt failed: " .. (err.message or "?"), vim.log.levels.ERROR)
    elseif result and result.queued then
      vim.notify("trace: prompt queued (agent is busy)", vim.log.levels.INFO)
    end
  end)
end

function M.open(session_id)
  attach_handlers()
  local existing = views[session_id]
  if existing and vim.api.nvim_win_is_valid(existing.win) then
    vim.api.nvim_set_current_win(existing.win)
    return
  end
  if existing then
    close_view(session_id)
  end

  local state = require("trace.state")
  local rpc = require("trace.rpc")

  local pair = view_helpers.open_pair({
    filetype = "trace-session",
    on_submit = function(text)
      send_prompt(session_id, text)
    end,
    on_close = function()
      close_view(session_id)
    end,
  })
  local buf, win, input_buf, input_win = pair.buf, pair.win, pair.input_buf, pair.input_win

  local view = {
    session_id = session_id,
    pair = pair,
    buf = buf,
    win = win,
    input_buf = input_buf,
    input_win = input_win,
    live = {},
    history = {},
    empty = true,
    has_older = nil,
    oldest_event_id = nil,
    loading_older = false,
    unsubscribe_state = state.subscribe(function(kind)
      if kind == "sessions" then
        update_winbar(views[session_id])
      end
    end),
  }
  views[session_id] = view
  update_winbar(view)

  -- Viewport enters: live subscription first, then seed history behind it.
  rpc.request("scope/subscribe", { scopeType = "session", scopeId = session_id }, nil)
  load_older(view)

  -- Scroll-to-top pagination.
  vim.api.nvim_create_autocmd("WinScrolled", {
    pattern = tostring(win),
    callback = function()
      if not views[session_id] then
        return true
      end
      if vim.fn.line("w0", win) <= 1 and views[session_id].has_older then
        load_older(views[session_id])
      end
    end,
  })
  scroll_to_bottom(view)
end

function M.close(session_id)
  close_view(session_id)
end

--- Test seams.
function M._view(session_id)
  return views[session_id]
end

function M._reset_for_tests()
  for session_id in pairs(views) do
    close_view(session_id)
  end
  handlers_attached = false
end

return M
