-- :Trace new — start a session without leaving the editor. Fire-and-forget:
-- session/create gets an ack, then the entity/upserted event opens the view.
local M = {}

local TOOLS = { "claude_code", "codex", "custom", "pi" }

local function pick_tool(default_tool, callback)
  local ordered = {}
  if default_tool and vim.tbl_contains(TOOLS, default_tool) then
    table.insert(ordered, default_tool)
  end
  for _, tool in ipairs(TOOLS) do
    if tool ~= default_tool then
      table.insert(ordered, tool)
    end
  end
  vim.ui.select(ordered, {
    prompt = "Coding tool",
    format_item = function(tool)
      return tool == default_tool and (tool .. " (default)") or tool
    end,
  }, callback)
end

local function open_when_upserted(session_id)
  local state = require("trace.state")
  if state.sessions[session_id] then
    require("trace").open_session(session_id)
    return
  end
  local done = false
  local unsubscribe
  unsubscribe = state.subscribe(function(kind)
    if done or kind ~= "sessions" then
      return
    end
    if state.sessions[session_id] then
      done = true
      unsubscribe()
      require("trace").open_session(session_id)
    end
  end)
  vim.defer_fn(function()
    if not done then
      done = true
      unsubscribe()
      -- The view seeds itself from session/timeline even without the snapshot.
      require("trace").open_session(session_id)
    end
  end, 15000)
end

function M.start()
  local rpc = require("trace.rpc")
  rpc.request("repos/list", {}, function(err, result)
    if err then
      vim.notify("trace: repos/list failed: " .. (err.message or "?"), vim.log.levels.ERROR)
      return
    end
    local repos = (result and result.repos) or {}
    if #repos == 0 then
      vim.notify("trace: no repos in this organization", vim.log.levels.WARN)
      return
    end
    vim.ui.select(repos, {
      prompt = "Repo",
      format_item = function(repo)
        return repo.name
      end,
    }, function(repo)
      if not repo then
        return
      end
      local default_branch = repo.defaultBranch ~= vim.NIL and repo.defaultBranch or nil
      vim.ui.input({ prompt = "Branch: ", default = default_branch or "" }, function(branch)
        if branch == nil then
          return
        end
        local trace = require("trace")
        local user = trace.init_result and trace.init_result.user or nil
        local default_tool = user and user.defaultSessionTool
        if default_tool == vim.NIL then
          default_tool = nil
        end
        pick_tool(default_tool, function(tool)
          if not tool then
            return
          end
          vim.ui.input({ prompt = "Initial prompt (optional): " }, function(prompt)
            if prompt == nil then
              return
            end
            rpc.request("session/create", {
              repoId = repo.id,
              branch = branch ~= "" and branch or nil,
              tool = tool,
              prompt = prompt ~= "" and prompt or nil,
            }, function(create_err, ack)
              if create_err then
                vim.notify(
                  "trace: session/create failed: " .. (create_err.message or "?"),
                  vim.log.levels.ERROR
                )
                return
              end
              vim.notify("trace: session created (" .. ack.id .. ")", vim.log.levels.INFO)
              open_when_upserted(ack.id)
            end)
          end)
        end)
      end)
    end)
  end)
end

return M
