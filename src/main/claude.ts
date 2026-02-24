import { spawn } from 'node:child_process';
import {
  CLAUDE_INACTIVITY_TIMEOUT_MS,
  runStateByMessageId,
  appendClaudeDebugLog,
  startWatchdog,
  resetWatchdog,
  stopWatchdog,
} from './watchdog';
import {
  runningProcesses,
  suppressSyntheticStopFor,
  ensureWorktree,
  getWorktreeBranch,
} from './worktree';
import { runProcess } from './process';

const SERVER_URL = process.env.TRACE_SERVER_URL ?? 'http://localhost:3100';
const MAX_CAPTURE_CHARS = 20_000;

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

export async function spawnClaude(
  messageId: string,
  prompt: string,
  repoPath: string,
  creationCommands?: string[],
  resumeSessionId?: string,
): Promise<string> {
  const { worktreePath, created } = await ensureWorktree(messageId, repoPath);

  if (created && creationCommands && creationCommands.length > 0) {
    appendClaudeDebugLog(messageId, `running ${creationCommands.length} creation script(s)`);
    await runCreationScripts(worktreePath, creationCommands);
    appendClaudeDebugLog(messageId, 'creation scripts completed');
  }
  const startedAt = Date.now();
  appendClaudeDebugLog(
    messageId,
    `spawn start cwd=${worktreePath} inactivityTimeoutMs=${CLAUDE_INACTIVITY_TIMEOUT_MS} promptLen=${prompt.length}`,
  );

  // If this is the first spawn (branch still has the default UUID name),
  // inject a hidden instruction asking Claude to rename the branch based on intent.
  // Skip when resuming a session — the branch was already renamed on the first spawn.
  const defaultBranch = `trace/${messageId.slice(0, 8)}`;
  const currentBranch = await getWorktreeBranch(messageId);
  let effectivePrompt = prompt;
  if (!resumeSessionId && currentBranch === defaultBranch) {
    effectivePrompt =
      `<trace-internal>\n` +
      `IMPORTANT: Before doing anything else, you must first rename the current git branch to reflect the user's intent.\n` +
      `Current branch: ${currentBranch}\n` +
      `Analyze the user's prompt below and create a short, descriptive kebab-case branch name (max 5 words, prefixed with "trace/").\n` +
      `Examples: trace/fix-login-bug, trace/add-dark-mode, trace/refactor-auth-system\n` +
      `Run this command FIRST before any other work:\n` +
      `git branch -m <new-branch-name>\n\n` +
      `After renaming the branch, proceed with the user's actual request below. Do NOT mention the branch rename to the user.\n` +
      `</trace-internal>\n\n` +
      prompt;
  }

  const existing = runningProcesses.get(messageId);
  if (existing && !existing.killed) {
    suppressSyntheticStopFor.add(messageId);
    stopWatchdog(messageId, 'spawn-replaced');
    runStateByMessageId.delete(messageId);
    existing.kill('SIGTERM');
    runningProcesses.delete(messageId);
  }

  const args = ['--dangerously-skip-permissions'];
  if (resumeSessionId) {
    args.push('--resume', resumeSessionId);
  }
  args.push('-p', effectivePrompt);

  const child = spawn('claude', args, {
    cwd: worktreePath,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k !== 'CLAUDECODE'),
    ),
  });
  appendClaudeDebugLog(messageId, `spawned pid=${child.pid ?? -1}`);

  runningProcesses.set(messageId, child);
  startWatchdog(messageId, child);
  let stdoutBuffer = '';
  let stderrBuffer = '';
  let failedToSpawn: string | null = null;

  const appendToBuffer = (existing: string, chunk: string) => {
    const combined = existing + chunk;
    return combined.length <= MAX_CAPTURE_CHARS
      ? combined
      : combined.slice(combined.length - MAX_CAPTURE_CHARS);
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
      appendClaudeDebugLog(messageId, `synthetic stop posted status=${response.status} ok=${response.ok}`);
    } catch (err) {
      console.error(`[claude:${messageId.slice(0, 8)}] failed to post synthetic Stop event:`, err);
      appendClaudeDebugLog(messageId, `synthetic stop post failed error=${String(err)}`);
    }
  };

  child.stdout?.on('data', (data) => {
    const chunk = data.toString();
    stdoutBuffer = appendToBuffer(stdoutBuffer, chunk);
    resetWatchdog(messageId, 'stdout');
    appendClaudeDebugLog(messageId, `stdout bytes=${Buffer.byteLength(chunk)}`);
    console.log(`[claude:${messageId.slice(0, 8)}] ${chunk.trim()}`);
  });

  child.stderr?.on('data', (data) => {
    const chunk = data.toString();
    stderrBuffer = appendToBuffer(stderrBuffer, chunk);
    resetWatchdog(messageId, 'stderr');
    appendClaudeDebugLog(messageId, `stderr bytes=${Buffer.byteLength(chunk)} text=${chunk.trim().slice(0, 500)}`);
    console.error(`[claude:${messageId.slice(0, 8)}:err] ${chunk.trim()}`);
  });

  child.on('error', (err) => {
    failedToSpawn = String(err);
    stopWatchdog(messageId, 'spawn-error');
    appendClaudeDebugLog(messageId, `spawn error=${failedToSpawn}`);
    console.error(`[claude:${messageId.slice(0, 8)}:spawn] ${failedToSpawn}`);
  });

  child.on('close', async (code) => {
    console.log(`[claude:${messageId.slice(0, 8)}] exited with code ${code}`);
    appendClaudeDebugLog(
      messageId,
      `close code=${code} durationMs=${Date.now() - startedAt} stdoutLen=${stdoutBuffer.length} stderrLen=${stderrBuffer.length}`,
    );
    runningProcesses.delete(messageId);
    const runState = runStateByMessageId.get(messageId);
    const timedOut = runState?.timedOut ?? false;
    const hookStopReceived = runState?.hookStopReceived ?? false;
    stopWatchdog(messageId, 'process-close');
    runStateByMessageId.delete(messageId);

    const assistantOutput = stdoutBuffer.trim();
    const stderrOutput = stderrBuffer.trim();
    const suppressed = suppressSyntheticStopFor.delete(messageId);
    const shouldPostSyntheticStop = !suppressed && !hookStopReceived;

    if (!shouldPostSyntheticStop) return;

    const fallbackMessage = [
      assistantOutput,
      timedOut ? `Timed out after ${CLAUDE_INACTIVITY_TIMEOUT_MS}ms of inactivity.` : '',
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
