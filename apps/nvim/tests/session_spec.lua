local rpc = require("trace.rpc")
local session_view = require("trace.ui.session")

local here = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":h")

local function stub_cmd()
  return { vim.v.progpath, "--clean", "--headless", "-l", here .. "/stub_daemon.lua", "daemon" }
end

local function wait_for(predicate, ms)
  vim.wait(ms or 4000, predicate, 20)
  return predicate()
end

local function request_sync(method, params)
  local response
  rpc.request(method, params, function(err, result)
    response = { err = err, result = result }
  end)
  assert.is_true(wait_for(function()
    return response ~= nil
  end))
  return response
end

local function emit(method, params)
  request_sync("emit", { method = method, params = params })
end

local function buffer_lines(view)
  return vim.api.nvim_buf_get_lines(view.buf, 0, -1, false)
end

local SID = "sess-view"

describe("trace.ui.session", function()
  before_each(function()
    session_view._reset_for_tests()
    rpc._reset_for_tests()
    assert.is_true(rpc.start({ cmd = stub_cmd() }))
    request_sync("initialize", { protocolVersion = 1 })
  end)

  it("seeds from session/timeline and subscribes the scope", function()
    session_view.open(SID)
    local view = session_view._view(SID)
    assert.is_true(wait_for(function()
      return #buffer_lines(view) >= 2 and buffer_lines(view)[1] ~= ""
    end))
    assert.same({ "you > seed prompt", "seed answer" }, buffer_lines(view))
    local stats = request_sync("scope/stats").result
    assert.equals(1, stats.subscribes)
    assert.equals(0, stats.unsubscribes)
    session_view.close(SID)
  end)

  it("applies appends and streaming patches in place without duplicates", function()
    session_view.open(SID)
    local view = session_view._view(SID)
    wait_for(function()
      return #view.history > 0
    end)

    emit("session/nodes", {
      sessionId = SID,
      patched = {},
      appended = {
        { id = "g1", kind = "read_group", items = { { toolName = "Read", filePath = "a.ts" } } },
      },
      count = 1,
    })
    assert.is_true(wait_for(function()
      return #view.live == 1
    end))
    assert.same({ "you > seed prompt", "seed answer", "[read] a.ts" }, buffer_lines(view))

    -- Streaming growth patches the same node's line range.
    emit("session/nodes", {
      sessionId = SID,
      patched = {
        {
          index = 0,
          node = {
            id = "g1",
            kind = "read_group",
            items = {
              { toolName = "Read", filePath = "a.ts" },
              { toolName = "Read", filePath = "b.ts" },
            },
          },
        },
      },
      appended = {},
      count = 1,
    })
    assert.is_true(wait_for(function()
      return #buffer_lines(view) == 4
    end))
    assert.same(
      { "you > seed prompt", "seed answer", "[read] a.ts", "[read] b.ts" },
      buffer_lines(view)
    )
    assert.equals(1, #view.live)
    session_view.close(SID)
  end)

  it("shows the optimistic prompt and reconciles without duplication", function()
    session_view.open(SID)
    local view = session_view._view(SID)
    wait_for(function()
      return #view.history > 0
    end)

    -- The stub's session/prompt handler acks and pushes the optimistic append.
    request_sync("session/prompt", { sessionId = SID, text = "do the thing" })
    assert.is_true(wait_for(function()
      return #view.live == 1
    end))
    assert.same(
      { "you > seed prompt", "seed answer", "you > do the thing" },
      buffer_lines(view)
    )

    -- Canonical event patches the optimistic node in place.
    emit("session/nodes", {
      sessionId = SID,
      patched = {
        {
          index = 0,
          node = {
            id = "evt-ack",
            kind = "user_prompt",
            text = "do the thing",
            optimistic = false,
          },
        },
      },
      appended = {},
      count = 1,
    })
    vim.wait(200, function()
      return false
    end, 50)
    assert.same(
      { "you > seed prompt", "seed answer", "you > do the thing" },
      buffer_lines(view)
    )
    assert.equals("evt-ack", view.live[1].node.id)
    session_view.close(SID)
  end)

  it("paginates older history preserving content order", function()
    session_view.open(SID)
    local view = session_view._view(SID)
    assert.is_true(wait_for(function()
      return view.has_older == true
    end))

    -- Simulate scroll-to-top by invoking the same loader the autocmd uses.
    emit("session/nodes", {
      sessionId = SID,
      patched = {},
      appended = { { id = "live-1", kind = "agent_text", text = "live line" } },
      count = 1,
    })
    wait_for(function()
      return #view.live == 1
    end)

    local before_count = #buffer_lines(view)
    view.has_older = true
    require("trace.ui.session")._view(SID).loading_older = false
    -- second page via beforeEventId
    local loader_view = session_view._view(SID)
    loader_view.oldest_event_id = "evt-old-1"
    -- call load_older through the WinScrolled path: directly request timeline
    local response = request_sync("session/timeline", {
      sessionId = SID,
      beforeEventId = "evt-old-1",
      limit = 50,
    })
    session_view._prepend_history(loader_view, response.result.nodes)
    local lines = buffer_lines(view)
    assert.equals(before_count + 1, #lines)
    assert.same(
      { "you > ancient prompt", "you > seed prompt", "seed answer", "live line" },
      lines
    )
    session_view.close(SID)
  end)

  it("balances subscribe/unsubscribe across repeated open/close", function()
    for _ = 1, 10 do
      session_view.open(SID)
      wait_for(function()
        local view = session_view._view(SID)
        return view and #view.history > 0
      end)
      session_view.close(SID)
    end
    local stats
    assert.is_true(wait_for(function()
      stats = request_sync("scope/stats").result
      return stats.subscribes == 10 and stats.unsubscribes == 10
    end))
    assert.equals(stats.subscribes, stats.unsubscribes)
  end)
end)
