local rpc = require("trace.rpc")
local channel_view = require("trace.ui.channel")

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

local function buffer_lines(view)
  return vim.api.nvim_buf_get_lines(view.buf, 0, -1, false)
end

local CID = "chan-view"

describe("trace.ui.channel", function()
  before_each(function()
    channel_view._reset_for_tests()
    rpc._reset_for_tests()
    assert.is_true(rpc.start({ cmd = stub_cmd() }))
    request_sync("initialize", { protocolVersion = 1 })
  end)

  it("seeds recent messages, subscribes, and highlights mentions", function()
    channel_view.open(CID)
    local view = channel_view._view(CID)
    assert.is_true(wait_for(function()
      return #buffer_lines(view) >= 2 and buffer_lines(view)[1] ~= ""
    end))
    assert.same(
      { "[09:00] Sam: morning all", "[09:05] Codex (agent): hey @you check this" },
      buffer_lines(view)
    )
    -- Mention line carries the WarningMsg extmark on row 1 (0-based).
    local ns = vim.api.nvim_get_namespaces()["trace-channel"]
    local marks = vim.api.nvim_buf_get_extmarks(view.buf, ns, 0, -1, {})
    assert.is_true(#marks >= 1)
    assert.equals(1, marks[1][2])

    local stats = request_sync("scope/stats").result
    assert.equals(1, stats.subscribes)
    channel_view.close(CID)
  end)

  it("sends via channel/send and appends the live message exactly once", function()
    channel_view.open(CID)
    local view = channel_view._view(CID)
    wait_for(function()
      return #buffer_lines(view) >= 2
    end)

    -- Compose path: the stub acks and pushes the channel/message notification.
    request_sync("channel/send", { channelId = CID, text = "from nvim" })
    assert.is_true(wait_for(function()
      local lines = buffer_lines(view)
      return lines[#lines] == "[10:00] Stub User: from nvim"
    end))

    -- A duplicate notification for the same message id is ignored.
    request_sync("emit", {
      method = "channel/message",
      params = {
        channelId = CID,
        message = {
          id = "m-sent",
          text = "from nvim",
          createdAt = "2026-07-03T10:00:00.000Z",
          mentionsMe = false,
          actor = { type = "user", id = "user-1", name = "Stub User" },
        },
      },
    })
    vim.wait(300, function()
      return false
    end, 50)
    local lines = buffer_lines(view)
    assert.equals("[10:00] Stub User: from nvim", lines[#lines])
    assert.are_not.equals("[10:00] Stub User: from nvim", lines[#lines - 1])
    channel_view.close(CID)
  end)

  it("pages older history in order and balances subscribe/unsubscribe", function()
    channel_view.open(CID)
    local view = channel_view._view(CID)
    assert.is_true(wait_for(function()
      return view.has_more == true and #buffer_lines(view) >= 2
    end))

    channel_view._load_older(CID)
    assert.is_true(wait_for(function()
      return buffer_lines(view)[1] == "[08:00] Sam: ancient message"
    end))
    assert.same({
      "[08:00] Sam: ancient message",
      "[09:00] Sam: morning all",
      "[09:05] Codex (agent): hey @you check this",
    }, buffer_lines(view))
    assert.is_false(view.has_more)
    channel_view.close(CID)

    local stats
    assert.is_true(wait_for(function()
      stats = request_sync("scope/stats").result
      return stats.subscribes == stats.unsubscribes
    end))
  end)
end)
