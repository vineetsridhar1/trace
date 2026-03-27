import WebSocket from "ws";
import os from "os";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type {
  BridgeClient as IBridgeClient,
  BridgeCommand,
  BridgeMessage,
  CodingToolAdapter,
  GitCheckpointBridgePayload,
  GitCheckpointContext,
  GitCheckpointTrigger,
} from "@trace/shared";
import { extractGitToolUsePending, extractGitToolResultTrigger, parseBranchOutput, handleListFiles, handleReadFile, handleBranchDiff, handleFileAtRef, GIT_SHOW_ARGS, GIT_DIFF_TREE_ARGS, parseGitShowOutput } from "@trace/shared";
import type { GitExecFn } from "@trace/shared";
import { ClaudeCodeAdapter, CodexAdapter } from "@trace/shared/adapters";
import { getOrCreateInstanceId, getRepoConfig, readConfig } from "./config.js";
import { createWorktree, removeWorktree } from "./worktree.js";
import { runtimeDebug } from "./runtime-debug.js";
import { TerminalManager } from "@trace/shared/adapters";
import {
  loadQueuedGitHookCheckpoints,
  removeQueuedCheckpointFile,
  writeCheckpointContext,
} from "./hook-runtime.js";

const HEARTBEAT_INTERVAL_MS = 10_000;
const HOOK_QUEUE_FLUSH_INTERVAL_MS = 2_000;
const execFileAsync = promisify(execFile);

async function inspectGitCheckpoint(
  cwd: string,
  trigger: GitCheckpointTrigger,
  command: string,
): Promise<GitCheckpointBridgePayload> {
  const [{ stdout: showStdout }, { stdout: diffStdout }] = await Promise.all([
    execFileAsync("git", [...GIT_SHOW_ARGS], { cwd, maxBuffer: 1024 * 1024 }),
    execFileAsync("git", [...GIT_DIFF_TREE_ARGS], { cwd, maxBuffer: 5 * 1024 * 1024 }),
  ]);
  return parseGitShowOutput(showStdout, diffStdout, trigger, command, new Date().toISOString());
}

export type BridgeConnectionStatus = "connecting" | "connected" | "disconnected";

export class BridgeClient implements IBridgeClient {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private adapters = new Map<string, CodingToolAdapter>();
  private sessionTools = new Map<string, string>();
  private reportedToolSessionIds = new Map<string, string>();
  private instanceId: string;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private hookQueueTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isFlushingHookQueue = false;
  private status: BridgeConnectionStatus = "disconnected";
  private statusListeners = new Set<(status: BridgeConnectionStatus) => void>();
  /** Maps sessionId → workdir so terminals can spawn in the correct directory */
  private sessionWorkdirs = new Map<string, string>();
  /** Coalesces concurrent createWorktree calls for the same worktree key (sessionGroupId or sessionId) */
  private pendingWorktrees = new Map<string, Promise<{ workdir: string; branch: string }>>();
  /** Sessions running in read-only mode (no worktree, using user's repo checkout) */
  private readOnlySessions = new Set<string>();
  /** Phase-1 git detection: sessionId → Map<toolUseId → {trigger, command}> */
  private pendingGitToolUses = new Map<string, Map<string, { trigger: import("@trace/shared").GitCheckpointTrigger; command: string }>>();
  private terminalManager: TerminalManager;

  private gitExec: GitExecFn = (args, cwd) =>
    new Promise((resolve, reject) => {
      execFile("git", args, { cwd, maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
    this.instanceId = getOrCreateInstanceId();
    this.terminalManager = new TerminalManager({
      onOutput: (terminalId, data) => {
        this.send({ type: "terminal_output", terminalId, data });
      },
      onExit: (terminalId, exitCode) => {
        this.send({ type: "terminal_exit", terminalId, exitCode });
      },
    });
  }

  connect() {
    this.cancelPendingReconnect();
    this.setStatus("connecting");
    runtimeDebug("desktop bridge connecting", { serverUrl: this.serverUrl, instanceId: this.instanceId });
    this.ws = new WebSocket(`${this.serverUrl}/bridge`);

    this.ws.on("open", () => {
      console.log("[bridge] connected to server");
      runtimeDebug("desktop bridge websocket open", { instanceId: this.instanceId });
      this.setStatus("connected");
      this.sendRuntimeHello();
      this.startHeartbeat();
      this.startHookQueueDrain();
      void this.flushQueuedGitHookCheckpoints();
    });

    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as BridgeCommand;
        this.handleCommand(msg);
      } catch (err) {
        console.error("[bridge] failed to parse message:", err);
      }
    });

    this.ws.on("close", () => {
      console.log("[bridge] disconnected, reconnecting in 3s...");
      this.stopHeartbeat();
      this.stopHookQueueDrain();
      runtimeDebug("desktop bridge websocket closed", { instanceId: this.instanceId });
      this.setStatus("disconnected");
      this.scheduleReconnect(3000);
    });

    this.ws.on("error", (err) => {
      console.error("[bridge] error:", err.message);
      runtimeDebug("desktop bridge websocket error", { instanceId: this.instanceId, error: err.message });
    });
  }

  send(data: BridgeMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect() {
    this.cancelPendingReconnect();
    this.stopHeartbeat();
    this.stopHookQueueDrain();
    this.terminalManager.destroyAll();
    for (const adapter of this.adapters.values()) {
      adapter.abort();
    }
    this.adapters.clear();
    this.ws?.close();
    this.ws = null;
    this.setStatus("disconnected");
  }

  /**
   * Force an immediate reconnect — used after system wake to avoid waiting
   * for the stale WebSocket to time out on its own.
   */
  forceReconnect() {
    console.log("[bridge] force reconnecting...");
    runtimeDebug("desktop bridge force reconnect", { instanceId: this.instanceId });
    this.cancelPendingReconnect();
    this.stopHeartbeat();
    this.stopHookQueueDrain();
    // Tear down the old socket without triggering the close handler's reconnect
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
    this.connect();
  }

  private cancelPendingReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(delayMs: number) {
    this.cancelPendingReconnect();
    this.reconnectTimer = setTimeout(() => this.connect(), delayMs);
  }

  getStatus(): BridgeConnectionStatus {
    return this.status;
  }

  onStatusChange(listener: (status: BridgeConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private sendRuntimeHello() {
    // Announce identity — the server restores session bindings from the DB
    // using our stable instanceId, so we don't need to report session lists.
    const config = readConfig();
    runtimeDebug("desktop bridge sending runtime_hello", {
      instanceId: this.instanceId,
      label: os.hostname(),
      supportedTools: ["claude_code", "codex", "custom"],
      registeredRepoIds: Object.keys(config.repos),
    });
    this.send({
      type: "runtime_hello",
      instanceId: this.instanceId,
      label: os.hostname(),
      hostingMode: "local",
      supportedTools: ["claude_code", "codex", "custom"],
      registeredRepoIds: Object.keys(config.repos),
      activeTerminals: this.terminalManager.getActiveTerminals(),
    });
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: "runtime_heartbeat", instanceId: this.instanceId });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setStatus(status: BridgeConnectionStatus) {
    if (this.status === status) return;
    runtimeDebug("desktop bridge status changed", { instanceId: this.instanceId, from: this.status, to: status });
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private createAdapter(tool?: string): CodingToolAdapter {
    switch (tool) {
      case "codex":
        return new CodexAdapter();
      case "claude_code":
      default:
        return new ClaudeCodeAdapter();
    }
  }

  private startHookQueueDrain() {
    this.stopHookQueueDrain();
    this.hookQueueTimer = setInterval(() => {
      void this.flushQueuedGitHookCheckpoints();
    }, HOOK_QUEUE_FLUSH_INTERVAL_MS);
  }

  private stopHookQueueDrain() {
    if (this.hookQueueTimer) {
      clearInterval(this.hookQueueTimer);
      this.hookQueueTimer = null;
    }
  }

  private async flushQueuedGitHookCheckpoints() {
    if (this.isFlushingHookQueue || this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.isFlushingHookQueue = true;

    try {
      const queued = await loadQueuedGitHookCheckpoints();
      if (queued.length === 0) return;

      for (const { entry, filePath } of queued) {
        if (this.ws?.readyState !== WebSocket.OPEN) break;

        this.send({
          type: "git_checkpoint",
          sessionId: entry.sessionId,
          checkpoint: entry.checkpoint,
        });

        // Delete only this file — new entries queued concurrently are untouched
        await removeQueuedCheckpointFile(filePath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[bridge] failed to flush queued git hook checkpoints:", message);
    } finally {
      this.isFlushingHookQueue = false;
    }
  }

  private async runPrompt({
    sessionId,
    prompt,
    cwd,
    tool,
    model,
    interactionMode,
    toolSessionId,
    checkpointContext,
  }: {
    sessionId: string;
    prompt: string;
    cwd?: string;
    tool?: string;
    model?: string;
    interactionMode?: string;
    toolSessionId?: string;
    checkpointContext?: GitCheckpointContext | null;
  }) {
    if (!cwd) {
      console.warn(`[bridge] No cwd provided for session ${sessionId}, falling back to home directory (${os.homedir()})`);
    }
    const workdir = cwd ?? os.homedir();

    if (checkpointContext && cwd) {
      try {
        await writeCheckpointContext(workdir, checkpointContext);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[bridge] failed to write checkpoint context for ${sessionId}:`, message);
      }
    }

    // If tool changed, abort old adapter and create a fresh one
    const prevTool = this.sessionTools.get(sessionId);
    if (tool && prevTool && prevTool !== tool) {
      const oldAdapter = this.adapters.get(sessionId);
      if (oldAdapter) oldAdapter.abort();
      this.adapters.delete(sessionId);
    }

    // Reuse existing adapter (retains session state for --resume)
    let adapter = this.adapters.get(sessionId);
    if (!adapter) {
      adapter = this.createAdapter(tool);
      this.adapters.set(sessionId, adapter);
      this.send({ type: "register_session", sessionId });
    }
    if (tool) this.sessionTools.set(sessionId, tool);

    // Capture reference so stale callbacks from an aborted adapter
    // (e.g. after a tool switch) are silently dropped.
    const activeAdapter = adapter;
    adapter.run({
      prompt,
      cwd: workdir,
      onOutput: (output) => {
        if (this.adapters.get(sessionId) !== activeAdapter) return;
        this.send({ type: "session_output", sessionId, data: output });

        // Phase 1: collect tool_use blocks whose command is a git commit/push
        const newPending = extractGitToolUsePending(output);
        if (newPending.size > 0) {
          const sessionPending = this.pendingGitToolUses.get(sessionId) ?? new Map();
          for (const [id, val] of newPending) sessionPending.set(id, val);
          this.pendingGitToolUses.set(sessionId, sessionPending);
        }

        // Phase 2: fire checkpoint when the matching tool_result arrives
        const sessionPending = this.pendingGitToolUses.get(sessionId) ?? new Map();
        const gitTrigger = extractGitToolResultTrigger(output, sessionPending);
        if (gitTrigger) {
          if (gitTrigger.toolUseId) sessionPending.delete(gitTrigger.toolUseId);
          inspectGitCheckpoint(workdir, gitTrigger.trigger, gitTrigger.command)
            .then((checkpoint) => {
              if (this.adapters.get(sessionId) !== activeAdapter) return;
              this.send({ type: "git_checkpoint", sessionId, checkpoint });
            })
            .catch((err: Error) => {
              console.warn(`[bridge] failed to inspect git checkpoint for ${sessionId}:`, err.message);
            });
        }
        // When the adapter discovers its tool session ID, report it to the server
        // so it can be passed back on retry/resume
        if (adapter.getSessionId) {
          const sid = adapter.getSessionId();
          if (sid && sid !== this.reportedToolSessionIds.get(sessionId)) {
            this.reportedToolSessionIds.set(sessionId, sid);
            this.send({ type: "tool_session_id", sessionId, toolSessionId: sid });
          }
        }
      },
      onComplete: () => {
        if (this.adapters.get(sessionId) !== activeAdapter) return;
        this.send({ type: "session_complete", sessionId });
      },
      interactionMode: interactionMode as "code" | "plan" | "ask" | undefined,
      model,
      toolSessionId,
    });
  }

  private handleCommand(cmd: BridgeCommand) {
    switch (cmd.type) {
      case "run": {
        void this.runPrompt({
          sessionId: cmd.sessionId,
          prompt: cmd.prompt ?? "",
          cwd: cmd.cwd,
          tool: cmd.tool,
          model: cmd.model,
          interactionMode: cmd.interactionMode,
          toolSessionId: cmd.toolSessionId,
          checkpointContext: cmd.checkpointContext,
        });
        break;
      }
      case "send": {
        void this.runPrompt({
          sessionId: cmd.sessionId,
          prompt: cmd.prompt,
          cwd: cmd.cwd,
          tool: cmd.tool,
          model: cmd.model,
          interactionMode: cmd.interactionMode,
          toolSessionId: cmd.toolSessionId,
          checkpointContext: cmd.checkpointContext,
        });
        break;
      }
      case "prepare": {
        const { sessionId, sessionGroupId, repoId, repoName, defaultBranch, branch, checkpointSha, readOnly } = cmd;
        const repoConfig = getRepoConfig(repoId);
        const repoPath = repoConfig?.path;

        if (!repoPath) {
          this.send({
            type: "workspace_failed",
            sessionId,
            error: `No local path configured for repo "${repoName}" (${repoId}). Configure it in Settings.`,
          });
          break;
        }

        if (readOnly) {
          // Read-only mode: skip worktree, use the user's actual repo checkout
          this.sessionWorkdirs.set(sessionId, repoPath);
          this.readOnlySessions.add(sessionId);
          this.send({ type: "workspace_ready", sessionId, workdir: repoPath });
          break;
        }

        // Coalesce concurrent createWorktree calls for the same group
        const worktreeKey = sessionGroupId ?? sessionId;
        let worktreePromise = this.pendingWorktrees.get(worktreeKey);
        if (!worktreePromise) {
          worktreePromise = createWorktree({
            repoPath,
            repoId,
            sessionId,
            sessionGroupId,
            defaultBranch,
            startBranch: branch,
            checkpointSha,
            gitHooksEnabled: repoConfig.gitHooksEnabled,
          });
          this.pendingWorktrees.set(worktreeKey, worktreePromise);
          worktreePromise.finally(() => this.pendingWorktrees.delete(worktreeKey));
        }
        worktreePromise
          .then(({ workdir, branch: worktreeBranch }) => {
            this.sessionWorkdirs.set(sessionId, workdir);
            this.send({ type: "workspace_ready", sessionId, workdir, branch: worktreeBranch });
          })
          .catch((err: Error) => {
            this.send({ type: "workspace_failed", sessionId, error: err.message });
          });
        break;
      }
      case "upgrade_workspace": {
        const { sessionId, sessionGroupId, repoId, repoName, defaultBranch, branch } = cmd;
        const repoConfig = getRepoConfig(repoId);
        const repoPath = repoConfig?.path;

        if (!repoPath) {
          this.send({
            type: "workspace_failed",
            sessionId,
            error: `No local path configured for repo "${repoName}" (${repoId}). Configure it in Settings.`,
          });
          break;
        }

        createWorktree({
          repoPath,
          repoId,
          sessionId,
          sessionGroupId,
          defaultBranch,
          startBranch: branch,
          gitHooksEnabled: repoConfig.gitHooksEnabled,
        })
          .then(({ workdir, branch: worktreeBranch }) => {
            this.sessionWorkdirs.set(sessionId, workdir);
            this.readOnlySessions.delete(sessionId);
            this.send({ type: "workspace_ready", sessionId, workdir, branch: worktreeBranch });
          })
          .catch((err: Error) => {
            this.send({ type: "workspace_failed", sessionId, error: err.message });
          });
        break;
      }
      case "terminate": {
        const adapter = this.adapters.get(cmd.sessionId);
        if (adapter) {
          // Abort the running process but keep the adapter so it retains
          // the Claude Code session ID for --resume on subsequent messages.
          adapter.abort();
        }
        break;
      }
      case "pause": {
        const pauseAdapter = this.adapters.get(cmd.sessionId);
        if (pauseAdapter) {
          pauseAdapter.abort();
        }
        break;
      }
      case "resume": {
        // Nothing to do — the adapter is kept and will be reused on next run/send
        break;
      }
      case "delete": {
        const deleteAdapter = this.adapters.get(cmd.sessionId);
        if (deleteAdapter) {
          deleteAdapter.abort();
          this.adapters.delete(cmd.sessionId);
        }
        this.sessionTools.delete(cmd.sessionId);
        this.reportedToolSessionIds.delete(cmd.sessionId);
        const wasReadOnly = this.readOnlySessions.has(cmd.sessionId);
        this.readOnlySessions.delete(cmd.sessionId);
        this.sessionWorkdirs.delete(cmd.sessionId);
        this.pendingGitToolUses.delete(cmd.sessionId);
        this.terminalManager.destroyForSession(cmd.sessionId);

        // Clean up worktree if one exists — skip for read-only sessions (no worktree to remove)
        if (cmd.workdir && cmd.repoId && !wasReadOnly) {
          const repoPath = getRepoConfig(cmd.repoId)?.path;
          if (repoPath) {
            removeWorktree({ repoPath, worktreePath: cmd.workdir }).catch((err: Error) => {
              console.warn(`[bridge] failed to remove worktree ${cmd.workdir}:`, err.message);
            });
          }
        }
        break;
      }
      case "list_branches": {
        const { requestId, repoId } = cmd;
        const repoPath = getRepoConfig(repoId)?.path;

        if (!repoPath) {
          this.send({ type: "branches_result", requestId, branches: [], error: "Repo not linked" });
          break;
        }

        execFile("git", ["branch", "-a", "--format=%(refname:short)"], { cwd: repoPath }, (err, stdout) => {
          if (err) {
            this.send({ type: "branches_result", requestId, branches: [], error: err.message });
            return;
          }
          this.send({ type: "branches_result", requestId, branches: parseBranchOutput(stdout) });
        });
        break;
      }
      case "list_files": {
        handleListFiles(cmd, this.sessionWorkdirs, (msg) => this.send(msg), {
          gitLsFiles: (cwd, cb) => execFile("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd, maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
            if (err) return cb(err, []);
            cb(null, stdout.split("\n").filter(Boolean));
          }),
          fs, path,
        });
        break;
      }
      case "read_file": {
        handleReadFile(cmd, this.sessionWorkdirs, (msg) => this.send(msg), { fs, path });
        break;
      }
      case "branch_diff": {
        void handleBranchDiff(cmd, this.sessionWorkdirs, (msg) => this.send(msg), this.gitExec);
        break;
      }
      case "file_at_ref": {
        void handleFileAtRef(cmd, this.sessionWorkdirs, (msg) => this.send(msg), this.gitExec);
        break;
      }
      case "terminal_create": {
        const { terminalId, sessionId, cols, rows, cwd } = cmd;
        const workdir = cwd || this.sessionWorkdirs.get(sessionId) || os.homedir();
        try {
          this.terminalManager.create(terminalId, sessionId, workdir, cols, rows);
          this.send({ type: "terminal_ready", terminalId });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.send({ type: "terminal_error", terminalId, error: message });
        }
        break;
      }
      case "terminal_input": {
        this.terminalManager.write(cmd.terminalId, cmd.data);
        break;
      }
      case "terminal_resize": {
        this.terminalManager.resize(cmd.terminalId, cmd.cols, cmd.rows);
        break;
      }
      case "terminal_destroy": {
        this.terminalManager.destroy(cmd.terminalId);
        break;
      }
    }
  }
}
