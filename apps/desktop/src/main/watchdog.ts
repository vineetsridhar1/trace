import fs from "node:fs";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { killProcessGroup } from "./process";

export const AGENT_INACTIVITY_TIMEOUT_MS = Number(
  process.env.AGENT_INACTIVITY_TIMEOUT_MS ??
    process.env.AGENT_TIMEOUT_MS ??
    process.env.CLAUDE_INACTIVITY_TIMEOUT_MS ??
    process.env.CLAUDE_TIMEOUT_MS ??
    720_000,
);

export interface AgentRunState {
  workspaceId: string;
  child: ChildProcess;
  lastActivityAt: number;
  watchdogTimer: NodeJS.Timeout | null;
  active: boolean;
  stopped: boolean;
  timedOut: boolean;
  userStopped: boolean;
}

export const runStateByWorkspaceId = new Map<string, AgentRunState>();

let worktreeBaseFn: () => string;

export function setWorktreeBaseFn(fn: () => string) {
  worktreeBaseFn = fn;
}

export function appendAgentDebugLog(workspaceId: string, line: string) {
  try {
    const base = worktreeBaseFn();
    if (!fs.existsSync(base)) {
      fs.mkdirSync(base, { recursive: true });
    }
    const logPath = path.join(base, "agent-debug.log");
    const stamped = `[${new Date().toISOString()}] [${workspaceId.slice(0, 8)}] ${line}\n`;
    fs.appendFileSync(logPath, stamped);
  } catch (err) {
    console.error("Failed to write agent debug log:", err);
  }
}

export function scheduleWatchdog(workspaceId: string) {
  const state = runStateByWorkspaceId.get(workspaceId);
  if (!state || !state.active || state.stopped) return;

  if (state.watchdogTimer) clearTimeout(state.watchdogTimer);

  state.watchdogTimer = setTimeout(() => {
    const latest = runStateByWorkspaceId.get(workspaceId);
    if (!latest || !latest.active || latest.stopped) return;

    const idleFor = Date.now() - latest.lastActivityAt;
    if (idleFor < AGENT_INACTIVITY_TIMEOUT_MS) {
      scheduleWatchdog(workspaceId);
      return;
    }

    latest.timedOut = true;
    latest.active = false;
    latest.stopped = true;
    if (latest.watchdogTimer) {
      clearTimeout(latest.watchdogTimer);
      latest.watchdogTimer = null;
    }

    appendAgentDebugLog(
      workspaceId,
      `inactivity-timeout reached (${AGENT_INACTIVITY_TIMEOUT_MS}ms idle), sending SIGTERM`,
    );

    killProcessGroup(latest.child);
    console.error(
      `[agent:${workspaceId.slice(0, 8)}] inactivity timeout after ${AGENT_INACTIVITY_TIMEOUT_MS}ms, sent SIGTERM to process group`,
    );
  }, AGENT_INACTIVITY_TIMEOUT_MS);
}

export function startWatchdog(workspaceId: string, child: ChildProcess) {
  const existing = runStateByWorkspaceId.get(workspaceId);
  if (existing?.watchdogTimer) clearTimeout(existing.watchdogTimer);

  runStateByWorkspaceId.set(workspaceId, {
    workspaceId,
    child,
    lastActivityAt: Date.now(),
    watchdogTimer: null,
    active: true,
    stopped: false,
    timedOut: false,
    userStopped: false,
  });

  appendAgentDebugLog(
    workspaceId,
    `watchdog started inactivityTimeoutMs=${AGENT_INACTIVITY_TIMEOUT_MS}`,
  );
  scheduleWatchdog(workspaceId);
}

export function resetWatchdog(workspaceId: string, reason: string) {
  const state = runStateByWorkspaceId.get(workspaceId);
  if (!state || !state.active || state.stopped) return;

  state.lastActivityAt = Date.now();
  appendAgentDebugLog(workspaceId, `watchdog reset reason=${reason}`);
  scheduleWatchdog(workspaceId);
}

export function stopWatchdog(workspaceId: string, reason: string) {
  const state = runStateByWorkspaceId.get(workspaceId);
  if (!state) return;

  state.active = false;
  state.stopped = true;
  if (state.watchdogTimer) {
    clearTimeout(state.watchdogTimer);
    state.watchdogTimer = null;
  }
  appendAgentDebugLog(workspaceId, `watchdog stopped reason=${reason}`);
}
