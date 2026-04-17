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
  GitCheckpointTrigger,
  SessionDatabaseInfo,
  ToolOutput,
} from "@trace/shared";
import {
  extractGitToolUsePending,
  extractGitToolResultTrigger,
  parseBranchOutput,
  handleListFiles,
  handleReadFile,
  handleBranchDiff,
  handleFileAtRef,
  handleListSkills,
  GIT_SHOW_ARGS,
  GIT_DIFF_TREE_ARGS,
  parseGitShowOutput,
} from "@trace/shared";
import type { GitExecFn } from "@trace/shared";
import { createDbctlClient, createDefaultDbctlSocketPath } from "@trace/dbctl-core";
import { ClaudeCodeAdapter, CodexAdapter } from "@trace/shared/adapters";
import { ensureRepo, createWorktree, removeWorktree, getRepoPath } from "./workspace.js";
import { ensureToolReady } from "./tool-auth.js";
import { TerminalManager } from "@trace/shared/adapters";

const execFileAsync = promisify(execFile);

function createDisabledDatabase(): SessionDatabaseInfo {
  return {
    enabled: false,
    status: "disabled",
    canReset: false,
    updatedAt: new Date().toISOString(),
  };
}

function createFailedDatabase(error: string): SessionDatabaseInfo {
  return {
    enabled: true,
    status: "failed",
    lastError: error,
    canReset: true,
    updatedAt: new Date().toISOString(),
  };
}

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

function isPendingInputOutput(output: ToolOutput): boolean {
  return (
    output.type === "assistant" &&
    output.message.content.some((block) => block.type === "question" || block.type === "plan")
  );
}

function getPendingInputToolUseId(output: ToolOutput): string | null {
  if (output.type !== "assistant") return null;
  for (const block of output.message.content) {
    if (
      (block.type === "question" || block.type === "plan") &&
      typeof block.toolUseId === "string"
    ) {
      return block.toolUseId;
    }
  }
  return null;
}

/**
 * Multi-session container bridge — runs inside a Fly Machine (one per user per org).
 * Mirrors the desktop BridgeClient pattern: Map-based adapters, dynamic session binding.
 * Handles prepare/delete commands for repo cloning and worktree management.
 */
export class ContainerBridge implements IBridgeClient {
  private ws: WebSocket | null = null;
  private adapters = new Map<string, CodingToolAdapter>();
  private sessionTools = new Map<string, string>();
  private reportedToolSessionIds = new Map<string, string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private consecutiveFailures = 0;
  /** Max consecutive connection failures before the process exits, allowing the machine to stop. */
  private static MAX_RECONNECT_FAILURES = 20;
  private sessionWorkdirs = new Map<string, string>();
  private databaseEnvByWorkdir = new Map<string, Record<string, string>>();
  private databaseInfoByWorkdir = new Map<string, SessionDatabaseInfo>();
  /** Coalesces concurrent createWorktree calls for the same worktree key (sessionGroupId or sessionId) */
  private pendingWorktrees = new Map<string, Promise<{ workdir: string; slug: string }>>();
  /** Sessions running in read-only mode (no worktree, using bare repo path) */
  private readOnlySessions = new Set<string>();
  /** Phase-1 git detection: sessionId → Map<toolUseId → {trigger, command}> */
  private pendingGitToolUses = new Map<
    string,
    Map<string, { trigger: import("@trace/shared").GitCheckpointTrigger; command: string }>
  >();
  private pendingInputToolUseIds = new Map<string, string>();
  private sessionRunSequence = new Map<string, number>();
  private activeRuns = new Map<string, number>();
  private terminalManager: TerminalManager;
  private gitExec: GitExecFn = (args, cwd) =>
    new Promise((resolve, reject) => {
      execFile("git", args, { cwd, maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
  private lastActivity = Date.now();
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;
  /** Exit if no sessions/terminals have been active for this long. */
  private static IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  constructor(
    private readonly serverUrl: string,
    private readonly token: string,
    private readonly machineId: string,
    private readonly defaultTool: string,
  ) {
    this.terminalManager = new TerminalManager({
      onOutput: (terminalId, data) => {
        this.send({ type: "terminal_output", terminalId, data });
      },
      onExit: (terminalId, exitCode) => {
        this.send({ type: "terminal_exit", terminalId, exitCode });
      },
    });
  }

  connect(): void {
    const url = `${this.serverUrl}?token=${encodeURIComponent(this.token)}`;
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[container-bridge] connected to server");
      this.consecutiveFailures = 0;
      // Announce as a cloud runtime — machineId is the stable instanceId
      this.send({
        type: "runtime_hello",
        instanceId: `cloud-machine-${this.machineId}`,
        label: `cloud-machine-${this.machineId}`,
        hostingMode: "cloud",
        supportedTools: ["claude_code", "codex"],
        registeredRepoIds: [], // Cloud bridges clone on-demand — all repos supported
        activeTerminals: this.terminalManager.getActiveTerminals(),
      });

      this.startHeartbeat();
    });

    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as BridgeCommand;
        this.handleCommand(msg);
      } catch (err) {
        console.error("[container-bridge] error parsing message:", err);
      }
    });

    this.ws.on("close", () => {
      console.log("[container-bridge] disconnected");
      this.stopHeartbeat();
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error("[container-bridge] error:", err.message);
    });
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.terminalManager.destroyAll();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const [sessionId, adapter] of this.adapters.entries()) {
      this.cancelRun(sessionId);
      adapter.abort();
    }
    this.adapters.clear();
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.pendingInputToolUseIds.clear();
  }

  send(data: BridgeMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.consecutiveFailures++;

    if (this.consecutiveFailures >= ContainerBridge.MAX_RECONNECT_FAILURES) {
      console.error(
        `[container-bridge] ${this.consecutiveFailures} consecutive connection failures, exiting`,
      );
      process.exit(1);
    }

    // Exponential backoff: 3s, 6s, 12s, ... capped at 30s
    const delay = Math.min(3000 * 2 ** (this.consecutiveFailures - 1), 30_000);
    console.log(
      `[container-bridge] reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.consecutiveFailures}/${ContainerBridge.MAX_RECONNECT_FAILURES})...`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private touchActivity(): void {
    this.lastActivity = Date.now();
  }

  /** Returns true if there are active sessions or terminals. */
  private hasActiveWork(): boolean {
    return this.adapters.size > 0 || this.terminalManager.hasTerminals();
  }

  startIdleWatch(): void {
    if (this.idleCheckTimer) return;
    this.idleCheckTimer = setInterval(() => {
      if (this.hasActiveWork()) {
        this.lastActivity = Date.now();
        return;
      }
      const idleMs = Date.now() - this.lastActivity;
      if (idleMs >= ContainerBridge.IDLE_TIMEOUT_MS) {
        console.log(
          `[container-bridge] idle for ${Math.round(idleMs / 1000)}s with no active work, exiting`,
        );
        this.disconnect();
        process.exit(0);
      }
    }, 60_000); // Check every minute
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: "runtime_heartbeat", instanceId: `cloud-machine-${this.machineId}` });
    }, 10_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private startRun(sessionId: string): number {
    const runId = (this.sessionRunSequence.get(sessionId) ?? 0) + 1;
    this.sessionRunSequence.set(sessionId, runId);
    this.activeRuns.set(sessionId, runId);
    return runId;
  }

  private finishRun(sessionId: string, runId: number): void {
    if (this.activeRuns.get(sessionId) === runId) {
      this.activeRuns.delete(sessionId);
    }
  }

  private cancelRun(sessionId: string): void {
    this.activeRuns.delete(sessionId);
  }

  private isCurrentRun(sessionId: string, adapter: CodingToolAdapter, runId: number): boolean {
    return this.adapters.get(sessionId) === adapter && this.activeRuns.get(sessionId) === runId;
  }

  private createAdapter(tool?: string): CodingToolAdapter {
    const resolvedTool = tool ?? this.defaultTool;
    switch (resolvedTool) {
      case "codex":
        return new CodexAdapter();
      case "claude_code":
      default:
        return new ClaudeCodeAdapter();
    }
  }

  private getDatabaseEnv(sessionId: string, cwd?: string): Record<string, string> | undefined {
    const workdir = this.sessionWorkdirs.get(sessionId) ?? cwd;
    return workdir ? this.databaseEnvByWorkdir.get(workdir) : undefined;
  }

  private setDatabaseState(
    workdir: string,
    database: SessionDatabaseInfo,
    env?: Record<string, string>,
  ): void {
    this.databaseInfoByWorkdir.set(workdir, database);
    if (database.status === "ready" && env) {
      this.databaseEnvByWorkdir.set(workdir, env);
      return;
    }
    this.databaseEnvByWorkdir.delete(workdir);
  }

  private async ensureManagedDatabase(options: {
    workdir: string;
    repoId: string;
    repoRoot: string;
  }): Promise<SessionDatabaseInfo> {
    const client = createDbctlClient(
      process.env.TRACE_DBCTL_SOCKET_PATH ?? createDefaultDbctlSocketPath("cloud"),
    );
    const response = await client.send({
      kind: "ensure",
      runtime: "cloud",
      worktreePath: options.workdir,
      repoId: options.repoId,
      repoRoot: options.repoRoot,
    });
    if (!response.ok) {
      throw new Error(response.error);
    }
    this.setDatabaseState(options.workdir, response.database, response.env);
    return response.database;
  }

  private async resetManagedDatabase(sessionId: string): Promise<SessionDatabaseInfo> {
    const workdir = this.sessionWorkdirs.get(sessionId);
    if (!workdir) {
      return createFailedDatabase("Workspace is not ready yet");
    }

    try {
      const client = createDbctlClient(
        process.env.TRACE_DBCTL_SOCKET_PATH ?? createDefaultDbctlSocketPath("cloud"),
      );
      const response = await client.send({
        kind: "reset",
        runtime: "cloud",
        worktreePath: workdir,
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      this.setDatabaseState(workdir, response.database, response.env);
      return response.database;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const database = createFailedDatabase(message);
      this.setDatabaseState(workdir, database);
      return database;
    }
  }

  private async destroyManagedDatabase(workdir: string): Promise<void> {
    try {
      const client = createDbctlClient(
        process.env.TRACE_DBCTL_SOCKET_PATH ?? createDefaultDbctlSocketPath("cloud"),
      );
      await client.send({ kind: "destroy", worktreePath: workdir });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[container-bridge] failed to destroy managed database for ${workdir}:`, message);
    } finally {
      this.databaseEnvByWorkdir.delete(workdir);
      this.databaseInfoByWorkdir.delete(workdir);
    }
  }

  private handleCommand(cmd: BridgeCommand): void {
    this.touchActivity();
    switch (cmd.type) {
      case "run":
      case "send": {
        this.runPrompt({
          sessionId: cmd.sessionId,
          prompt: cmd.prompt ?? "",
          cwd: cmd.cwd ?? os.homedir(),
          tool: cmd.tool,
          model: cmd.model,
          interactionMode: cmd.interactionMode,
          toolSessionId: cmd.toolSessionId,
        }).catch((err) => {
          console.error(`[container-bridge] runPrompt failed for ${cmd.sessionId}:`, err);
          this.send({
            type: "session_output",
            sessionId: cmd.sessionId,
            data: { type: "error", message: err instanceof Error ? err.message : String(err) },
          });
          this.send({ type: "session_complete", sessionId: cmd.sessionId });
        });
        break;
      }

      case "prepare": {
        const {
          sessionId,
          sessionGroupId,
          slug,
          repoId,
          repoRemoteUrl,
          defaultBranch,
          branch,
          checkpointSha,
          readOnly,
        } = cmd;

        (async () => {
          try {
            await ensureRepo(repoId, repoRemoteUrl);

            if (readOnly) {
              // Read-only mode: skip worktree, use the bare repo path directly
              const workdir = getRepoPath(repoId);
              if (!workdir) throw new Error(`Repo path not found after ensureRepo for ${repoId}`);
              this.sessionWorkdirs.set(sessionId, workdir);
              this.readOnlySessions.add(sessionId);
              this.send({ type: "register_session", sessionId });
              this.send({
                type: "workspace_ready",
                sessionId,
                workdir,
                database: createDisabledDatabase(),
              });
            } else {
              // Coalesce concurrent createWorktree calls for the same group
              const worktreeKey = slug ?? sessionGroupId ?? sessionId;
              let worktreePromise = this.pendingWorktrees.get(worktreeKey);
              if (!worktreePromise) {
                worktreePromise = createWorktree({
                  repoId,
                  sessionId,
                  defaultBranch,
                  branch,
                  checkpointSha,
                  sessionGroupId,
                  slug,
                });
                this.pendingWorktrees.set(worktreeKey, worktreePromise);
                worktreePromise.finally(() => this.pendingWorktrees.delete(worktreeKey));
              }
              const { workdir, slug: worktreeSlug } = await worktreePromise;
              this.sessionWorkdirs.set(sessionId, workdir);
              let database: SessionDatabaseInfo;
              try {
                database = await this.ensureManagedDatabase({
                  workdir,
                  repoId,
                  repoRoot: getRepoPath(repoId) ?? workdir,
                });
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                database = createFailedDatabase(message);
                this.setDatabaseState(workdir, database);
              }
              this.send({ type: "register_session", sessionId });
              this.send({
                type: "workspace_ready",
                sessionId,
                workdir,
                slug: worktreeSlug,
                database,
              });
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[container-bridge] workspace failed for ${sessionId}:`, message);
            this.send({ type: "workspace_failed", sessionId, error: message });
          }
        })();
        break;
      }

      case "upgrade_workspace": {
        const { sessionId, sessionGroupId, slug, repoId, repoRemoteUrl, defaultBranch, branch } =
          cmd;

        (async () => {
          try {
            await ensureRepo(repoId, repoRemoteUrl);
            const { workdir, slug: worktreeSlug } = await createWorktree({
              repoId,
              sessionId,
              defaultBranch,
              branch,
              sessionGroupId,
              slug,
            });
            this.sessionWorkdirs.set(sessionId, workdir);
            this.readOnlySessions.delete(sessionId);
            let database: SessionDatabaseInfo;
            try {
              database = await this.ensureManagedDatabase({
                workdir,
                repoId,
                repoRoot: getRepoPath(repoId) ?? workdir,
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              database = createFailedDatabase(message);
              this.setDatabaseState(workdir, database);
            }
            this.send({
              type: "workspace_ready",
              sessionId,
              workdir,
              slug: worktreeSlug,
              database,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[container-bridge] workspace upgrade failed for ${sessionId}:`, message);
            this.send({ type: "workspace_failed", sessionId, error: message });
          }
        })();
        break;
      }

      case "terminate": {
        const adapter = this.adapters.get(cmd.sessionId);
        if (adapter) {
          this.cancelRun(cmd.sessionId);
          adapter.abort();
        }
        break;
      }

      case "pause": {
        const adapter = this.adapters.get(cmd.sessionId);
        if (adapter) {
          this.cancelRun(cmd.sessionId);
          adapter.abort();
        }
        break;
      }

      case "resume": {
        // Nothing to do — adapter reused on next run/send
        break;
      }

      case "database_reset": {
        void this.resetManagedDatabase(cmd.sessionId).then((database) => {
          this.send({
            type: "session_output",
            sessionId: cmd.sessionId,
            data: {
              type: "database_status",
              database,
            },
          });
        });
        break;
      }

      case "delete": {
        const adapter = this.adapters.get(cmd.sessionId);
        if (adapter) {
          this.cancelRun(cmd.sessionId);
          adapter.abort();
          this.adapters.delete(cmd.sessionId);
        }
        this.sessionTools.delete(cmd.sessionId);
        this.reportedToolSessionIds.delete(cmd.sessionId);
        this.pendingInputToolUseIds.delete(cmd.sessionId);
        this.sessionRunSequence.delete(cmd.sessionId);
        const wasReadOnly = this.readOnlySessions.has(cmd.sessionId);
        this.readOnlySessions.delete(cmd.sessionId);
        const workdir = this.sessionWorkdirs.get(cmd.sessionId) ?? cmd.workdir;
        this.sessionWorkdirs.delete(cmd.sessionId);
        this.pendingGitToolUses.delete(cmd.sessionId);
        this.terminalManager.destroyForSession(cmd.sessionId);
        if (workdir && !wasReadOnly) {
          void this.destroyManagedDatabase(workdir);
        }

        // Clean up worktree for this session only — skip for read-only sessions (no worktree to remove)
        if (cmd.workdir && cmd.repoId && !wasReadOnly) {
          removeWorktree(cmd.repoId, cmd.workdir).catch((err: Error) => {
            console.warn(
              `[container-bridge] failed to remove worktree ${cmd.workdir}:`,
              err.message,
            );
          });
        }
        break;
      }

      case "list_branches": {
        const { requestId, repoId } = cmd;
        const repoPath = getRepoPath(repoId);

        if (!repoPath) {
          this.send({ type: "branches_result", requestId, branches: [], error: "Repo not cloned" });
          break;
        }

        execFile(
          "git",
          ["branch", "-a", "--format=%(refname:short)"],
          { cwd: repoPath },
          (err, stdout) => {
            if (err) {
              this.send({ type: "branches_result", requestId, branches: [], error: err.message });
              return;
            }
            this.send({ type: "branches_result", requestId, branches: parseBranchOutput(stdout) });
          },
        );
        break;
      }

      case "list_files": {
        handleListFiles(cmd, this.sessionWorkdirs, (msg) => this.send(msg), {
          gitLsFiles: (cwd, cb) =>
            execFile(
              "git",
              ["ls-files", "--cached", "--others", "--exclude-standard"],
              { cwd, maxBuffer: 5 * 1024 * 1024 },
              (err, stdout) => {
                if (err) return cb(err, []);
                cb(null, stdout.split("\n").filter(Boolean));
              },
            ),
          fs,
          path,
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

      case "list_skills": {
        void handleListSkills(cmd, this.sessionWorkdirs, (msg) => this.send(msg), {
          userSkillsDir: null,
          fs,
          path,
        });
        break;
      }

      case "terminal_create": {
        const { terminalId, sessionId, cols, rows, cwd } = cmd;
        const workdir = cwd || this.sessionWorkdirs.get(sessionId) || os.homedir();
        try {
          this.terminalManager.create(
            terminalId,
            sessionId,
            workdir,
            cols,
            rows,
            this.databaseEnvByWorkdir.get(workdir),
          );
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

  private async runPrompt({
    sessionId,
    prompt,
    cwd,
    tool,
    model,
    interactionMode,
    toolSessionId,
  }: {
    sessionId: string;
    prompt: string;
    cwd: string;
    tool?: string;
    model?: string;
    interactionMode?: string;
    toolSessionId?: string;
  }): Promise<void> {
    const resolvedTool = tool ?? this.defaultTool;
    await ensureToolReady(resolvedTool);

    // If tool changed, abort old adapter and create a fresh one
    const prevTool = this.sessionTools.get(sessionId);
    if (resolvedTool && prevTool && prevTool !== resolvedTool) {
      const oldAdapter = this.adapters.get(sessionId);
      if (oldAdapter) oldAdapter.abort();
      this.adapters.delete(sessionId);
    }

    // Reuse existing adapter for session continuity (--resume)
    let adapter = this.adapters.get(sessionId);
    if (!adapter) {
      adapter = this.createAdapter(resolvedTool);
      this.adapters.set(sessionId, adapter);
      this.send({ type: "register_session", sessionId });
    }
    this.sessionTools.set(sessionId, resolvedTool);

    const priorPendingToolUseId = this.pendingInputToolUseIds.get(sessionId) ?? null;
    let hasForwardedOutput = false;
    let endedOnPending = false;
    const env = this.getDatabaseEnv(sessionId, cwd);

    const runId = this.startRun(sessionId);
    adapter.abort();

    const activeAdapter = adapter;
    adapter.run({
      prompt,
      cwd,
      onOutput: (output) => {
        if (!this.isCurrentRun(sessionId, activeAdapter, runId)) return;

        const maybeReportToolSessionId = () => {
          if (adapter.getSessionId) {
            const sid = adapter.getSessionId();
            if (sid && sid !== this.reportedToolSessionIds.get(sessionId)) {
              this.reportedToolSessionIds.set(sessionId, sid);
              this.send({ type: "tool_session_id", sessionId, toolSessionId: sid });
            }
          }
        };

        const pendingToolUseId = getPendingInputToolUseId(output);
        const isReplayOfPriorPending =
          !hasForwardedOutput &&
          priorPendingToolUseId !== null &&
          pendingToolUseId === priorPendingToolUseId;

        if (isReplayOfPriorPending) {
          maybeReportToolSessionId();
          return;
        }

        hasForwardedOutput = true;
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
          inspectGitCheckpoint(cwd, gitTrigger.trigger, gitTrigger.command)
            .then((checkpoint) => {
              if (!this.isCurrentRun(sessionId, activeAdapter, runId)) return;
              this.send({ type: "git_checkpoint", sessionId, checkpoint });
            })
            .catch((err: Error) => {
              console.warn(
                `[container-bridge] failed to inspect git checkpoint for ${sessionId}:`,
                err.message,
              );
            });
        }
        maybeReportToolSessionId();

        if (isPendingInputOutput(output)) {
          endedOnPending = true;
          if (pendingToolUseId) {
            this.pendingInputToolUseIds.set(sessionId, pendingToolUseId);
          } else {
            this.pendingInputToolUseIds.delete(sessionId);
          }
          this.finishRun(sessionId, runId);
          this.send({ type: "session_complete", sessionId });
          activeAdapter.abort();
        }
      },
      onComplete: () => {
        if (!this.isCurrentRun(sessionId, activeAdapter, runId)) return;
        if (!endedOnPending && priorPendingToolUseId) {
          this.pendingInputToolUseIds.delete(sessionId);
        }
        this.finishRun(sessionId, runId);
        this.send({ type: "session_complete", sessionId });
      },
      interactionMode: interactionMode as "code" | "plan" | "ask" | undefined,
      model,
      toolSessionId,
      env,
    });
  }
}
