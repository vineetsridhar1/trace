# Fix: Setup Script Reliability

## Root Cause

The creation script is **split by newlines and each line is executed in a separate `sh -c` process** (`src/main/claude.ts:28-37`). This means `cd server` runs in process #1, exits, and the next command starts fresh in the worktree root — so `npm i`, `cp .env`, and `prisma generate` all run in the wrong directory.

```
Line 1: npm i              → runs in /worktree/        ✅ (root install works)
Line 2: cd server           → runs in /worktree/        ✅ (cd works, then process exits)
Line 3: npm i              → runs in /worktree/ again   ❌ (should be /worktree/server/)
Line 4: cp .env            → runs in /worktree/ again   ❌ (copies to wrong place)
Line 5: npx prisma generate → runs in /worktree/ again  ❌ (no schema found)
```

## Fix

**Change `runCreationScripts` to join all commands into a single shell script** and execute them in one `sh -c` invocation. This preserves directory changes, environment variables, and other shell state across lines — exactly like running a real script.

### File: `src/main/claude.ts` (lines 28-37)

Before:
```typescript
async function runCreationScripts(worktreePath: string, commands: string[]): Promise<void> {
  for (const command of commands) {
    const trimmed = command.trim();
    if (!trimmed) continue;
    const result = await runProcess('sh', ['-c', trimmed], worktreePath);
    if (result.code !== 0) {
      console.error(`[creation-script] command failed: ${trimmed}\n${result.stderr}`);
    }
  }
}
```

After:
```typescript
async function runCreationScripts(worktreePath: string, commands: string[]): Promise<void> {
  const script = commands.join('\n');
  if (!script.trim()) return;
  const result = await runProcess('sh', ['-c', `set -e\n${script}`], worktreePath);
  if (result.code !== 0) {
    console.error(`[creation-script] script failed (exit ${result.code}):\n${result.stderr}`);
  }
}
```

Key details:
- `set -e` at the top makes the script exit on first error (e.g., if `cd server` fails, it won't blindly run `npm i` in the wrong directory)
- All commands share one shell process, so `cd server` persists for subsequent lines
- Single process = simpler, faster execution

That's the entire change — one function, ~10 lines.
