local trace = require("trace")
local rpc = require("trace.rpc")
local config = require("trace.config")

local here = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":h")

local function wait_for(predicate, ms)
  vim.wait(ms or 6000, predicate, 20)
  return predicate()
end

--- A shell shim so `trace_bin daemon --stdio` runs the stub daemon. The
--- first spawn works; every respawn exits immediately, driving the plugin
--- through respawn-with-notice into the inert state.
local function make_shim(dir)
  local shim = dir .. "/trace"
  vim.fn.writefile({
    "#!/bin/sh",
    ('count_file="%s/count"'):format(dir),
    'count=$(cat "$count_file" 2>/dev/null || echo 0)',
    "count=$((count+1))",
    'echo "$count" > "$count_file"',
    'if [ "$count" -gt 1 ]; then exit 9; fi',
    ("exec %s --clean --headless -l %s/stub_daemon.lua daemon"):format(vim.v.progpath, here),
  }, shim)
  vim.fn.system({ "chmod", "+x", shim })
  return shim
end

describe("trace lifecycle", function()
  it("initializes, respawns after a crash, then goes inert when respawns fail", function()
    local dir = vim.fn.tempname()
    vim.fn.mkdir(dir, "p")
    config.setup({
      trace_bin = make_shim(dir),
      respawn_max_attempts = 1,
      log_file = dir .. "/trace.log",
    })
    rpc._reset_for_tests()
    trace._reset_for_tests()

    local first_err = "pending"
    trace.ensure_started(function(err)
      first_err = err
    end)
    assert.is_true(wait_for(function()
      return first_err ~= "pending"
    end))
    assert.is_nil(first_err)
    assert.is_true(trace.initialized)
    assert.equals("stub", trace.init_result.cliVersion)

    -- Crash: the daemon dies; the respawned process exits immediately, so
    -- attempts exceed respawn_max_attempts and the plugin degrades to inert.
    rpc.request("die", {}, function() end)
    assert.is_true(wait_for(function()
      return not trace.initialized
    end))
    assert.is_true(wait_for(function()
      return trace.init_error ~= nil and trace.init_error.message:find("giving up") ~= nil
    end, 10000))

    local inert_err
    trace.ensure_started(function(err)
      inert_err = err
    end)
    assert.is_true(wait_for(function()
      return inert_err ~= nil
    end))
    assert.matches("giving up", inert_err.message)
  end)
end)
