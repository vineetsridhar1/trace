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

local scope_subs = 0
local scope_unsubs = 0

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
    elseif frame.method == "scope/subscribe" then
      scope_subs = scope_subs + 1
      send({ jsonrpc = "2.0", id = frame.id, result = { count = 1 } })
    elseif frame.method == "scope/unsubscribe" then
      scope_unsubs = scope_unsubs + 1
      send({ jsonrpc = "2.0", id = frame.id, result = { count = 0 } })
    elseif frame.method == "scope/stats" then
      send({
        jsonrpc = "2.0",
        id = frame.id,
        result = { subscribes = scope_subs, unsubscribes = scope_unsubs },
      })
    elseif frame.method == "session/timeline" then
      local before = frame.params and frame.params.beforeEventId
      if before == nil or before == vim.NIL then
        send({
          jsonrpc = "2.0",
          id = frame.id,
          result = {
            sessionId = frame.params.sessionId,
            hasOlder = true,
            oldestEventId = "evt-old-1",
            nodes = {
              {
                id = "evt-old-1",
                kind = "user_prompt",
                text = "seed prompt",
                timestamp = "t1",
                optimistic = false,
              },
              { id = "evt-old-2", kind = "agent_text", text = "seed answer", timestamp = "t2" },
            },
          },
        })
      else
        send({
          jsonrpc = "2.0",
          id = frame.id,
          result = {
            sessionId = frame.params.sessionId,
            hasOlder = false,
            oldestEventId = "evt-ancient",
            nodes = {
              {
                id = "evt-ancient",
                kind = "user_prompt",
                text = "ancient prompt",
                timestamp = "t0",
                optimistic = false,
              },
            },
          },
        })
      end
    elseif frame.method == "session/prompt" then
      send({ jsonrpc = "2.0", id = frame.id, result = { accepted = true, id = "evt-ack", queued = false } })
      send({
        jsonrpc = "2.0",
        method = "session/nodes",
        params = {
          sessionId = frame.params.sessionId,
          patched = {},
          appended = {
            {
              id = "optimistic:tmp",
              kind = "user_prompt",
              text = frame.params.text,
              timestamp = "tnow",
              optimistic = true,
            },
          },
          count = 1,
        },
      })
    elseif frame.method == "channel/messages" then
      local before = frame.params and frame.params.before
      if before == nil or before == vim.NIL then
        send({
          jsonrpc = "2.0",
          id = frame.id,
          result = {
            channelId = frame.params.channelId,
            hasMore = true,
            oldestCreatedAt = "2026-07-03T09:00:00.000Z",
            messages = {
              {
                id = "m1",
                text = "morning all",
                createdAt = "2026-07-03T09:00:00.000Z",
                parentMessageId = vim.NIL,
                mentionsMe = false,
                actor = { type = "user", id = "u2", name = "Sam" },
              },
              {
                id = "m2",
                text = "hey @you check this",
                createdAt = "2026-07-03T09:05:00.000Z",
                parentMessageId = vim.NIL,
                mentionsMe = true,
                actor = { type = "agent", id = "a1", name = "Codex" },
              },
            },
          },
        })
      else
        send({
          jsonrpc = "2.0",
          id = frame.id,
          result = {
            channelId = frame.params.channelId,
            hasMore = false,
            oldestCreatedAt = "2026-07-03T08:00:00.000Z",
            messages = {
              {
                id = "m0",
                text = "ancient message",
                createdAt = "2026-07-03T08:00:00.000Z",
                parentMessageId = vim.NIL,
                mentionsMe = false,
                actor = { type = "user", id = "u2", name = "Sam" },
              },
            },
          },
        })
      end
    elseif frame.method == "channel/send" then
      send({ jsonrpc = "2.0", id = frame.id, result = { accepted = true, id = "m-sent" } })
      send({
        jsonrpc = "2.0",
        method = "channel/message",
        params = {
          channelId = frame.params.channelId,
          message = {
            id = "m-sent",
            text = frame.params.text,
            createdAt = "2026-07-03T10:00:00.000Z",
            parentMessageId = vim.NIL,
            mentionsMe = false,
            actor = { type = "user", id = "user-1", name = "Stub User" },
          },
        },
      })
    elseif frame.method == "emit" then
      -- Test hook: replay an arbitrary notification through the real pipeline.
      send({ jsonrpc = "2.0", id = frame.id, result = vim.NIL })
      send({ jsonrpc = "2.0", method = frame.params.method, params = frame.params.params })
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
