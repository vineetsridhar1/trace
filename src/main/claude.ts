import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  CLAUDE_INACTIVITY_TIMEOUT_MS,
  runStateByWorkspaceId,
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
import { ClaudeStreamParser } from './streamParser';

function resolveServerUrl(): string {
  const raw = process.env.TRACE_SERVER_URL;
  if (!raw) return process.env.TRACE_PROD ? 'https://trace-6kt7.onrender.com' : 'http://localhost:3100';
  if (raw.startsWith('http')) return raw;
  // Support bare port numbers like "3001"
  return `http://localhost:${raw}`;
}
const SERVER_URL = resolveServerUrl();
const MAX_CAPTURE_CHARS = 20_000;

async function generateBranchName(prompt: string, workspaceId: string): Promise<string> {
  const fallback = `trace/${workspaceId.slice(0, 8)}`;
  try {
    const res = await fetch(`${SERVER_URL}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'query GenerateBranchName($prompt: String!) { generateBranchName(prompt: $prompt) }',
        variables: { prompt },
      }),
    });
    if (!res.ok) return fallback;
    const { data } = (await res.json()) as { data?: { generateBranchName: string | null } };
    if (!data?.generateBranchName) return fallback;
    return `trace/${data.generateBranchName}`.slice(0, 50);
  } catch {
    return fallback;
  }
}

async function runSetupScripts(worktreePath: string, commands: string[]): Promise<void> {
  const script = commands.join('\n');
  if (!script.trim()) return;
  const result = await runProcess('sh', ['-c', `set -e\n${script}`], worktreePath);
  if (result.code !== 0) {
    console.error(`[setup-script] script failed (exit ${result.code}):\n${result.stderr}`);
  }
}

export async function spawnClaude(
  workspaceId: string,
  prompt: string,
  repoPath: string,
  creationCommands?: string[],
  resumeSessionId?: string,
  filePaths?: string[],
  model?: string,
  effort?: string,
  systemInstructions?: string,
  permissionMode?: string,
): Promise<string> {
  const { worktreePath, created } = await ensureWorktree(workspaceId, repoPath);

  if (created && creationCommands && creationCommands.length > 0) {
    appendClaudeDebugLog(workspaceId, `running ${creationCommands.length} setup script(s)`);
    await runSetupScripts(worktreePath, creationCommands);
    appendClaudeDebugLog(workspaceId, 'setup scripts completed');
  }
  const startedAt = Date.now();
  appendClaudeDebugLog(
    workspaceId,
    `spawn start cwd=${worktreePath} inactivityTimeoutMs=${CLAUDE_INACTIVITY_TIMEOUT_MS} promptLen=${prompt.length}`,
  );

  // If this is the first spawn (branch still has the default UUID name),
  // rename it to a descriptive name derived from the prompt before spawning Claude.
  // This runs in the main process so it works regardless of Claude's permission mode.
  // Skip when resuming a session — the branch was already renamed on the first spawn.
  const defaultBranch = `trace/${workspaceId.slice(0, 8)}`;
  const currentBranch = await getWorktreeBranch(workspaceId);
  if (!resumeSessionId && currentBranch === defaultBranch) {
    let newBranch = await generateBranchName(prompt, workspaceId);
    if (newBranch !== defaultBranch) {
      let renameResult = await runProcess('git', ['branch', '-m', newBranch], worktreePath);
      if (renameResult.code !== 0) {
        // Collision — retry with workspace ID suffix
        newBranch = `${newBranch.slice(0, 44)}-${workspaceId.slice(0, 4)}`;
        renameResult = await runProcess('git', ['branch', '-m', newBranch], worktreePath);
      }
      if (renameResult.code === 0) {
        appendClaudeDebugLog(workspaceId, `branch renamed to ${newBranch}`);
      } else {
        appendClaudeDebugLog(workspaceId, `branch rename failed: ${renameResult.stderr.trim()}`);
      }
    }
  }

  let effectivePrompt = prompt;
  if (!resumeSessionId) {
    const hiddenParts: string[] = [];

    hiddenParts.push(
      `You are working inside Trace, a Mac app for running coding agents in parallel.\n` +
      `Your work takes place in ${worktreePath} which is an isolated git worktree created for this task.`
    );

    if (systemInstructions) {
      hiddenParts.push(systemInstructions);
    }

    effectivePrompt = `<trace-internal>\n${hiddenParts.join('\n\n')}\n</trace-internal>\n\n${prompt}`;
  }

  const existing = runningProcesses.get(workspaceId);
  if (existing && !existing.killed) {
    suppressSyntheticStopFor.add(workspaceId);
    stopWatchdog(workspaceId, 'spawn-replaced');
    runStateByWorkspaceId.delete(workspaceId);
    existing.kill('SIGTERM');
    runningProcesses.delete(workspaceId);
  }

  const args = permissionMode === 'plan'
    ? ['--permission-mode', 'plan']
    : ['--dangerously-skip-permissions'];
  if (resumeSessionId) {
    args.push('--resume', resumeSessionId);
  }

  if (model) {
    args.push('--model', model);
  }

  if (effort && model !== 'haiku') {
    args.push('--effort', effort);
  }

  // Download remote images to the worktree so Claude can read them
  if (filePaths && filePaths.length > 0) {
    const resolvedPaths: string[] = [];
    const imgDir = path.join(worktreePath, '.trace-images');
    let imgDirCreated = false;
    for (const p of filePaths) {
      if (p.startsWith('http://') || p.startsWith('https://')) {
        try {
          if (!imgDirCreated) {
            fs.mkdirSync(imgDir, { recursive: true });
            imgDirCreated = true;
          }
          const filename = path.basename(new URL(p).pathname);
          const localPath = path.join(imgDir, filename);
          const response = await fetch(p);
          if (!response.ok) {
            appendClaudeDebugLog(workspaceId, `image download failed status=${response.status} url=${p}`);
            continue;
          }
          const buffer = Buffer.from(await response.arrayBuffer());
          fs.writeFileSync(localPath, buffer);
          resolvedPaths.push(localPath);
        } catch (err) {
          appendClaudeDebugLog(workspaceId, `image download error url=${p} error=${String(err)}`);
        }
      } else {
        resolvedPaths.push(p);
      }
    }
    filePaths = resolvedPaths;
  }

  let finalPrompt = effectivePrompt;
  if (filePaths && filePaths.length > 0) {
    const fileList = filePaths.map((p) => `- ${p}`).join('\n');
    finalPrompt += `\n\n<trace-internal>\nThe user has referenced the following files. Read them to understand the context:\n${fileList}\n</trace-internal>`;
  }

  args.push('--output-format', 'stream-json', '--verbose');
  args.push('-p', finalPrompt);

  const child = spawn('claude', args, {
    cwd: worktreePath,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k !== 'CLAUDECODE'),
    ),
  });
  appendClaudeDebugLog(workspaceId, `spawned pid=${child.pid ?? -1}`);

  runningProcesses.set(workspaceId, child);
  startWatchdog(workspaceId, child);

  const parser = new ClaudeStreamParser({
    serverUrl: SERVER_URL,
    workspaceId,
    cwd: worktreePath,
    callbacks: {
      onSessionId: (id) => appendClaudeDebugLog(workspaceId, `stream session_id=${id}`),
      onActivity: () => resetWatchdog(workspaceId, 'stream-json'),
    },
    log: (line) => appendClaudeDebugLog(workspaceId, line),
  });

  let stderrBuffer = '';
  let failedToSpawn: string | null = null;

  const appendToStderr = (existing: string, chunk: string) => {
    const combined = existing + chunk;
    return combined.length <= MAX_CAPTURE_CHARS
      ? combined
      : combined.slice(combined.length - MAX_CAPTURE_CHARS);
  };

  child.stdout?.on('data', (data) => {
    const chunk = data.toString();
    parser.processChunk(chunk);
    appendClaudeDebugLog(workspaceId, `stdout bytes=${Buffer.byteLength(chunk)}`);
  });

  child.stderr?.on('data', (data) => {
    const chunk = data.toString();
    stderrBuffer = appendToStderr(stderrBuffer, chunk);
    resetWatchdog(workspaceId, 'stderr');
    appendClaudeDebugLog(workspaceId, `stderr bytes=${Buffer.byteLength(chunk)} text=${chunk.trim().slice(0, 500)}`);
    console.error(`[claude:${workspaceId.slice(0, 8)}:err] ${chunk.trim()}`);
  });

  child.on('error', (err) => {
    failedToSpawn = String(err);
    stopWatchdog(workspaceId, 'spawn-error');
    appendClaudeDebugLog(workspaceId, `spawn error=${failedToSpawn}`);
    console.error(`[claude:${workspaceId.slice(0, 8)}:spawn] ${failedToSpawn}`);
  });

  child.on('close', async (code) => {
    const tag = `[claude:${workspaceId.slice(0, 8)}]`;
    appendClaudeDebugLog(
      workspaceId,
      `close code=${code} durationMs=${Date.now() - startedAt} stderrLen=${stderrBuffer.length}`,
    );
    runningProcesses.delete(workspaceId);
    const runState = runStateByWorkspaceId.get(workspaceId);
    const timedOut = runState?.timedOut ?? false;
    const userStopped = runState?.userStopped ?? false;
    stopWatchdog(workspaceId, 'process-close');
    runStateByWorkspaceId.delete(workspaceId);

    const suppressed = suppressSyntheticStopFor.delete(workspaceId);
    if (suppressed) return;

    // Wrap the entire post-close flow in try-catch so an unexpected error
    // doesn't silently swallow the Stop event (async EventEmitter callbacks
    // turn throws into unhandled rejections with no console output).
    try {
      // Flush any remaining buffered data in the stream parser and wait
      // for all in-flight event POSTs to land before posting the Stop event.
      // This ensures all PostToolUse events reach the server first, so the
      // server can determine the correct final status inline (no timer needed).
      parser.flush();
      await parser.waitForPendingPosts();
      const enrichment = parser.getEnrichment();
      const claudeSessionId = enrichment.sessionId;

      if (!claudeSessionId) {
        appendClaudeDebugLog(workspaceId, `no session_id from stream (code=${code} stderrLen=${stderrBuffer.length})`);
      }

      // Resolve git branch
      let branchName: string | undefined;
      try {
        const branchResult = await runProcess('git', ['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);
        if (branchResult.code === 0 && branchResult.stdout.trim()) {
          branchName = branchResult.stdout.trim();
        }
      } catch {
        // Ignore branch resolution failures
      }

      // Build the assistant output text
      const stderrOutput = stderrBuffer.trim();
      let stopReason: string | undefined;

      if (userStopped || code === 143) {
        stopReason = 'user';
      }

      // Only include stderr in the persisted message when there's no assistant
      // text or the process failed — otherwise Claude Code's startup noise
      // (e.g. "Initializing...") pollutes the message summary shown in the UI.
      const includeStderr = !enrichment.lastAssistantText || (code !== 0 && code !== null && code !== 143);

      const fallbackMessage = [
        enrichment.lastAssistantText,
        timedOut ? `Timed out after ${CLAUDE_INACTIVITY_TIMEOUT_MS}ms of inactivity.` : '',
        failedToSpawn ? `Spawn error: ${failedToSpawn}` : '',
        includeStderr ? stderrOutput : '',
        code !== 0 && code !== null && code !== 143 ? `Process exited with code ${code}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
        .trim();

      const messageToPersist = fallbackMessage || (userStopped ? 'Stopped by user' : 'Claude run completed without textual output.');

      // Post a single Stop event with all enrichment data inline
      const payload = {
        session_id: claudeSessionId ?? `trace-local-${workspaceId}`,
        cwd: worktreePath,
        hook_event_name: 'Stop',
        stop_hook_active: false,
        last_assistant_message: messageToPersist,
        source: 'stream-json',
        exit_code: code,
        ...(stopReason && { stop_reason: stopReason }),
        ...(enrichment.usage && { extracted_usage: enrichment.usage }),
        ...(enrichment.detectedToolName !== undefined && { extracted_tool_name: enrichment.detectedToolName }),
        ...(enrichment.detectedToolInput !== undefined && { extracted_tool_input: enrichment.detectedToolInput }),
        ...(branchName && { branch_name: branchName }),
      };

      appendClaudeDebugLog(workspaceId, `stop payload session=${payload.session_id} branch=${branchName ?? 'none'} tool=${enrichment.detectedToolName ?? 'none'} msgLen=${messageToPersist.length}`);

      const response = await fetch(`${SERVER_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      appendClaudeDebugLog(workspaceId, `stop event posted status=${response.status} ok=${response.ok}`);
    } catch (err) {
      console.error(`${tag} close handler error:`, err);
      appendClaudeDebugLog(workspaceId, `close handler error=${String(err)}`);
    }
  });

  return worktreePath;
}
