-- Floating session switcher: needs-input first, then active, then recency.
-- Reads state synchronously (hydration happened at initialize) and re-renders
-- live while open as entity/upserted notifications land.
local M = {}

local GLYPHS = {
  unicode = { needs_input = "●", active = "▶", done = "✓", failed = "✗", stopped = "■", other = "·" },
  ascii = { needs_input = "!", active = ">", done = "+", failed = "x", stopped = "-", other = "." },
}

local function glyphs()
  local config = require("trace.config")
  return GLYPHS[config.options.icons] or GLYPHS.unicode
end

function M.status_glyph(session)
  local set = glyphs()
  if session.sessionStatus == "needs_input" then
    return set.needs_input
  end
  if session.agentStatus == "active" then
    return set.active
  end
  if session.agentStatus == "done" then
    return set.done
  end
  if session.agentStatus == "failed" then
    return set.failed
  end
  if session.agentStatus == "stopped" then
    return set.stopped
  end
  return set.other
end

function M.relative_time(iso)
  if not iso or iso == "" then
    return "-"
  end
  local y, mo, d, h, mi, s = iso:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
  if not y then
    return "-"
  end
  local then_utc = os.time({ year = y, month = mo, day = d, hour = h, min = mi, sec = s })
  -- os.time interprets the table as local time; correct to UTC.
  local offset = os.difftime(os.time(), os.time(os.date("!*t")))
  local minutes = math.max(0, math.floor((os.time() - (then_utc + offset)) / 60))
  if minutes < 1 then
    return "now"
  end
  if minutes < 60 then
    return minutes .. "m"
  end
  local hours = math.floor(minutes / 60)
  if hours < 24 then
    return hours .. "h"
  end
  return math.floor(hours / 24) .. "d"
end

local function sort_key(session)
  local bucket = 2
  if session.sessionStatus == "needs_input" then
    bucket = 0
  elseif session.agentStatus == "active" then
    bucket = 1
  end
  return bucket, session.lastMessageAt or session.updatedAt or ""
end

--- Sessions sorted needs-input first, then active, then by recency.
function M.sorted_sessions()
  local state = require("trace.state")
  local sessions = {}
  for _, session in pairs(state.sessions) do
    table.insert(sessions, session)
  end
  table.sort(sessions, function(a, b)
    local bucket_a, recency_a = sort_key(a)
    local bucket_b, recency_b = sort_key(b)
    if bucket_a ~= bucket_b then
      return bucket_a < bucket_b
    end
    return recency_a > recency_b
  end)
  return sessions
end

function M.format_line(session)
  local repo = session.repo and session.repo.name or nil
  local where = repo and (session.branch and (repo .. "#" .. session.branch) or repo) or "-"
  return ("%s %-32s %-24s %s"):format(
    M.status_glyph(session),
    (session.name or session.id):sub(1, 32),
    where:sub(1, 24),
    M.relative_time(session.lastMessageAt or session.updatedAt)
  )
end

local current = nil -- { win, buf, sessions, unsubscribe }

local function close()
  if not current then
    return
  end
  local closing = current
  current = nil
  closing.unsubscribe()
  if vim.api.nvim_win_is_valid(closing.win) then
    vim.api.nvim_win_close(closing.win, true)
  end
end

local function render()
  if not current or not vim.api.nvim_buf_is_valid(current.buf) then
    return
  end
  current.sessions = M.sorted_sessions()
  local lines = {}
  for _, session in ipairs(current.sessions) do
    table.insert(lines, M.format_line(session))
  end
  if #lines == 0 then
    lines = { "no sessions — is the daemon healthy? (:checkhealth trace)" }
  end
  vim.bo[current.buf].modifiable = true
  vim.api.nvim_buf_set_lines(current.buf, 0, -1, false, lines)
  vim.bo[current.buf].modifiable = false
end

local function select_current_line()
  if not current then
    return
  end
  local row = vim.api.nvim_win_get_cursor(current.win)[1]
  local session = current.sessions[row]
  close()
  if session then
    require("trace").open_session(session.id)
  end
end

function M.open()
  if current then
    close()
    return
  end
  local state = require("trace.state")
  local buf = vim.api.nvim_create_buf(false, true)
  vim.bo[buf].bufhidden = "wipe"
  vim.bo[buf].filetype = "trace-switcher"

  local width = math.min(math.max(72, 40), vim.o.columns - 4)
  local height = math.min(math.max(#vim.tbl_keys(state.sessions), 3) + 1, 16)
  local win = vim.api.nvim_open_win(buf, true, {
    relative = "editor",
    row = math.floor((vim.o.lines - height) / 2),
    col = math.floor((vim.o.columns - width) / 2),
    width = width,
    height = height,
    style = "minimal",
    border = "rounded",
    title = " Trace sessions ",
    title_pos = "center",
  })

  current = {
    win = win,
    buf = buf,
    sessions = {},
    unsubscribe = state.subscribe(function(kind)
      if kind == "sessions" or kind == "badges" then
        render()
      end
    end),
  }
  render()

  local function map(lhs, fn)
    vim.keymap.set("n", lhs, fn, { buffer = buf, nowait = true, silent = true })
  end
  map("<CR>", select_current_line)
  map("<Esc>", close)
  map("q", close)
  vim.api.nvim_create_autocmd("WinClosed", {
    pattern = tostring(win),
    once = true,
    callback = close,
  })
end

local last_jump_id = nil

--- Open the most recent needs_input session directly; repeat calls cycle.
function M.jump_needs_input()
  local needing = {}
  for _, session in ipairs(M.sorted_sessions()) do
    if session.sessionStatus == "needs_input" then
      table.insert(needing, session)
    end
  end
  if #needing == 0 then
    vim.notify("trace.nvim: no sessions need input", vim.log.levels.INFO)
    return
  end
  local index = 1
  for i, session in ipairs(needing) do
    if session.id == last_jump_id then
      index = (i % #needing) + 1
      break
    end
  end
  local target = needing[index]
  last_jump_id = target.id
  require("trace").open_session(target.id)
end

--- Test seam.
function M._reset_for_tests()
  close()
  last_jump_id = nil
end

return M
