-- Stub daemon speaking canned NDJSON, run via `nvim --clean --headless -l`.
-- Modes exercise framing: "split" writes responses in two flushed chunks with
-- a pause; "batch" writes two frames in a single chunk.
local uv = vim.uv or vim.loop
local mode = (_G.arg and _G.arg[1]) or "normal"

local function send(obj)
  io.write(vim.json.encode(obj) .. "\n")
  io.flush()
end

local function send_split(obj)
  local line = vim.json.encode(obj) .. "\n"
  local mid = math.floor(#line / 2)
  io.write(line:sub(1, mid))
  io.flush()
  uv.sleep(80)
  io.write(line:sub(mid + 1))
  io.flush()
end

local INIT_RESULT = {
  cliVersion = "stub",
  protocolVersion = 1,
  connectionState = "connected",
  user = { id = "user-1", name = "Stub User", email = "stub@test" },
  org = { id = "org-1", name = "Stub Org" },
}

for line in io.lines() do
  local ok, frame = pcall(vim.json.decode, line)
  if ok and type(frame) == "table" then
    if frame.method == "initialize" then
      if mode == "split" then
        send_split({ jsonrpc = "2.0", id = frame.id, result = INIT_RESULT })
      else
        send({ jsonrpc = "2.0", id = frame.id, result = INIT_RESULT })
      end
      if mode == "batch" then
        -- Two notification frames in one write: joined-chunk handling.
        local first = vim.json.encode({
          jsonrpc = "2.0",
          method = "badge/update",
          params = { needsInputCount = 2, mentionCount = 1 },
        })
        local second = vim.json.encode({
          jsonrpc = "2.0",
          method = "entity/upserted",
          params = {
            type = "sessions",
            entity = { id = "sess-stub", name = "Stub Session", sessionStatus = "needs_input" },
          },
        })
        io.write(first .. "\n" .. second .. "\n")
        io.flush()
      end
    elseif frame.method == "echo" then
      send({ jsonrpc = "2.0", id = frame.id, result = frame.params })
    elseif frame.method == "sessions/list" then
      send({ jsonrpc = "2.0", id = frame.id, result = { sessions = {} } })
    elseif frame.method == "channels/list" then
      send({ jsonrpc = "2.0", id = frame.id, result = { channels = {} } })
    elseif frame.method == "die" then
      os.exit(7)
    elseif frame.method == "shutdown" then
      send({ jsonrpc = "2.0", id = frame.id, result = vim.NIL })
      os.exit(0)
    elseif frame.id ~= nil then
      send({
        jsonrpc = "2.0",
        id = frame.id,
        error = { code = -32601, message = "Method not found: " .. tostring(frame.method) },
      })
    end
  end
end
