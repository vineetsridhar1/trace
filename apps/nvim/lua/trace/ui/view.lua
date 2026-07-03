-- Shared buffer/window machinery for transcript-style views: a read-only
-- content float with a one-line prompt-buffer input beneath it.
local M = {}

function M.buf_set(buf, start_line, end_line, lines)
  vim.bo[buf].modifiable = true
  vim.api.nvim_buf_set_lines(buf, start_line, end_line, false, lines)
  vim.bo[buf].modifiable = false
end

function M.at_bottom(win, buf)
  if not (win and vim.api.nvim_win_is_valid(win)) then
    return false
  end
  local cursor = vim.api.nvim_win_get_cursor(win)[1]
  return cursor >= vim.api.nvim_buf_line_count(buf) - 1
end

function M.scroll_to_bottom(win, buf)
  if win and vim.api.nvim_win_is_valid(win) then
    vim.api.nvim_win_set_cursor(win, { vim.api.nvim_buf_line_count(buf), 0 })
  end
end

--- Open the content+input float pair.
--- opts: { filetype, on_submit(text), on_close() }
--- Returns { buf, win, input_buf, input_win, close() }.
function M.open_pair(opts)
  local width = math.min(vim.o.columns - 8, 110)
  local height = vim.o.lines - 8
  local col = math.floor((vim.o.columns - width) / 2)
  local row = math.floor((vim.o.lines - height) / 2) - 1

  local buf = vim.api.nvim_create_buf(false, true)
  vim.bo[buf].bufhidden = "wipe"
  vim.bo[buf].filetype = opts.filetype
  vim.bo[buf].modifiable = false
  local win = vim.api.nvim_open_win(buf, true, {
    relative = "editor",
    row = row,
    col = col,
    width = width,
    height = height - 3,
    style = "minimal",
    border = "rounded",
  })
  vim.wo[win].wrap = true
  vim.wo[win].linebreak = true

  local input_buf = vim.api.nvim_create_buf(false, true)
  vim.bo[input_buf].bufhidden = "wipe"
  vim.bo[input_buf].buftype = "prompt"
  vim.fn.prompt_setprompt(input_buf, "> ")
  local input_win = vim.api.nvim_open_win(input_buf, false, {
    relative = "editor",
    row = row + height - 2,
    col = col,
    width = width,
    height = 1,
    style = "minimal",
    border = "rounded",
  })
  vim.fn.prompt_setcallback(input_buf, function(text)
    text = vim.trim(text)
    if text ~= "" then
      opts.on_submit(text)
    end
  end)

  local pair
  local function close()
    for _, w in ipairs({ input_win, win }) do
      if w and vim.api.nvim_win_is_valid(w) then
        vim.api.nvim_win_close(w, true)
      end
    end
  end

  local function focus_input()
    if vim.api.nvim_win_is_valid(input_win) then
      vim.api.nvim_set_current_win(input_win)
      vim.cmd.startinsert({ bang = true })
    end
  end
  vim.keymap.set("n", "i", focus_input, { buffer = buf, nowait = true })
  for _, lhs in ipairs({ "q", "<Esc>" }) do
    vim.keymap.set("n", lhs, function()
      opts.on_close()
    end, { buffer = buf, nowait = true })
  end
  vim.keymap.set("n", "<Esc>", function()
    opts.on_close()
  end, { buffer = input_buf, nowait = true })

  vim.api.nvim_create_autocmd("WinClosed", {
    pattern = tostring(win),
    once = true,
    callback = function()
      opts.on_close()
    end,
  })

  pair = { buf = buf, win = win, input_buf = input_buf, input_win = input_win, close = close }
  return pair
end

return M
