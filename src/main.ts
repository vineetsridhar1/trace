import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn, ChildProcess } from 'node:child_process';
import started from 'electron-squirrel-startup';

if (started) {
  app.quit();
}

let targetDir = process.cwd();

// ---------------------------------------------------------------------------
// Hook injection – write .claude/settings.json in the target (cwd) directory
// ---------------------------------------------------------------------------
function injectHooks(dir: string) {
  const claudeDir = path.join(dir, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');

  const curlCmd =
    'curl -sS --connect-timeout 1 --max-time 2 -X POST http://localhost:3100/events -H "Content-Type: application/json" -d "$(cat)" >/dev/null 2>&1 || true';

  const hookHandlers = [{ type: 'command', command: curlCmd }];
  const desiredHooks = {
    PostToolUse:      [{ matcher: '.*', hooks: hookHandlers }],
    UserPromptSubmit: [{ hooks: hookHandlers }],
    Stop:             [{ hooks: hookHandlers }],
  };

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      // If parsing fails, start fresh
    }
  }

  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  // Merge hooks – don't clobber existing non-hook settings
  const existingHooks = (settings.hooks ?? {}) as Record<string, unknown>;
  settings.hooks = { ...existingHooks, ...desiredHooks };

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`Hooks injected into ${settingsPath}`);
}

// ---------------------------------------------------------------------------
// Worktree management
// ---------------------------------------------------------------------------
const WORKTREE_BASE_NAME = '.trace-worktrees';
const runningProcesses = new Map<string, ChildProcess>();
const suppressSyntheticStopFor = new Set<string>();
const SPAWN_CLAUDE_CHANNEL = 'spawn-claude';
const DELETE_WORKTREE_CHANNEL = 'delete-worktree';
const SERVER_URL = process.env.TRACE_SERVER_URL ?? 'http://localhost:3100';
const MAX_CAPTURE_CHARS = 20_000;
const CLAUDE_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS ?? 120_000);

function getWorktreeBase(): string {
  return path.join(targetDir, WORKTREE_BASE_NAME);
}

function getWorktreePath(messageId: string): string {
  return path.join(getWorktreeBase(), messageId);
}

function runProcess(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    let done = false;

    const finish = (result: { code: number; stdout: string; stderr: string }) => {
      if (done) return;
      done = true;
      resolve(result);
    };

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', (err) => {
      stderr += String(err);
      finish({ code: 1, stdout, stderr });
    });

    child.on('close', (code) => {
      finish({ code: code ?? 1, stdout, stderr });
    });
  });
}

function appendClaudeDebugLog(messageId: string, line: string) {
  try {
    const base = getWorktreeBase();
    if (!fs.existsSync(base)) {
      fs.mkdirSync(base, { recursive: true });
    }
    const logPath = path.join(base, 'claude-debug.log');
    const stamped = `[${new Date().toISOString()}] [${messageId.slice(0, 8)}] ${line}\n`;
    fs.appendFileSync(logPath, stamped);
  } catch (err) {
    console.error('Failed to write Claude debug log:', err);
  }
}

function ensureWorktree(messageId: string): Promise<string> {
  const worktreePath = getWorktreePath(messageId);

  if (fs.existsSync(worktreePath)) {
    injectHooks(worktreePath);
    return Promise.resolve(worktreePath);
  }

  const base = getWorktreeBase();
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }

  const branchName = `trace/${messageId.slice(0, 8)}`;

  return new Promise<string>((resolve, reject) => {
    const result = spawn('git', ['worktree', 'add', '-b', branchName, worktreePath], {
      cwd: targetDir,
      stdio: 'pipe',
    });

    let stderr = '';
    result.stderr?.on('data', (d) => (stderr += d.toString()));

    result.on('close', (code) => {
      if (code !== 0) {
        // Branch might already exist, try without -b
        const retry = spawn('git', ['worktree', 'add', worktreePath, branchName], {
          cwd: targetDir,
          stdio: 'pipe',
        });
        let retryErr = '';
        retry.stderr?.on('data', (d) => (retryErr += d.toString()));
        retry.on('close', (retryCode) => {
          if (retryCode !== 0) {
            reject(new Error(`Failed to create worktree: ${stderr} / ${retryErr}`));
          } else {
            injectHooks(worktreePath);
            resolve(worktreePath);
          }
        });
      } else {
        injectHooks(worktreePath);
        resolve(worktreePath);
      }
    });
  });
}

async function spawnClaude(messageId: string, prompt: string): Promise<string> {
  const worktreePath = await ensureWorktree(messageId);
  const startedAt = Date.now();
  appendClaudeDebugLog(
    messageId,
    `spawn start cwd=${worktreePath} timeoutMs=${CLAUDE_TIMEOUT_MS} promptLen=${prompt.length}`,
  );

  // Kill existing process for this message if running
  const existing = runningProcesses.get(messageId);
  if (existing && !existing.killed) {
    suppressSyntheticStopFor.add(messageId);
    existing.kill('SIGTERM');
    runningProcesses.delete(messageId);
  }

  const child = spawn('claude', ['--dangerously-skip-permissions', '-p', prompt], {
    cwd: worktreePath,
    // Non-interactive mode does not need stdin; keep it closed to avoid hook commands
    // that read from stdin (e.g. $(cat)) blocking indefinitely.
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  appendClaudeDebugLog(messageId, `spawned pid=${child.pid ?? -1}`);

  runningProcesses.set(messageId, child);
  let stdoutBuffer = '';
  let stderrBuffer = '';
  let failedToSpawn: string | null = null;
  let timedOut = false;

  const appendToBuffer = (existing: string, chunk: string) => {
    const combined = existing + chunk;
    if (combined.length <= MAX_CAPTURE_CHARS) {
      return combined;
    }
    return combined.slice(combined.length - MAX_CAPTURE_CHARS);
  };

  const postSyntheticStopEvent = async (assistantText: string, exitCode: number | null) => {
    const payload = {
      session_id: `trace-local-${messageId}`,
      cwd: worktreePath,
      hook_event_name: 'Stop',
      stop_hook_active: false,
      last_assistant_message: assistantText,
      source: 'electron-main',
      exit_code: exitCode,
    };

    try {
      const response = await fetch(`${SERVER_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      appendClaudeDebugLog(
        messageId,
        `synthetic stop posted status=${response.status} ok=${response.ok}`,
      );
    } catch (err) {
      console.error(`[claude:${messageId.slice(0, 8)}] failed to post synthetic Stop event:`, err);
      appendClaudeDebugLog(messageId, `synthetic stop post failed error=${String(err)}`);
    }
  };

  child.stdout?.on('data', (data) => {
    const chunk = data.toString();
    stdoutBuffer = appendToBuffer(stdoutBuffer, chunk);
    appendClaudeDebugLog(messageId, `stdout bytes=${Buffer.byteLength(chunk)}`);
    console.log(`[claude:${messageId.slice(0, 8)}] ${chunk.trim()}`);
  });

  child.stderr?.on('data', (data) => {
    const chunk = data.toString();
    stderrBuffer = appendToBuffer(stderrBuffer, chunk);
    appendClaudeDebugLog(
      messageId,
      `stderr bytes=${Buffer.byteLength(chunk)} text=${chunk.trim().slice(0, 500)}`,
    );
    console.error(`[claude:${messageId.slice(0, 8)}:err] ${chunk.trim()}`);
  });

  child.on('error', (err) => {
    failedToSpawn = String(err);
    appendClaudeDebugLog(messageId, `spawn error=${failedToSpawn}`);
    console.error(`[claude:${messageId.slice(0, 8)}:spawn] ${failedToSpawn}`);
  });

  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    if (!child.killed) {
      child.kill('SIGTERM');
      console.error(
        `[claude:${messageId.slice(0, 8)}] timed out after ${CLAUDE_TIMEOUT_MS}ms, sent SIGTERM`,
      );
      appendClaudeDebugLog(messageId, `timeout reached (${CLAUDE_TIMEOUT_MS}ms), sent SIGTERM`);
    }
  }, CLAUDE_TIMEOUT_MS);

  child.on('close', async (code) => {
    clearTimeout(timeoutHandle);
    console.log(`[claude:${messageId.slice(0, 8)}] exited with code ${code}`);
    appendClaudeDebugLog(
      messageId,
      `close code=${code} durationMs=${Date.now() - startedAt} stdoutLen=${stdoutBuffer.length} stderrLen=${stderrBuffer.length}`,
    );
    runningProcesses.delete(messageId);

    const assistantOutput = stdoutBuffer.trim();
    const stderrOutput = stderrBuffer.trim();
    const suppressed = suppressSyntheticStopFor.delete(messageId);
    const shouldPostSyntheticStop =
      !suppressed && (timedOut || !!failedToSpawn || code !== 0);

    if (!shouldPostSyntheticStop) {
      return;
    }

    const fallbackMessage = [
      assistantOutput,
      timedOut ? `Timed out after ${CLAUDE_TIMEOUT_MS}ms.` : '',
      failedToSpawn ? `Spawn error: ${failedToSpawn}` : '',
      stderrOutput,
      code !== 0 && code !== null ? `Process exited with code ${code}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    const messageToPersist = fallbackMessage || 'Claude run completed without textual output.';
    await postSyntheticStopEvent(messageToPersist, code);
  });

  return worktreePath;
}

async function deleteWorktree(messageId: string): Promise<{ removed: boolean; worktreePath: string }> {
  const worktreePath = getWorktreePath(messageId);
  const existing = runningProcesses.get(messageId);
  if (existing && !existing.killed) {
    suppressSyntheticStopFor.add(messageId);
    existing.kill('SIGTERM');
    runningProcesses.delete(messageId);
    appendClaudeDebugLog(messageId, 'delete-worktree killed running process before deletion');
  }

  if (!fs.existsSync(worktreePath)) {
    appendClaudeDebugLog(messageId, `delete-worktree skipped (not found): ${worktreePath}`);
    return { removed: false, worktreePath };
  }

  const removeResult = await runProcess(
    'git',
    ['worktree', 'remove', '--force', worktreePath],
    targetDir,
  );

  if (removeResult.code !== 0) {
    // Fall back to removing directory directly if worktree metadata was already stale.
    fs.rmSync(worktreePath, { recursive: true, force: true });
    appendClaudeDebugLog(
      messageId,
      `delete-worktree git remove failed, fs fallback used stderr=${removeResult.stderr.trim().slice(0, 500)}`,
    );
  } else {
    appendClaudeDebugLog(messageId, `delete-worktree git remove succeeded path=${worktreePath}`);
  }

  await runProcess('git', ['worktree', 'prune'], targetDir);
  await runProcess('git', ['branch', '-D', `trace/${messageId.slice(0, 8)}`], targetDir);

  return { removed: true, worktreePath };
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
function registerIpcHandlers() {
  // Dev reloads can re-run this file; clear then re-register the handler safely.
  ipcMain.removeHandler(SPAWN_CLAUDE_CHANNEL);
  ipcMain.removeHandler(DELETE_WORKTREE_CHANNEL);
  ipcMain.handle(SPAWN_CLAUDE_CHANNEL, async (_event, messageId: string, prompt: string) => {
    try {
      const worktreePath = await spawnClaude(messageId, prompt);
      return { success: true, worktreePath };
    } catch (err) {
      console.error('Failed to spawn claude:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(DELETE_WORKTREE_CHANNEL, async (_event, messageId: string) => {
    try {
      const result = await deleteWorktree(messageId);
      return { success: true, ...result };
    } catch (err) {
      console.error('Failed to delete worktree:', err);
      return { success: false, error: String(err) };
    }
  });
}

registerIpcHandlers();

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------
const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.webContents.openDevTools();
};

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.on('ready', () => {
  targetDir = process.cwd();

  injectHooks(targetDir);
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  // Kill all running claude processes
  for (const [id, proc] of runningProcesses) {
    if (!proc.killed) {
      proc.kill('SIGTERM');
      console.log(`Killed claude process for ${id.slice(0, 8)}`);
    }
  }
  runningProcesses.clear();
});
