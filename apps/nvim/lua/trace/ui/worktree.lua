-- Worktree escape hatch: a floating :terminal cd'd into a local session's
-- worktree. One terminal per session, toggled; the path is read from current
-- state at open time (it can change on retry/move).
local M = {}

local terminals = {} -- session_id -> { buf, win }

local function open_float(buf)
  local width = math.min(vim.o.columns - 8, 120)
  local height = math.max(vim.o.lines - 10, 10)
  return vim.api.nvim_open_win(buf, true, {
    relative = "editor",
    row = math.floor((vim.o.lines - height) / 2),
    col = math.floor((vim.o.columns - width) / 2),
    width = width,
    height = height,
    style = "minimal",
    border = "rounded",
  })
end

function M.toggle(session_id)
  local state = require("trace.state")
  local session = state.sessions[session_id]
  if not session then
    vim.notify("trace: unknown session", vim.log.levels.WARN)
    return
  end

  local existing = terminals[session_id]
  if existing and existing.win and vim.api.nvim_win_is_valid(existing.win) then
    vim.api.nvim_win_close(existing.win, true)
    existing.win = nil
    return
  end

  local workdir = session.workdir
  if workdir == vim.NIL then
    workdir = nil
  end
  if not workdir or workdir == "" or session.worktreeDeleted then
    vim.notify(
      "trace: no local worktree for this session (remote runtime, or workspace not ready yet)",
      vim.log.levels.WARN
    )
    return
  end
  if vim.fn.isdirectory(workdir) ~= 1 then
    vim.notify("trace: worktree path does not exist here: " .. workdir, vim.log.levels.WARN)
    return
  end

  -- Reuse the live terminal buffer when it survives a toggle.
  if existing and existing.buf and vim.api.nvim_buf_is_valid(existing.buf) then
    existing.win = open_float(existing.buf)
    return
  end

  local buf = vim.api.nvim_create_buf(false, true)
  local win = open_float(buf)
  vim.fn.termopen(vim.o.shell, { cwd = workdir })
  terminals[session_id] = { buf = buf, win = win }
  vim.cmd.startinsert()
end

--- Resolve the session for <leader>tw: the session view under the cursor,
--- else the most recently opened session view.
function M.toggle_current()
  local session_id = require("trace.ui.session").current_session_id()
  if not session_id then
    vim.notify("trace: open a session view first (<leader>tt)", vim.log.levels.WARN)
    return
  end
  M.toggle(session_id)
end

--- Test seam.
function M._terminal(session_id)
  return terminals[session_id]
end

function M._reset_for_tests()
  for _, terminal in pairs(terminals) do
    if terminal.win and vim.api.nvim_win_is_valid(terminal.win) then
      vim.api.nvim_win_close(terminal.win, true)
    end
    if terminal.buf and vim.api.nvim_buf_is_valid(terminal.buf) then
      vim.api.nvim_buf_delete(terminal.buf, { force = true })
    end
  end
  terminals = {}
end

return M
