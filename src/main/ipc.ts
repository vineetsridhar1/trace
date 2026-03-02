import fs from 'node:fs';
import path from 'node:path';
import { ipcMain, dialog, BrowserWindow } from 'electron';
import { spawnClaude } from './claude';
import { checkWorktreeExists, deleteWorktree, mergeWorktree, getWorktreePath, stopClaudeProcess } from './worktree';
import { resetWatchdog, stopWatchdog } from './watchdog';
import { createPty, writePty, resizePty, killPty, getPtyCwd, getPtyEnv, hasPty, getPtyProcesses } from './pty';
import { allocatePorts, releasePorts } from './ports';
import { getWorktreeDiff } from './diff';
import { getChannelLocalConfig, setChannelLocalConfig, getAllChannelLocalConfigs, deleteChannelLocalConfig } from './localConfig';
import type { LocalChannelConfig } from './localConfig';
import { runProcess } from './process';

const SPAWN_CLAUDE_CHANNEL = 'spawn-claude';
const DELETE_WORKTREE_CHANNEL = 'delete-worktree';
const CHECK_WORKTREE_CHANNEL = 'check-worktree';
const MERGE_WORKTREE_CHANNEL = 'merge-worktree';
const CLAUDE_ACTIVITY_PING_CHANNEL = 'claude-activity-ping';
const PTY_CREATE_CHANNEL = 'pty-create';
const PTY_WRITE_CHANNEL = 'pty-write';
const PTY_RESIZE_CHANNEL = 'pty-resize';
const PTY_KILL_CHANNEL = 'pty-kill';
const STOP_CLAUDE_CHANNEL = 'stop-claude';
const GET_WORKTREE_DIFF_CHANNEL = 'get-worktree-diff';
const FOCUS_WINDOW_CHANNEL = 'focus-window';
const ALLOCATE_PORTS_CHANNEL = 'allocate-ports';
const RELEASE_PORTS_CHANNEL = 'release-ports';
const SELECT_FOLDER_CHANNEL = 'select-folder';
const GET_LOCAL_CONFIG_CHANNEL = 'get-local-config';
const SET_LOCAL_CONFIG_CHANNEL = 'set-local-config';
const GET_ALL_LOCAL_CONFIGS_CHANNEL = 'get-all-local-configs';
const DELETE_LOCAL_CONFIG_CHANNEL = 'delete-local-config';
const LIST_REPO_FILES_CHANNEL = 'list-repo-files';
const SUGGEST_SCRIPTS_CHANNEL = 'suggest-scripts';
const VALIDATE_REPO_CHANNEL = 'validate-repo';
const LIST_REPO_BRANCHES_CHANNEL = 'list-repo-branches';
const CHECK_BRANCHES_MERGED_CHANNEL = 'check-branches-merged';
const WATCH_BASE_BRANCH_CHANNEL = 'watch-base-branch';
const UNWATCH_BASE_BRANCH_CHANNEL = 'unwatch-base-branch';
const PTY_HAS_CHANNEL = 'pty-has';
const PTY_GET_PROCESSES_CHANNEL = 'pty-get-processes';
const GITHUB_LOGIN_CHANNEL = 'github-login';
const CHECK_MAIN_STATUS_CHANNEL = 'check-main-status';
const PULL_MAIN_CHANNEL = 'pull-main';
const DETECT_INSTALLED_APPS_CHANNEL = 'detect-installed-apps';
const OPEN_IN_APP_CHANNEL = 'open-in-app';

// Curated allow-list of dev tools we show in the "Open In" menu.
// Maps bundle identifier → { id, label, openArgs } used by the open-in-app handler.
const ALLOWED_APPS: Record<string, { id: string; label: string; openArgs: string[] }> = {
  'com.apple.finder':                { id: 'finder',   label: 'Finder',    openArgs: [] },
  'com.todesktop.230313mzl4w4u92':   { id: 'cursor',   label: 'Cursor',    openArgs: ['-a', 'Cursor'] },
  'com.microsoft.VSCode':            { id: 'vscode',   label: 'VS Code',   openArgs: ['-a', 'Visual Studio Code'] },
  'com.googlecode.iterm2':           { id: 'iterm',    label: 'iTerm',     openArgs: ['-a', 'iTerm'] },
  'com.apple.Terminal':              { id: 'terminal', label: 'Terminal',  openArgs: ['-a', 'Terminal'] },
};

// Display order for the menu
const APP_DISPLAY_ORDER = ['finder', 'cursor', 'vscode', 'iterm', 'terminal'];

// Module-level cache so we only query Launch Services once per app lifetime
let installedAppsCache: Array<{ id: string; label: string }> | null = null;

let mainWindowRef: BrowserWindow | null = null;
let branchWatchers: fs.FSWatcher[] = [];

export function setMainWindow(win: BrowserWindow) {
  mainWindowRef = win;
}

function resolveServerUrl(): string {
  const raw = process.env.TRACE_SERVER_URL;
  if (!raw) return process.env.TRACE_PROD ? 'https://trace-6kt7.onrender.com' : 'http://localhost:3100';
  if (raw.startsWith('http')) return raw;
  return `http://localhost:${raw}`;
}

export function registerIpcHandlers() {
  // Sync handler so the renderer can get the server URL synchronously via preload
  ipcMain.removeAllListeners('get-server-url');
  ipcMain.on('get-server-url', (event) => {
    event.returnValue = resolveServerUrl();
  });
  ipcMain.removeHandler(SPAWN_CLAUDE_CHANNEL);
  ipcMain.removeHandler(DELETE_WORKTREE_CHANNEL);
  ipcMain.removeHandler(CHECK_WORKTREE_CHANNEL);
  ipcMain.removeHandler(MERGE_WORKTREE_CHANNEL);
  ipcMain.removeHandler(CLAUDE_ACTIVITY_PING_CHANNEL);
  ipcMain.removeHandler(PTY_CREATE_CHANNEL);
  ipcMain.removeHandler(PTY_WRITE_CHANNEL);
  ipcMain.removeHandler(PTY_RESIZE_CHANNEL);
  ipcMain.removeHandler(PTY_KILL_CHANNEL);
  ipcMain.removeHandler(STOP_CLAUDE_CHANNEL);
  ipcMain.removeHandler(GET_WORKTREE_DIFF_CHANNEL);
  ipcMain.removeHandler(FOCUS_WINDOW_CHANNEL);
  ipcMain.removeHandler(ALLOCATE_PORTS_CHANNEL);
  ipcMain.removeHandler(RELEASE_PORTS_CHANNEL);
  ipcMain.removeHandler(SELECT_FOLDER_CHANNEL);
  ipcMain.removeHandler(GET_LOCAL_CONFIG_CHANNEL);
  ipcMain.removeHandler(SET_LOCAL_CONFIG_CHANNEL);
  ipcMain.removeHandler(GET_ALL_LOCAL_CONFIGS_CHANNEL);
  ipcMain.removeHandler(DELETE_LOCAL_CONFIG_CHANNEL);
  ipcMain.removeHandler(LIST_REPO_FILES_CHANNEL);
  ipcMain.removeHandler(SUGGEST_SCRIPTS_CHANNEL);
  ipcMain.removeHandler(VALIDATE_REPO_CHANNEL);
  ipcMain.removeHandler(LIST_REPO_BRANCHES_CHANNEL);
  ipcMain.removeHandler(CHECK_BRANCHES_MERGED_CHANNEL);
  ipcMain.removeHandler(WATCH_BASE_BRANCH_CHANNEL);
  ipcMain.removeHandler(UNWATCH_BASE_BRANCH_CHANNEL);
  ipcMain.removeHandler(PTY_HAS_CHANNEL);
  ipcMain.removeHandler(PTY_GET_PROCESSES_CHANNEL);
  ipcMain.removeHandler(GITHUB_LOGIN_CHANNEL);
  ipcMain.removeHandler(CHECK_MAIN_STATUS_CHANNEL);
  ipcMain.removeHandler(PULL_MAIN_CHANNEL);
  ipcMain.removeHandler(DETECT_INSTALLED_APPS_CHANNEL);
  ipcMain.removeHandler(OPEN_IN_APP_CHANNEL);

  ipcMain.handle(SPAWN_CLAUDE_CHANNEL, async (_event, workspaceId: string, prompt: string, repoPath: string, creationCommands?: string[], resumeSessionId?: string, filePaths?: string[], model?: string, effort?: string, systemInstructions?: string, permissionMode?: string) => {
    try {
      const worktreePath = await spawnClaude(workspaceId, prompt, repoPath, creationCommands, resumeSessionId, filePaths, model, effort, systemInstructions, permissionMode);
      return { success: true, worktreePath };
    } catch (err) {
      console.error('Failed to spawn claude:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(DELETE_WORKTREE_CHANNEL, async (_event, workspaceId: string, repoPath: string) => {
    try {
      const result = await deleteWorktree(workspaceId, repoPath);
      return { success: true, ...result };
    } catch (err) {
      console.error('Failed to delete worktree:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(CHECK_WORKTREE_CHANNEL, async (_event, workspaceId: string, repoPath: string) => {
    try {
      const result = await checkWorktreeExists(workspaceId, repoPath);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, exists: false, error: String(err) };
    }
  });

  ipcMain.handle(MERGE_WORKTREE_CHANNEL, async (_event, workspaceId: string, repoPath: string, baseBranch: string) => {
    try {
      const result = await mergeWorktree(workspaceId, repoPath, baseBranch);
      return { success: true, ...result };
    } catch (err) {
      console.error('Failed to merge worktree:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(STOP_CLAUDE_CHANNEL, (_event, workspaceId: string) => {
    try {
      const result = stopClaudeProcess(workspaceId);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(
    CLAUDE_ACTIVITY_PING_CHANNEL,
    async (_event, workspaceId: string, eventType: string) => {
      try {
        if ((eventType ?? '').toLowerCase() === 'stop') {
          stopWatchdog(workspaceId, 'activity-stop-event');
        } else {
          resetWatchdog(workspaceId, `activity-event:${eventType}`);
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.handle(PTY_CREATE_CHANNEL, (_event, terminalId: string, cwd: string, extraEnv?: Record<string, string>) => {
    if (!mainWindowRef) return { success: false, error: 'No main window' };
    try {
      createPty(terminalId, cwd, mainWindowRef, extraEnv);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(PTY_WRITE_CHANNEL, (_event, terminalId: string, data: string) => {
    let success = writePty(terminalId, data);
    if (!success && mainWindowRef) {
      const cwd = getPtyCwd(terminalId);
      if (cwd) {
        try {
          createPty(terminalId, cwd, mainWindowRef, getPtyEnv(terminalId));
          success = writePty(terminalId, data);
        } catch {
          success = false;
        }
      }
    }
    return { success };
  });

  ipcMain.handle(PTY_RESIZE_CHANNEL, (_event, terminalId: string, cols: number, rows: number) => {
    let success = resizePty(terminalId, cols, rows);
    if (!success && mainWindowRef) {
      const cwd = getPtyCwd(terminalId);
      if (cwd) {
        try {
          createPty(terminalId, cwd, mainWindowRef, getPtyEnv(terminalId));
          success = resizePty(terminalId, cols, rows);
        } catch {
          success = false;
        }
      }
    }
    return { success };
  });

  ipcMain.handle(PTY_KILL_CHANNEL, (_event, terminalId: string) => {
    return { success: killPty(terminalId) };
  });

  ipcMain.handle(PTY_HAS_CHANNEL, (_event, terminalId: string) => {
    return { success: true, exists: hasPty(terminalId) };
  });

  ipcMain.handle(PTY_GET_PROCESSES_CHANNEL, (_event, terminalIds: string[]) => {
    return { success: true, processes: getPtyProcesses(terminalIds) };
  });

  ipcMain.handle(GET_WORKTREE_DIFF_CHANNEL, async (_event, workspaceId: string, baseBranch: string) => {
    try {
      const worktreePath = getWorktreePath(workspaceId);
      const result = await getWorktreeDiff(worktreePath, baseBranch || 'main');
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(ALLOCATE_PORTS_CHANNEL, async (_event, workspaceId: string, count: number) => {
    try {
      const ports = await allocatePorts(workspaceId, count);
      return { success: true, ports };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(RELEASE_PORTS_CHANNEL, (_event, workspaceId: string) => {
    try {
      releasePorts(workspaceId);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(FOCUS_WINDOW_CHANNEL, () => {
    if (!mainWindowRef) return;
    if (mainWindowRef.isMinimized()) mainWindowRef.restore();
    mainWindowRef.show();
    mainWindowRef.focus();
  });

  ipcMain.handle(SELECT_FOLDER_CHANNEL, async () => {
    if (!mainWindowRef) return { success: false, error: 'No main window' };
    const result = await dialog.showOpenDialog(mainWindowRef, {
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, canceled: true };
    }
    return { success: true, canceled: false, path: result.filePaths[0] };
  });

  ipcMain.handle(GET_LOCAL_CONFIG_CHANNEL, (_event, channelId: string) => {
    return getChannelLocalConfig(channelId);
  });

  ipcMain.handle(SET_LOCAL_CONFIG_CHANNEL, (_event, channelId: string, data: LocalChannelConfig) => {
    setChannelLocalConfig(channelId, data);
    return { success: true };
  });

  ipcMain.handle(GET_ALL_LOCAL_CONFIGS_CHANNEL, () => {
    return getAllChannelLocalConfigs();
  });

  ipcMain.handle(DELETE_LOCAL_CONFIG_CHANNEL, (_event, channelId: string) => {
    deleteChannelLocalConfig(channelId);
    return { success: true };
  });

  ipcMain.handle(LIST_REPO_FILES_CHANNEL, async (_event, repoPath: string) => {
    try {
      const result = await runProcess('git', ['ls-files'], repoPath);
      if (result.code !== 0) {
        return { success: false, error: result.stderr, files: [] };
      }
      const files = result.stdout
        .split('\n')
        .map(f => f.trim())
        .filter(f => f.length > 0);
      return { success: true, files };
    } catch (err) {
      return { success: false, error: String(err), files: [] };
    }
  });

  ipcMain.handle(SUGGEST_SCRIPTS_CHANNEL, async (_event, repoPath: string) => {
    try {
      const setupParts: string[] = [];
      let runScript: string | undefined;

      // Check package.json
      const pkgPath = path.join(repoPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          const scripts = pkg.scripts ?? {};
          setupParts.push('npm install');
          if (scripts.dev) {
            runScript = 'PORT=$PORT npm run dev';
          } else if (scripts.start) {
            runScript = 'PORT=$PORT npm start';
          }
        } catch { /* ignore parse errors */ }
      }

      // Check docker-compose
      if (fs.existsSync(path.join(repoPath, 'docker-compose.yml')) || fs.existsSync(path.join(repoPath, 'docker-compose.yaml'))) {
        if (!runScript) runScript = 'docker compose up';
      }

      // Check Python requirements.txt
      if (fs.existsSync(path.join(repoPath, 'requirements.txt'))) {
        setupParts.push('pip install -r requirements.txt');
      }

      // Check Go go.mod
      if (fs.existsSync(path.join(repoPath, 'go.mod'))) {
        setupParts.push('go mod download');
        if (!runScript) runScript = 'PORT=$PORT go run .';
      }

      // Check Makefile for dev/start targets
      const makefilePath = path.join(repoPath, 'Makefile');
      if (fs.existsSync(makefilePath)) {
        try {
          const makefile = fs.readFileSync(makefilePath, 'utf-8');
          const targets = makefile.match(/^([a-zA-Z_-]+)\s*:/gm)?.map((t) => t.replace(':', '').trim()) ?? [];
          if (!runScript) {
            if (targets.includes('dev')) runScript = 'make dev';
            else if (targets.includes('start')) runScript = 'make start';
          }
        } catch { /* ignore read errors */ }
      }

      return {
        success: true,
        setupScript: setupParts.length > 0 ? setupParts.join('\n') : undefined,
        runScript,
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(VALIDATE_REPO_CHANNEL, async (_event, repoPath: string) => {
    try {
      const revParse = await runProcess('git', ['rev-parse', '--is-inside-work-tree'], repoPath);
      if (revParse.code !== 0 || revParse.stdout.trim() !== 'true') {
        return { valid: false, error: 'Not a git repository' };
      }
      const remote = await runProcess('git', ['remote', 'get-url', 'origin'], repoPath);
      const originUrl = remote.code === 0 ? remote.stdout.trim() || null : null;
      if (!originUrl) {
        return { valid: false, error: 'No origin remote found. Please add an origin remote to this repository.' };
      }
      return { valid: true, originUrl };
    } catch (err) {
      return { valid: false, error: String(err) };
    }
  });

  ipcMain.handle(LIST_REPO_BRANCHES_CHANNEL, async (_event, repoPath: string) => {
    try {
      const result = await runProcess('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], repoPath);
      if (result.code !== 0) {
        return { success: false, branches: [], error: result.stderr };
      }
      const branches = result.stdout
        .split('\n')
        .map(b => b.trim())
        .filter(Boolean);
      return { success: true, branches };
    } catch (err) {
      return { success: false, branches: [], error: String(err) };
    }
  });

  ipcMain.handle(
    CHECK_BRANCHES_MERGED_CHANNEL,
    async (
      _event,
      repoPath: string,
      targets: Array<{ workspaceId: string; branch: string }>,
      baseBranch: string,
    ) => {
      try {
        // Fetch the latest remote refs so we can detect merges done on GitHub.
        await runProcess('git', ['fetch', 'origin', baseBranch], repoPath).catch(() => undefined);

        const merged: Record<string, boolean> = {};
        for (const { workspaceId, branch } of targets) {
          try {
            // `git diff <base>...<branch>` shows changes on <branch> that aren't
            // in <base>. If empty, all the branch's changes are already in the
            // base — regardless of merge strategy (FF, squash, rebase).
            const diff = await runProcess('git', ['diff', '--quiet', `${baseBranch}...${branch}`], repoPath);
            if (diff.code === 0) {
              merged[workspaceId] = true;
              continue;
            }

            // Also check against the fetched remote ref.
            const remoteDiff = await runProcess('git', ['diff', '--quiet', `origin/${baseBranch}...${branch}`], repoPath);
            merged[workspaceId] = remoteDiff.code === 0;
          } catch {
            merged[workspaceId] = false;
          }
        }
        return { success: true, merged };
      } catch (err) {
        return { success: false, merged: {}, error: String(err) };
      }
    },
  );

  ipcMain.handle(WATCH_BASE_BRANCH_CHANNEL, (_event, repoPath: string, baseBranch: string) => {
    // Close any existing watchers
    for (const w of branchWatchers) w.close();
    branchWatchers = [];

    const gitDir = path.join(repoPath, '.git');
    // Watch directories (not specific files) so we catch newly-created refs
    // e.g. after the first `git fetch` creates refs/remotes/origin/main
    const watchPaths = [
      path.join(gitDir, 'refs', 'heads'),
      path.join(gitDir, 'refs', 'remotes', 'origin'),
      path.join(gitDir, 'packed-refs'),
    ];

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const notify = (_eventType: string, filename: string | null) => {
      // For directories, only fire when the base branch file changes
      // For packed-refs (a file), always fire
      if (filename && filename !== baseBranch && filename !== 'packed-refs') return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
          mainWindowRef.webContents.send('base-branch-changed');
        }
      }, 500);
    };

    for (const watchPath of watchPaths) {
      try {
        if (fs.existsSync(watchPath)) {
          const watcher = fs.watch(watchPath, notify);
          watcher.on('error', (err) => {
            void err; // Ignore watch errors
          });
          branchWatchers.push(watcher);
        }
      } catch {
        // Path doesn't exist or can't be watched — skip
      }
    }
    return { success: true };
  });

  ipcMain.handle(UNWATCH_BASE_BRANCH_CHANNEL, () => {
    for (const w of branchWatchers) w.close();
    branchWatchers = [];
    return { success: true };
  });

  ipcMain.handle(CHECK_MAIN_STATUS_CHANNEL, async (_event, repoPath: string, baseBranch: string) => {
    try {
      // Fetch latest remote refs
      const fetchResult = await runProcess('git', ['fetch', 'origin', baseBranch], repoPath);
      if (fetchResult.code !== 0) {
        return { success: false, error: `Failed to fetch: ${fetchResult.stderr.trim()}` };
      }

      // Compare local base branch with remote
      const localRef = await runProcess('git', ['rev-parse', baseBranch], repoPath);
      const remoteRef = await runProcess('git', ['rev-parse', `origin/${baseBranch}`], repoPath);

      if (localRef.code !== 0 || remoteRef.code !== 0) {
        return { success: false, error: 'Failed to resolve branch refs' };
      }

      const localSha = localRef.stdout.trim();
      const remoteSha = remoteRef.stdout.trim();
      const isUpToDate = localSha === remoteSha;

      // Count how many commits behind
      let commitsBehind = 0;
      if (!isUpToDate) {
        const countResult = await runProcess('git', ['rev-list', '--count', `${baseBranch}..origin/${baseBranch}`], repoPath);
        if (countResult.code === 0) {
          commitsBehind = parseInt(countResult.stdout.trim(), 10) || 0;
        }
      }

      return { success: true, isUpToDate, commitsBehind, localSha, remoteSha };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(PULL_MAIN_CHANNEL, async (_event, repoPath: string, baseBranch: string) => {
    try {
      // Fetch latest from remote
      const fetchResult = await runProcess('git', ['fetch', 'origin', baseBranch], repoPath);
      if (fetchResult.code !== 0) {
        return { success: false, error: `Failed to fetch: ${fetchResult.stderr.trim()}` };
      }

      // Fast-forward the local ref to match remote without affecting the working tree.
      // This is safe regardless of which branch is currently checked out.
      const updateResult = await runProcess(
        'git', ['update-ref', `refs/heads/${baseBranch}`, `origin/${baseBranch}`], repoPath,
      );
      if (updateResult.code !== 0) {
        return { success: false, error: `Failed to update ref: ${updateResult.stderr.trim()}` };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(GITHUB_LOGIN_CHANNEL, async () => {
    const serverUrl = resolveServerUrl();
    return new Promise<{ success: boolean; token?: string; user?: unknown; error?: string }>((resolve) => {
      const authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      authWindow.loadURL(`${serverUrl}/auth/github`);

      // When the server is remote (LAN), GitHub still redirects to localhost.
      // Intercept that redirect and rewrite it to the actual server URL.
      authWindow.webContents.on('will-navigate', (_event, url) => {
        if (url.includes('/auth/github/callback') && !url.startsWith(serverUrl)) {
          _event.preventDefault();
          const callbackUrl = new URL(url);
          const rewritten = `${serverUrl}${callbackUrl.pathname}${callbackUrl.search}`;
          authWindow.loadURL(rewritten);
        }
      });

      authWindow.webContents.on('did-navigate', async (_event, url) => {
        if (url.includes('/auth/github/callback')) {
          try {
            const result = await authWindow.webContents.executeJavaScript(`
              (function() {
                var tokenMeta = document.querySelector('meta[name="trace-token"]');
                var userMeta = document.querySelector('meta[name="trace-user"]');
                if (tokenMeta) {
                  return {
                    token: tokenMeta.getAttribute('content'),
                    user: userMeta ? JSON.parse(userMeta.getAttribute('content')) : null,
                  };
                }
                return null;
              })();
            `);

            if (result?.token) {
              authWindow.close();
              resolve({ success: true, token: result.token, user: result.user });
            } else {
              authWindow.close();
              resolve({ success: false, error: 'No token found in response' });
            }
          } catch (err) {
            authWindow.close();
            resolve({ success: false, error: String(err) });
          }
        }
      });

      authWindow.on('closed', () => {
        resolve({ success: false, error: 'Window closed by user' });
      });
    });
  });

  ipcMain.handle(DETECT_INSTALLED_APPS_CHANNEL, async () => {
    if (installedAppsCache) {
      return { success: true, apps: installedAppsCache };
    }
    try {
      const allowedBundleIds = Object.keys(ALLOWED_APPS);
      // Use NSWorkspace.URLForApplicationWithBundleIdentifier to check each app.
      // This queries the Launch Services database directly — fast and always up-to-date.
      const jxaScript = `
ObjC.import('AppKit');
var ws = $.NSWorkspace.sharedWorkspace;
var ids = ${JSON.stringify(allowedBundleIds)};
var found = [];
for (var i = 0; i < ids.length; i++) {
  var url = ws.URLForApplicationWithBundleIdentifier(ids[i]);
  if (url && url.path) {
    found.push(ids[i]);
  }
}
JSON.stringify(found);
`;
      const result = await runProcess('osascript', ['-l', 'JavaScript', '-'], '/', jxaScript);
      if (result.code === 0 && result.stdout.trim()) {
        const foundBundleIds: string[] = JSON.parse(result.stdout.trim());
        const apps = allowedBundleIds
          .filter((bid) => foundBundleIds.includes(bid))
          .map((bid) => ({ id: ALLOWED_APPS[bid].id, label: ALLOWED_APPS[bid].label }));
        // Sort by display order
        apps.sort((a, b) => APP_DISPLAY_ORDER.indexOf(a.id) - APP_DISPLAY_ORDER.indexOf(b.id));
        installedAppsCache = apps;
        return { success: true, apps };
      }
      // Fallback: assume at least Finder and Terminal (don't cache so it retries next time)
      const fallback = [{ id: 'finder', label: 'Finder' }, { id: 'terminal', label: 'Terminal' }];
      return { success: true, apps: fallback };
    } catch (err) {
      const fallback = [{ id: 'finder', label: 'Finder' }, { id: 'terminal', label: 'Terminal' }];
      return { success: false, apps: fallback, error: String(err) };
    }
  });

  ipcMain.handle(OPEN_IN_APP_CHANNEL, async (_event, appId: string, targetPath: string) => {
    try {
      const appEntry = Object.values(ALLOWED_APPS).find((a) => a.id === appId);
      if (!appEntry) {
        return { success: false, error: `Unknown app: ${appId}` };
      }
      const args = [...appEntry.openArgs, targetPath];
      const result = await runProcess('open', args, targetPath);
      return { success: result.code === 0, error: result.code !== 0 ? result.stderr : undefined };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
}
