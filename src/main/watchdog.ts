import fs from 'node:fs';
import path from 'node:path';
import { ChildProcess } from 'node:child_process';

export const CLAUDE_INACTIVITY_TIMEOUT_MS = Number(
  process.env.CLAUDE_INACTIVITY_TIMEOUT_MS ?? process.env.CLAUDE_TIMEOUT_MS ?? 120_000,
);

export interface ClaudeRunState {
  messageId: string;
  child: ChildProcess;
  lastActivityAt: number;
  watchdogTimer: NodeJS.Timeout | null;
  active: boolean;
  stopped: boolean;
  timedOut: boolean;
}

export const runStateByMessageId = new Map<string, ClaudeRunState>();

let worktreeBaseFn: () => string;

export function setWorktreeBaseFn(fn: () => string) {
  worktreeBaseFn = fn;
}

export function appendClaudeDebugLog(messageId: string, line: string) {
  try {
    const base = worktreeBaseFn();
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

export function scheduleWatchdog(messageId: string) {
  const state = runStateByMessageId.get(messageId);
  if (!state || !state.active || state.stopped) return;

  if (state.watchdogTimer) clearTimeout(state.watchdogTimer);

  state.watchdogTimer = setTimeout(() => {
    const latest = runStateByMessageId.get(messageId);
    if (!latest || !latest.active || latest.stopped) return;

    const idleFor = Date.now() - latest.lastActivityAt;
    if (idleFor < CLAUDE_INACTIVITY_TIMEOUT_MS) {
      scheduleWatchdog(messageId);
      return;
    }

    latest.timedOut = true;
    latest.active = false;
    latest.stopped = true;
    if (latest.watchdogTimer) {
      clearTimeout(latest.watchdogTimer);
      latest.watchdogTimer = null;
    }

    appendClaudeDebugLog(
      messageId,
      `inactivity-timeout reached (${CLAUDE_INACTIVITY_TIMEOUT_MS}ms idle), sending SIGTERM`,
    );

    if (!latest.child.killed) {
      latest.child.kill('SIGTERM');
      console.error(
        `[claude:${messageId.slice(0, 8)}] inactivity timeout after ${CLAUDE_INACTIVITY_TIMEOUT_MS}ms, sent SIGTERM`,
      );
    }
  }, CLAUDE_INACTIVITY_TIMEOUT_MS);
}

export function startWatchdog(messageId: string, child: ChildProcess) {
  const existing = runStateByMessageId.get(messageId);
  if (existing?.watchdogTimer) clearTimeout(existing.watchdogTimer);

  runStateByMessageId.set(messageId, {
    messageId,
    child,
    lastActivityAt: Date.now(),
    watchdogTimer: null,
    active: true,
    stopped: false,
    timedOut: false,
  });

  appendClaudeDebugLog(
    messageId,
    `watchdog started inactivityTimeoutMs=${CLAUDE_INACTIVITY_TIMEOUT_MS}`,
  );
  scheduleWatchdog(messageId);
}

export function resetWatchdog(messageId: string, reason: string) {
  const state = runStateByMessageId.get(messageId);
  if (!state || !state.active || state.stopped) return;

  state.lastActivityAt = Date.now();
  appendClaudeDebugLog(messageId, `watchdog reset reason=${reason}`);
  scheduleWatchdog(messageId);
}

export function stopWatchdog(messageId: string, reason: string) {
  const state = runStateByMessageId.get(messageId);
  if (!state) return;

  state.active = false;
  state.stopped = true;
  if (state.watchdogTimer) {
    clearTimeout(state.watchdogTimer);
    state.watchdogTimer = null;
  }
  appendClaudeDebugLog(messageId, `watchdog stopped reason=${reason}`);
}
