local M = {}

function M.check()
  local health = vim.health
  local config = require("trace.config")
  local trace = require("trace")

  health.start("trace.nvim")

  local bin = config.options.trace_bin
  if vim.fn.executable(bin) ~= 1 then
    health.error(("trace CLI not found (%s)"):format(bin), {
      "install the trace CLI and make sure it is on $PATH",
      "or set require('trace').setup({ trace_bin = '/path/to/trace' })",
    })
    return
  end
  health.ok("trace binary: " .. vim.fn.exepath(bin))

  local version = vim.fn.system({ bin, "--version" })
  if vim.v.shell_error == 0 then
    health.ok("trace version: " .. vim.trim(version))
  else
    health.warn("could not read `trace --version`")
  end

  local done = false
  local init_err
  trace.ensure_started(function(err)
    done = true
    init_err = err
  end)
  vim.wait(8000, function()
    return done
  end, 50)

  if not done then
    health.error("daemon handshake timed out", {
      "check the daemon log: " .. config.options.log_file,
    })
    return
  end
  if init_err then
    local advice
    if init_err.code == -32001 then
      advice = { "run `trace login` in a terminal, then re-run :checkhealth trace" }
    elseif init_err.code == -32003 then
      advice = { "update the trace CLI or trace.nvim so protocol versions match" }
    else
      advice = { "check the daemon log: " .. config.options.log_file }
    end
    health.error("initialize failed: " .. (init_err.message or vim.inspect(init_err)), advice)
    return
  end

  local result = trace.init_result
  health.ok(("handshake OK (cli %s, protocol %d)"):format(result.cliVersion, result.protocolVersion))
  if result.user then
    health.ok(
      ("logged in as %s (org: %s)"):format(
        result.user.name or result.user.id,
        result.org and result.org.name or "none"
      )
    )
  else
    health.warn("daemon reports no signed-in user", { "run `trace login`" })
  end
end

return M
