local rpc = require("trace.rpc")
local state = require("trace.state")

local here = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":h")

local function stub_cmd(mode)
  return { vim.v.progpath, "--clean", "--headless", "-l", here .. "/stub_daemon.lua", mode }
end

local function wait_for(predicate, ms)
  vim.wait(ms or 4000, predicate, 20)
  return predicate()
end

local function start_stub(mode, opts)
  local ok, err = rpc.start(vim.tbl_extend("force", { cmd = stub_cmd(mode) }, opts or {}))
  assert.is_true(ok, err)
end

describe("trace.rpc", function()
  before_each(function()
    rpc._reset_for_tests()
  end)

  it("completes initialize against the stub daemon", function()
    start_stub("normal")
    local result
    rpc.request("initialize", { protocolVersion = 1 }, function(_, res)
      result = res
    end)
    assert.is_true(wait_for(function()
      return result ~= nil
    end))
    assert.equals("stub", result.cliVersion)
    assert.equals(1, result.protocolVersion)
  end)

  it("reassembles responses split across stdout chunks", function()
    start_stub("split")
    local result
    rpc.request("initialize", { protocolVersion = 1 }, function(_, res)
      result = res
    end)
    assert.is_true(wait_for(function()
      return result ~= nil
    end))
    assert.equals("Stub User", result.user.name)
  end)

  it("handles joined frames and correlates concurrent requests", function()
    start_stub("batch")
    local badges, entity
    rpc.on_notification("badge/update", function(params)
      badges = params
    end)
    rpc.on_notification("entity/upserted", function(params)
      entity = params
    end)

    local first, second
    rpc.request("initialize", { protocolVersion = 1 }, function(_, res)
      first = res
    end)
    -- Two echo requests in flight at once — responses must match by id.
    rpc.request("echo", { marker = "one" }, function(_, res)
      assert.equals("one", res.marker)
    end)
    rpc.request("echo", { marker = "two" }, function(_, res)
      second = res
    end)

    assert.is_true(wait_for(function()
      return first ~= nil and second ~= nil and badges ~= nil and entity ~= nil
    end))
    assert.equals("two", second.marker)
    assert.equals(2, badges.needsInputCount)
    assert.equals("sess-stub", entity.entity.id)
  end)

  it("fails pending requests and reports exit when the daemon dies", function()
    local exit_code, exit_requested
    start_stub("normal", {
      on_exit = function(code, requested)
        exit_code = code
        exit_requested = requested
      end,
    })
    local err
    rpc.request("die", {}, function(e)
      err = e
    end)
    assert.is_true(wait_for(function()
      return err ~= nil and exit_code ~= nil
    end))
    assert.equals("trace daemon exited", err.message)
    assert.equals(7, exit_code)
    assert.is_false(exit_requested)
  end)

  it("rejects requests when no daemon is running", function()
    local err
    rpc.request("anything", {}, function(e)
      err = e
    end)
    assert.is_true(wait_for(function()
      return err ~= nil
    end))
    assert.matches("not running", err.message)
  end)
end)

describe("trace.state", function()
  it("updates only through notification handlers and snapshots", function()
    local captured = {}
    local fake_rpc = {
      on_notification = function(method, fn)
        captured[method] = fn
      end,
    }
    state.reset()
    state.attach(fake_rpc)

    local kinds = {}
    local unsubscribe = state.subscribe(function(kind)
      table.insert(kinds, kind)
    end)

    captured["entity/upserted"]({
      type = "sessions",
      entity = { id = "s1", name = "One", sessionStatus = "needs_input" },
    })
    assert.equals("One", state.sessions.s1.name)

    captured["badge/update"]({ needsInputCount = 3, mentionCount = 1 })
    assert.equals(3, state.badges.needsInputCount)

    captured["connection/state"]({ state = "reconnecting" })
    assert.equals("reconnecting", state.connection)

    state.apply_snapshot("sessions", { { id = "s2", name = "Two" } })
    assert.is_nil(state.sessions.s1)
    assert.equals("Two", state.sessions.s2.name)

    assert.same({ "sessions", "badges", "connection", "sessions" }, kinds)
    unsubscribe()
  end)
end)
