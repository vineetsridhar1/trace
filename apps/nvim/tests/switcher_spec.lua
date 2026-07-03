local state = require("trace.state")
local config = require("trace.config")
local switcher = require("trace.ui.switcher")
local statusline = require("trace.ui.statusline")
local notify_mod = require("trace.ui.notify")

local function session(id, name, session_status, agent_status, updated)
  return {
    id = id,
    name = name,
    sessionStatus = session_status,
    agentStatus = agent_status,
    updatedAt = updated,
    lastMessageAt = updated,
    repo = { id = "r1", name = "trace" },
    branch = "main",
  }
end

local function wait_for(predicate, ms)
  vim.wait(ms or 3000, predicate, 20)
  return predicate()
end

describe("trace.ui.switcher", function()
  before_each(function()
    config.setup({})
    state.reset()
    switcher._reset_for_tests()
  end)

  it("sorts needs-input first, then active, then recency", function()
    state.apply_snapshot("sessions", {
      session("s-done", "Done old", "in_review", "done", "2026-07-01T00:00:00.000Z"),
      session("s-active", "Active", "in_progress", "active", "2026-07-02T00:00:00.000Z"),
      session("s-need-old", "Needy old", "needs_input", "done", "2026-07-01T12:00:00.000Z"),
      session("s-need-new", "Needy new", "needs_input", "done", "2026-07-03T00:00:00.000Z"),
      session("s-done-new", "Done new", "merged", "done", "2026-07-03T01:00:00.000Z"),
    })
    local ids = {}
    for _, item in ipairs(switcher.sorted_sessions()) do
      table.insert(ids, item.id)
    end
    assert.same({ "s-need-new", "s-need-old", "s-active", "s-done-new", "s-done" }, ids)
  end)

  it("renders glyphs for every status combination", function()
    assert.equals("●", switcher.status_glyph(session("a", "a", "needs_input", "done")))
    assert.equals("▶", switcher.status_glyph(session("a", "a", "in_progress", "active")))
    assert.equals("✓", switcher.status_glyph(session("a", "a", "in_review", "done")))
    assert.equals("✗", switcher.status_glyph(session("a", "a", "in_progress", "failed")))
    assert.equals("■", switcher.status_glyph(session("a", "a", "in_progress", "stopped")))
    config.setup({ icons = "ascii" })
    assert.equals("!", switcher.status_glyph(session("a", "a", "needs_input", "done")))
    assert.equals(">", switcher.status_glyph(session("a", "a", "in_progress", "active")))
  end)

  it("opens a float from state and re-renders on entity updates", function()
    state.apply_snapshot("sessions", {
      session("s1", "First", "in_progress", "active", "2026-07-03T00:00:00.000Z"),
    })
    switcher.open()
    local buf = vim.api.nvim_get_current_buf()
    assert.equals("trace-switcher", vim.bo[buf].filetype)
    local lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
    assert.matches("First", lines[1])
    assert.matches("▶", lines[1])

    -- A live status change re-renders the open list.
    state.apply_snapshot("sessions", {
      session("s1", "First", "needs_input", "done", "2026-07-03T00:00:00.000Z"),
    })
    assert.is_true(wait_for(function()
      local updated = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
      return updated[1]:find("●") ~= nil
    end))
    switcher._reset_for_tests()
  end)

  it("jump cycles through needs-input sessions by recency", function()
    local opened = {}
    local trace = require("trace")
    local original = trace.open_session
    trace.open_session = function(id)
      table.insert(opened, id)
    end
    state.apply_snapshot("sessions", {
      session("n1", "One", "needs_input", "done", "2026-07-03T02:00:00.000Z"),
      session("n2", "Two", "needs_input", "done", "2026-07-03T01:00:00.000Z"),
      session("other", "Other", "in_progress", "active", "2026-07-03T03:00:00.000Z"),
    })
    switcher.jump_needs_input()
    switcher.jump_needs_input()
    switcher.jump_needs_input()
    trace.open_session = original
    assert.same({ "n1", "n2", "n1" }, opened)
  end)
end)

describe("trace.ui.statusline", function()
  it("formats badge counts and hides when empty", function()
    state.reset()
    assert.equals("", statusline.component())
    state.badges = { needsInputCount = 2, mentionCount = 1 }
    assert.equals("T:2! @1", statusline.component())
    state.badges = { needsInputCount = 0, mentionCount = 0 }
  end)
end)

describe("trace.ui.notify", function()
  before_each(function()
    config.setup({})
    state.reset()
    notify_mod._reset_for_tests()
    notify_mod.attach()
  end)

  it("fires once per needs_input transition, debounced, and respects opt-out", function()
    local messages = {}
    local original = vim.notify
    vim.notify = function(msg)
      table.insert(messages, msg)
    end

    -- Hydration: first sight records silently.
    state.apply_snapshot("sessions", {
      session("s1", "Quiet", "in_progress", "active", "2026-07-03T00:00:00.000Z"),
    })
    vim.wait(700, function()
      return #messages > 0
    end, 50)
    assert.equals(0, #messages)

    -- Transition into needs_input notifies once.
    state.apply_snapshot("sessions", {
      session("s1", "Quiet", "needs_input", "done", "2026-07-03T00:00:00.000Z"),
    })
    vim.wait(1500, function()
      return #messages > 0
    end, 50)
    assert.equals(1, #messages)
    assert.matches("Quiet needs input", messages[1])

    -- Same status again: no re-notification.
    state.apply_snapshot("sessions", {
      session("s1", "Quiet", "needs_input", "done", "2026-07-03T00:00:00.000Z"),
    })
    vim.wait(700, function()
      return #messages > 1
    end, 50)
    assert.equals(1, #messages)

    -- Opt-out silences new transitions.
    config.setup({ notify = { enabled = false } })
    state.apply_snapshot("sessions", {
      session("s1", "Quiet", "in_progress", "active", "2026-07-03T00:00:00.000Z"),
    })
    state.apply_snapshot("sessions", {
      session("s1", "Quiet", "needs_input", "done", "2026-07-03T00:00:00.000Z"),
    })
    vim.wait(700, function()
      return #messages > 1
    end, 50)
    assert.equals(1, #messages)

    vim.notify = original
  end)
end)

describe("keymaps", function()
  it("registers defaults via setup() and nothing when disabled", function()
    pcall(vim.keymap.del, "n", "<leader>tt")
    pcall(vim.keymap.del, "n", "<leader>tn")
    require("trace").setup({})
    assert.is_true(vim.fn.maparg("<leader>tt", "n") ~= "")
    assert.is_true(vim.fn.maparg("<leader>tn", "n") ~= "")

    pcall(vim.keymap.del, "n", "<leader>tt")
    pcall(vim.keymap.del, "n", "<leader>tn")
    require("trace").setup({ keymaps = { enabled = false } })
    assert.equals("", vim.fn.maparg("<leader>tt", "n"))
    assert.equals("", vim.fn.maparg("<leader>tn", "n"))
  end)
end)
