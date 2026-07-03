-- Generic NDJSON JSON-RPC 2.0 client over a spawned job. No Trace domain
-- knowledge lives here: methods are strings, payloads are opaque tables.
local M = {}

local state = {
  job = nil,
  status = "stopped", -- stopped | running | failed
  buffer = "",
  next_id = 0,
  pending = {}, -- id -> callback(err, result)
  handlers = {}, -- method -> { fn, ... }
  opts = nil,
  stopping = false,
}

local function log(line)
  if state.opts and state.opts.log then
    pcall(state.opts.log, line)
  end
end

local function dispatch_frame(frame)
  if frame.method ~= nil then
    local fns = state.handlers[frame.method]
    if fns then
      for _, fn in ipairs(fns) do
        -- Editor-facing callbacks always run on the main loop.
        vim.schedule(function()
          fn(frame.params or {})
        end)
      end
    end
    return
  end
  if frame.id ~= nil then
    local callback = state.pending[frame.id]
    state.pending[frame.id] = nil
    if callback then
      vim.schedule(function()
        callback(frame.error, frame.result)
      end)
    end
  end
end

local function handle_line(line)
  if line == "" then
    return
  end
  local ok, frame = pcall(vim.json.decode, line)
  if not ok or type(frame) ~= "table" then
    log("[rpc] undecodable line: " .. line)
    return
  end
  dispatch_frame(frame)
end

local function on_stdout(_, data)
  -- jobstart streams lines where data[1] continues the previous partial line
  -- and the final element is the next partial (possibly ""). This is the
  -- standard reassembly loop — tolerant of split and joined chunks.
  state.buffer = state.buffer .. (data[1] or "")
  for i = 2, #data do
    handle_line(state.buffer)
    state.buffer = data[i]
  end
end

function M.on_notification(method, fn)
  state.handlers[method] = state.handlers[method] or {}
  table.insert(state.handlers[method], fn)
end

--- Send a request; callback(err, result) runs via vim.schedule.
function M.request(method, params, callback)
  if state.status ~= "running" or not state.job then
    if callback then
      vim.schedule(function()
        callback({ code = -1, message = "trace daemon is not running" }, nil)
      end)
    end
    return nil
  end
  state.next_id = state.next_id + 1
  local id = state.next_id
  if callback then
    state.pending[id] = callback
  end
  local frame = vim.json.encode({
    jsonrpc = "2.0",
    id = id,
    method = method,
    params = params or vim.empty_dict(),
  })
  vim.fn.chansend(state.job, frame .. "\n")
  return id
end

--- Spawn the daemon. opts: { cmd, log(line)?, on_exit(code, requested)? }
--- Returns ok, err.
function M.start(opts)
  if state.status == "running" then
    return true
  end
  state.opts = opts
  state.buffer = ""
  state.stopping = false
  local job = vim.fn.jobstart(opts.cmd, {
    on_stdout = on_stdout,
    on_stderr = function(_, data)
      for _, line in ipairs(data) do
        if line ~= "" then
          log("[daemon] " .. line)
        end
      end
    end,
    on_exit = function(_, code)
      state.job = nil
      state.status = "stopped"
      local pending = state.pending
      state.pending = {}
      for _, callback in pairs(pending) do
        vim.schedule(function()
          callback({ code = -1, message = "trace daemon exited" }, nil)
        end)
      end
      local requested = state.stopping
      if opts.on_exit then
        vim.schedule(function()
          opts.on_exit(code, requested)
        end)
      end
    end,
  })
  if job <= 0 then
    state.status = "failed"
    return false, "failed to spawn: " .. table.concat(opts.cmd, " ")
  end
  state.job = job
  state.status = "running"
  return true
end

function M.stop()
  if not state.job then
    return
  end
  state.stopping = true
  M.request("shutdown", {}, nil)
  local job = state.job
  -- Grace period, then force-kill if the daemon didn't exit on its own.
  vim.defer_fn(function()
    if state.job == job then
      vim.fn.jobstop(job)
    end
  end, 500)
end

function M.status()
  return state.status
end

--- Test seam: drop all client state (does not touch a running job).
function M._reset_for_tests()
  if state.job then
    state.stopping = true
    vim.fn.jobstop(state.job)
  end
  state.job = nil
  state.status = "stopped"
  state.buffer = ""
  state.next_id = 0
  state.pending = {}
  state.handlers = {}
  state.opts = nil
  state.stopping = false
end

return M
