-- All plugin state lives here, updated ONLY by daemon notification handlers
-- and snapshot responses — the Zustand rule, transplanted. UI modules read
-- state and subscribe to change signals; they never own data.
local M = {
  sessions = {},
  channels = {},
  tickets = {},
  badges = { needsInputCount = 0, mentionCount = 0 },
  connection = "disconnected",
  user = nil,
  org = nil,
}

local subscribers = {}

--- Subscribe to change signals; fn(kind) where kind names what changed
--- ("sessions", "channels", "tickets", "badges", "connection", "init").
--- Returns an unsubscribe function.
function M.subscribe(fn)
  subscribers[fn] = true
  return function()
    subscribers[fn] = nil
  end
end

local function emit(kind)
  for fn in pairs(subscribers) do
    pcall(fn, kind)
  end
end

--- Wire the notification handlers into an rpc client. Called once at startup.
function M.attach(rpc)
  rpc.on_notification("entity/upserted", function(params)
    local table_ref = M[params.type]
    if type(table_ref) == "table" and type(params.entity) == "table" and params.entity.id then
      table_ref[params.entity.id] = params.entity
      emit(params.type)
    end
  end)
  rpc.on_notification("badge/update", function(params)
    M.badges = params
    emit("badges")
  end)
  rpc.on_notification("connection/state", function(params)
    M.connection = params.state or "disconnected"
    emit("connection")
  end)
end

--- Replace an entity table from a list-snapshot response.
function M.apply_snapshot(kind, list)
  local next_table = {}
  for _, entity in ipairs(list or {}) do
    if entity.id then
      next_table[entity.id] = entity
    end
  end
  M[kind] = next_table
  emit(kind)
end

function M.on_initialized(result)
  M.user = result.user
  M.org = result.org
  M.connection = result.connectionState or M.connection
  emit("init")
end

function M.reset()
  M.sessions = {}
  M.channels = {}
  M.tickets = {}
  M.badges = { needsInputCount = 0, mentionCount = 0 }
  M.connection = "disconnected"
  M.user = nil
  M.org = nil
  emit("reset")
end

return M
