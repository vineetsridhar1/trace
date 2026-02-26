import path from 'node:path';
import fs from 'node:fs';

export function injectHooks(dir: string) {
  const claudeDir = path.join(dir, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');

  const rawEnv = process.env.TRACE_SERVER_URL;
  const serverUrl = rawEnv ? (rawEnv.startsWith('http') ? rawEnv : `http://localhost:${rawEnv}`) : 'http://localhost:3100';
  const curlCmd =
    `curl -sS --connect-timeout 1 --max-time 2 -X POST ${serverUrl}/events -H "Content-Type: application/json" -d "$(cat)" >/dev/null 2>&1 || true`;

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

  const existingHooks = (settings.hooks ?? {}) as Record<string, unknown>;
  settings.hooks = { ...existingHooks, ...desiredHooks };

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`Hooks injected into ${settingsPath}`);
}
