import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import started from 'electron-squirrel-startup';
import * as pty from 'node-pty';
import Database from 'better-sqlite3';

if (started) {
  app.quit();
}

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------
const dbPath = path.join(app.getPath('userData'), 'trace.db');
let db: Database.Database;

function initDatabase() {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS claude_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT    NOT NULL,
      tool_name  TEXT,
      input_json TEXT,
      timestamp  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// ---------------------------------------------------------------------------
// Telemetry HTTP server on port 8888
// ---------------------------------------------------------------------------
let telemetryServer: http.Server;

function startTelemetryServer() {
  telemetryServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/event') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const eventType = payload.event_type ?? payload.hook_type ?? 'unknown';
          const toolName  = payload.tool_name ?? payload.tool?.name ?? null;
          const inputJson = JSON.stringify(payload);

          db.prepare(
            'INSERT INTO claude_logs (event_type, tool_name, input_json) VALUES (?, ?, ?)',
          ).run(eventType, toolName, inputJson);

          // Notify renderer of new event
          BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send('new-log-event');
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  telemetryServer.listen(8888, '127.0.0.1', () => {
    console.log('Telemetry server listening on http://127.0.0.1:8888');
  });
}

// ---------------------------------------------------------------------------
// Hook injection – write .claude/settings.json in the target (cwd) directory
// ---------------------------------------------------------------------------
function injectHooks(targetDir: string) {
  const claudeDir = path.join(targetDir, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');

  const curlCmd =
    'curl -s -X POST http://127.0.0.1:8888/event -H "Content-Type: application/json" -d "$(cat)"';

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
// PTY management
// ---------------------------------------------------------------------------
let ptyProcess: pty.IPty | null = null;

function spawnPty(targetDir: string) {
  const shell = process.env.SHELL || '/bin/zsh';
  ptyProcess = pty.spawn(shell, ['-l', '-c', 'claude; exec $SHELL -l'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: targetDir,
    env: { ...process.env } as Record<string, string>,
  });

  ptyProcess.onData((data: string) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('pty-data', data);
    });
  });

  ptyProcess.onExit(({ exitCode }) => {
    console.log(`PTY exited with code ${exitCode}`);
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('pty-exit', exitCode);
    });
  });
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
function registerIpcHandlers() {
  ipcMain.on('pty-input', (_event, data: string) => {
    ptyProcess?.write(data);
  });

  ipcMain.on('pty-resize', (_event, cols: number, rows: number) => {
    ptyProcess?.resize(cols, rows);
  });

  ipcMain.handle('get-logs', (_event, limit = 100) => {
    const rows = db
      .prepare(
        'SELECT id, event_type, tool_name, input_json, timestamp FROM claude_logs ORDER BY id DESC LIMIT ?',
      )
      .all(limit);
    return rows;
  });
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------
const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1400,
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
  const targetDir = process.cwd();

  initDatabase();
  startTelemetryServer();
  injectHooks(targetDir);
  registerIpcHandlers();
  spawnPty(targetDir);
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
  ptyProcess?.kill();
  telemetryServer?.close();
  db?.close();
});
