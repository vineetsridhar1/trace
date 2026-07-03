local rpc = require("trace.rpc")
local state = require("trace.state")
local create = require("trace.ui.create")
local worktree = require("trace.ui.worktree")

local here = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":h")

local function stub_cmd()
  return { vim.v.progpath, "--clean", "--headless", "-l", here .. "/stub_daemon.lua", "daemon" }
end

local function wait_for(predicate, ms)
  vim.wait(ms or 4000, predicate, 20)
  return predicate()
end

describe("trace.ui.create (:Trace new)", function()
  before_each(function()
    rpc._reset_for_tests()
    state.reset()
    assert.is_true(rpc.start({ cmd = stub_cmd() }))
    state.attach(rpc)
    local done = false
    rpc.request("initialize", { protocolVersion = 1 }, function()
      done = true
    end)
    wait_for(function()
      return done
    end)
  end)

  it("drives repo/branch/tool/prompt and opens the created session on upsert", function()
    -- Deterministic UI: auto-pick the first repo/tool, keep defaults for input.
    local branch_default
    local original_select = vim.ui.select
    local original_input = vim.ui.input
    vim.ui.select = function(items, _, on_choice)
      on_choice(items[1])
    end
    vim.ui.input = function(opts, on_confirm)
      if opts.prompt:find("Branch") then
        branch_default = opts.default
        on_confirm(opts.default)
      else
        on_confirm("build the thing")
      end
    end
    local opened = {}
    local trace = require("trace")
    local original_open = trace.open_session
    trace.open_session = function(id)
      table.insert(opened, id)
    end

    create.start()
    assert.is_true(wait_for(function()
      return #opened == 1
    end))

    vim.ui.select = original_select
    vim.ui.input = original_input
    trace.open_session = original_open

    -- The stub echoed the create back as entity/upserted before the view opened.
    assert.equals("main", branch_default)
    assert.same({ "sess-created" }, opened)
    assert.equals("build the thing", state.sessions["sess-created"].name)
  end)
end)

describe("trace.ui.worktree", function()
  before_each(function()
    worktree._reset_for_tests()
    state.reset()
  end)

  it("opens a terminal in the worktree and toggles, reusing the buffer", function()
    local dir = vim.fn.tempname()
    vim.fn.mkdir(dir, "p")
    state.apply_snapshot("sessions", {
      { id = "s-local", name = "Local", workdir = dir, worktreeDeleted = false },
    })

    worktree.toggle("s-local")
    local terminal = worktree._terminal("s-local")
    assert.is_truthy(terminal)
    assert.equals("terminal", vim.bo[terminal.buf].buftype)
    assert.is_true(vim.api.nvim_win_is_valid(terminal.win))
    local first_buf = terminal.buf

    -- Toggle closes the window but keeps the terminal buffer alive.
    worktree.toggle("s-local")
    assert.is_false(terminal.win and vim.api.nvim_win_is_valid(terminal.win) or false)
    assert.is_true(vim.api.nvim_buf_is_valid(first_buf))

    -- Reopening reuses the same buffer.
    worktree.toggle("s-local")
    assert.equals(first_buf, worktree._terminal("s-local").buf)
  end)

  it("explains instead of opening for sessions without a local worktree", function()
    state.apply_snapshot("sessions", {
      { id = "s-cloud", name = "Cloud", workdir = vim.NIL, worktreeDeleted = false },
    })
    local messages = {}
    local original = vim.notify
    vim.notify = function(msg)
      table.insert(messages, msg)
    end
    worktree.toggle("s-cloud")
    vim.notify = original
    assert.is_nil(worktree._terminal("s-cloud"))
    assert.matches("no local worktree", messages[1])
  end)
end)
