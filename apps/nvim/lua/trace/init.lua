local config = require("trace.config")

local M = {}

M.initialized = false
M.init_error = nil -- last initialize/spawn failure, surfaced by :checkhealth
M.init_result = nil

local respawn_attempts = 0
local attached = false
local inert = false
local leave_autocmd = nil
local starting = false
local waiting = {}

local function map_key(lhs, fn, desc)
  if type(lhs) == "string" and lhs ~= "" then
    vim.keymap.set("n", lhs, fn, { desc = desc, silent = true })
  end
end

function M.setup(opts)
  config.setup(opts)
  local keymaps = config.options.keymaps
  if keymaps.enabled then
    map_key(keymaps.switcher, function()
      M.command({ fargs = { "sessions" } })
    end, "Trace: session switcher")
    map_key(keymaps.next_needs_input, function()
      M.command({ fargs = { "next" } })
    end, "Trace: jump to needs-input session")
  end
end

local function log_line(line)
  local file = io.open(config.options.log_file, "a")
  if file then
    file:write(os.date("%H:%M:%S "), line, "\n")
    file:close()
  end
end

local function build_cmd()
  local cmd = { config.options.trace_bin, "daemon", "--stdio" }
  if config.options.server then
    table.insert(cmd, "--server")
    table.insert(cmd, config.options.server)
  end
  return cmd
end

--- Spawn the daemon and complete the initialize handshake (lazily — nothing
--- runs at editor startup). callback(err) with err == nil on success.
function M.ensure_started(callback)
  callback = callback or function() end
  local rpc = require("trace.rpc")
  local state = require("trace.state")
  if M.initialized and rpc.status() == "running" then
    callback(nil)
    return
  end
  if inert then
    callback(M.init_error or { message = "trace.nvim is inert after repeated daemon failures" })
    return
  end
  -- Queue concurrent callers (e.g. :Trace during a respawn backoff) behind
  -- the single in-flight startup instead of double-spawning daemons.
  table.insert(waiting, callback)
  if starting then
    return
  end
  starting = true
  local function settle(err)
    starting = false
    local callbacks = waiting
    waiting = {}
    for _, waiter in ipairs(callbacks) do
      pcall(waiter, err)
    end
  end
  if not attached then
    state.attach(rpc)
    attached = true
  end
  if not leave_autocmd then
    -- Shut the daemon down with the editor so exits are clean, not crashes.
    leave_autocmd = vim.api.nvim_create_autocmd("VimLeavePre", {
      callback = function()
        require("trace.rpc").stop()
      end,
    })
  end

  local ok, spawn_err = rpc.start({
    cmd = build_cmd(),
    log = log_line,
    on_exit = function(code, requested)
      M.initialized = false
      if requested then
        return
      end
      respawn_attempts = respawn_attempts + 1
      if respawn_attempts > config.options.respawn_max_attempts then
        inert = true
        M.init_error = {
          message = ("daemon exited %d times; giving up"):format(respawn_attempts),
        }
        vim.notify(
          "trace.nvim: daemon keeps dying — plugin is inert (see :checkhealth trace)",
          vim.log.levels.ERROR
        )
        return
      end
      vim.notify(
        ("trace.nvim: daemon exited (code %d), respawning…"):format(code),
        vim.log.levels.WARN
      )
      vim.defer_fn(function()
        M.ensure_started()
      end, 500 * 2 ^ (respawn_attempts - 1))
    end,
  })
  if not ok then
    M.init_error = { message = spawn_err }
    settle(M.init_error)
    return
  end

  rpc.request("initialize", {
    protocolVersion = config.options.protocol_version,
    clientInfo = { name = "trace.nvim", version = "0.1.0" },
  }, function(err, result)
    if err then
      M.init_error = err
      M.initialized = false
      settle(err)
      return
    end
    M.init_error = nil
    M.init_result = result
    M.initialized = true
    respawn_attempts = 0
    state.on_initialized(result)
    require("trace.ui.notify").attach()
    -- Seed snapshots so the switcher has data immediately.
    rpc.request("sessions/list", {}, function(list_err, list_result)
      if not list_err and list_result then
        state.apply_snapshot("sessions", list_result.sessions)
      end
    end)
    rpc.request("channels/list", {}, function(list_err, list_result)
      if not list_err and list_result then
        state.apply_snapshot("channels", list_result.channels)
      end
    end)
    settle(nil)
  end)
end

--- Open a session view. Ticket 17 supplies the implementation; the switcher
--- and jump mapping route through here.
function M.open_session(session_id)
  local ok, session_view = pcall(require, "trace.ui.session")
  if ok and session_view.open then
    session_view.open(session_id)
    return
  end
  vim.notify("trace.nvim: session view not available yet (ticket 17)", vim.log.levels.WARN)
end

-- :Trace subcommands; UI tickets register theirs here.
M.subcommands = {
  sessions = function()
    require("trace.ui.switcher").open()
  end,
  channels = function()
    require("trace.ui.channel").pick()
  end,
  next = function()
    require("trace.ui.switcher").jump_needs_input()
  end,
  status = function()
    local state = require("trace.state")
    local rpc = require("trace.rpc")
    vim.notify(
      ("trace.nvim: daemon %s | connection %s | needs input: %d | mentions: %d"):format(
        rpc.status(),
        state.connection,
        state.badges.needsInputCount or 0,
        state.badges.mentionCount or 0
      )
    )
  end,
}

function M.command(cmd_opts)
  local args = cmd_opts.fargs
  local name = args[1] or "status"
  local sub = M.subcommands[name]
  if not sub then
    vim.notify("trace.nvim: unknown subcommand: " .. name, vim.log.levels.ERROR)
    return
  end
  M.ensure_started(function(err)
    if err then
      vim.notify(
        "trace.nvim: " .. (err.message or vim.inspect(err)),
        vim.log.levels.ERROR
      )
      return
    end
    sub(args)
  end)
end

--- Test seam: reset lifecycle state (respawn counters, inert flag).
function M._reset_for_tests()
  respawn_attempts = 0
  inert = false
  starting = false
  waiting = {}
  M.initialized = false
  M.init_error = nil
  M.init_result = nil
end

function M.complete()
  local names = vim.tbl_keys(M.subcommands)
  table.sort(names)
  return names
end

return M
