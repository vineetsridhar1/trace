import WebSocket from "ws";
import os from "os";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import crypto from "crypto";
import { promisify } from "util";
import type {
  BridgeClient as IBridgeClient,
  BridgeCommand,
  BridgeMessage,
  CodingToolAdapter,
  ToolOutput,
} from "@trace/shared";
import {
  parseBranchOutput,
  handleListFiles,
  handleReadFile,
  handleWriteFile,
  handleCommitFileChanges,
  handleWorktreeChanges,
  handleRevertWorktreeFile,
  handleBranchDiff,
  handleFileAtRef,
  handleListSkills,
  downloadAttachmentsToTempFiles,
  cleanupTempAttachments,
  isMissingToolSessionError,
  inspectSessionCurrentBranch,
  inspectSessionGitSyncStatus,
  BridgeOutbox,
  BRIDGE_PROTOCOL_VERSION,
} from "@trace/shared";
import { buildTraceInvocationEnv } from "@trace/shared/trace-invocation-env";
import { ensureTraceRuntime } from "@trace/shared/trace-runtime";
import { generalWorkspacePath, removeGeneralWorkspace } from "@trace/shared/general-workspace";
import type { GitExecFn } from "@trace/shared";
import {
  AntigravityAdapter,
  ClaudeCodeAdapter,
  CodexAdapter,
  CursorComposerAdapter,
  PiAdapter,
  resolveExecutable,
} from "@trace/shared/adapters";
import {
  ensureRepo,
  createWorktree,
  createAppWorkspace,
  removeAppWorkspace,
  getWorkspaceSlugs,
  removeWorktree,
  getRepoPath,
} from "./workspace.js";
import { ensureToolReady, syncCodexAuthFile } from "./tool-auth.js";
import { TerminalManager } from "@trace/shared/adapters";
import { ManagedProcessManager } from "./managed-process-manager.js";
import { exportPdfToTarget } from "./pdf-export.js";
import { exportSelfContainedHtmlToTarget } from "./self-contained-export.js";
import { materializeDesignSystemPackage } from "./design-system-package.js";
import { prepareReadOnlySourceCheckout } from "./design-system-source.js";
import {
  cleanupPlaywrightInvocationSession,
  createPlaywrightInvocationSession,
  type PlaywrightInvocationSession,
} from "./playwright-session.js";
import { installRuntimeSkillsForCodingTools } from "./runtime-skills.js";

const execFileAsync = promisify(execFile);
const AGENT_VERSION = "0.1.0";
const BRIDGE_USER_AGENT = "Trace-Container-Bridge/0.1";
const RUNTIME_LEASE_CAPABILITY = "runtime_lease_v1";
function hasExecutable(command: string): boolean {
  return resolveExecutable(command) !== null;
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
 * Multi-session container bridge for provisioned runtimes.
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
  private shutdownPromise: Promise<void> | null = null;
  private consecutiveFailures = 0;
  /** Max consecutive connection failures before the process exits, allowing the machine to stop. */
  private static MAX_RECONNECT_FAILURES = 20;
  private sessionWorkdirs = new Map<string, string>();
  /** Coalesces concurrent createWorktree calls for the same worktree key (sessionGroupId or sessionId) */
  private pendingWorktrees = new Map<
    string,
    Promise<{ workdir: string; branch: string; slug: string }>
  >();
  /** Sessions running in read-only mode (no worktree, using bare repo path) */
  private readOnlySessions = new Set<string>();
  private pendingInputToolUseIds = new Map<string, string>();
  private sessionRunSequence = new Map<string, number>();
  private activeRuns = new Map<string, number>();
  private playwrightSessions = new Map<string, PlaywrightInvocationSession>();
  private outbox = new BridgeOutbox();
  private terminalManager: TerminalManager;
  private managedProcessManager: ManagedProcessManager;
  private traceRuntime = ensureTraceRuntime(process.env.TRACE_RUNTIME_DIR ?? "/trace/runtime").then(
    async (runtime) => {
      await installRuntimeSkillsForCodingTools(runtime.skillsDir, os.homedir());
      return runtime;
    },
  );
  private gitExec: GitExecFn = (args, cwd) =>
    new Promise((resolve, reject) => {
      execFile("git", args, { cwd, maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
  constructor(
    private readonly serverUrl: string,
    private readonly token: string,
    private readonly runtimeInstanceId: string,
    private readonly defaultTool: string,
    private readonly runtimeLeaseEnabled: boolean,
    private readonly renewRuntimeLease?: (ttlMs: number) => void,
  ) {
    this.terminalManager = new TerminalManager({
      onOutput: (terminalId, data) => {
        this.send({ type: "terminal_output", terminalId, data });
      },
      onExit: (terminalId, exitCode) => {
        this.send({ type: "terminal_exit", terminalId, exitCode });
      },
    });
    this.managedProcessManager = new ManagedProcessManager(this.sessionWorkdirs, (message) =>
      this.send(message),
    );
  }

  connect(): void {
    this.ws = new WebSocket(this.serverUrl, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        "User-Agent": BRIDGE_USER_AGENT,
      },
    });

    this.ws.on("open", () => {
      console.log("[container-bridge] connected to server");
      this.consecutiveFailures = 0;
      const supportedTools = ["claude_code", "codex"];
      if (hasExecutable("pi")) supportedTools.push("pi");
      if (hasExecutable("agy")) supportedTools.push("antigravity");
      if (hasExecutable("cursor-agent")) supportedTools.push("cursor_composer");
      // Announce as a cloud runtime. Provisioned runtimes clone on demand, so
      // they intentionally register no pre-existing repos.
      this.send({
        type: "runtime_hello",
        instanceId: this.runtimeInstanceId,
        label: this.runtimeInstanceId,
        hostingMode: "cloud",
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        agentVersion: AGENT_VERSION,
        capabilities: this.runtimeLeaseEnabled ? [RUNTIME_LEASE_CAPABILITY] : [],
        supportedTools,
        registeredRepoIds: [],
        activeTerminals: this.terminalManager.getActiveTerminals(),
      });
      this.flushOutbox();

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
    void this.shutdown();
  }

  shutdown(): Promise<void> {
    this.shutdownPromise ??= this.performShutdown();
    return this.shutdownPromise;
  }

  private async performShutdown(): Promise<void> {
    this.stopHeartbeat();
    this.terminalManager.destroyAll();
    this.managedProcessManager.destroyAll();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const [sessionId, adapter] of this.adapters.entries()) {
      this.cancelRun(sessionId);
      adapter.abort();
    }
    const browserCleanup = [...this.playwrightSessions.keys()].map((sessionId) =>
      this.cleanupPlaywrightSession(sessionId),
    );
    this.adapters.clear();
    this.outbox.clear();
    this.ws?.close();
    this.ws = null;
    this.pendingInputToolUseIds.clear();
    await Promise.allSettled(browserCleanup);
  }

  send(data: BridgeMessage): void {
    if (this.sendNow(data)) return;
    if (!this.outbox.enqueue(data)) {
      console.warn(`[container-bridge] dropping bridge message while disconnected: ${data.type}`);
    }
  }

  private sendNow(data: BridgeMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(data));
    return true;
  }

  private flushOutbox(): void {
    const flushed = this.outbox.flush((message) => this.sendNow(message));
    if (flushed > 0) {
      console.log(
        `[container-bridge] flushed ${flushed} queued bridge messages (${this.outbox.size} remaining)`,
      );
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.shutdownPromise) return;
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

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({
        type: "runtime_heartbeat",
        instanceId: this.runtimeInstanceId,
        activeSessionIds: [...this.activeRuns.keys()],
      });
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

  private async preparePlaywrightSession(
    sessionId: string,
    invocationId: string | undefined,
  ): Promise<PlaywrightInvocationSession | null> {
    await this.cleanupPlaywrightSession(sessionId);
    if (!invocationId) return null;

    const session = await createPlaywrightInvocationSession({ invocationId });
    this.playwrightSessions.set(sessionId, session);
    return session;
  }

  private async cleanupPlaywrightSession(
    sessionId: string,
    expected?: PlaywrightInvocationSession | null,
  ): Promise<void> {
    const current = this.playwrightSessions.get(sessionId);
    if (!current || (expected && current !== expected)) return;
    this.playwrightSessions.delete(sessionId);
    await cleanupPlaywrightInvocationSession(current);
  }

  private isCurrentRun(sessionId: string, adapter: CodingToolAdapter, runId: number): boolean {
    return this.adapters.get(sessionId) === adapter && this.activeRuns.get(sessionId) === runId;
  }

  private createAdapter(tool?: string): CodingToolAdapter {
    const resolvedTool = tool ?? this.defaultTool;
    switch (resolvedTool) {
      case "antigravity":
        return new AntigravityAdapter();
      case "pi":
        return new PiAdapter();
      case "codex":
        return new CodexAdapter();
      case "cursor_composer":
        return new CursorComposerAdapter();
      case "claude_code":
      default:
        return new ClaudeCodeAdapter();
    }
  }

  private handleCommand(cmd: BridgeCommand): void {
    switch (cmd.type) {
      case "runtime_lease": {
        this.renewRuntimeLease?.(cmd.ttlMs);
        break;
      }

      case "run":
      case "send": {
        this.runPrompt({
          sessionId: cmd.sessionId,
          prompt: cmd.prompt ?? "",
          appendSystemPrompt: cmd.appendSystemPrompt,
          cwd: cmd.cwd ?? os.homedir(),
          tool: cmd.tool,
          model: cmd.model,
          reasoningEffort: cmd.reasoningEffort,
          enableClaudeInChrome: cmd.enableClaudeInChrome,
          interactionMode: cmd.interactionMode,
          toolSessionId: cmd.toolSessionId,
          imageUrls: cmd.imageUrls,
          runtimeEnv: cmd.runtimeEnv,
        }).catch((err) => {
          console.error(`[container-bridge] runPrompt failed for ${cmd.sessionId}:`, err);
          void this.cleanupPlaywrightSession(cmd.sessionId);
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
          preserveBranchName,
          baseCommitSha,
          readOnly,
        } = cmd;

        (async () => {
          try {
            const repoResult = await ensureRepo(repoId, repoRemoteUrl, branch, defaultBranch);
            this.send({ type: "repo_linked", repoId });

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
                warning: repoResult.warning,
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
                  preserveBranchName,
                  baseCommitSha,
                  sessionGroupId,
                  slug,
                });
                this.pendingWorktrees.set(worktreeKey, worktreePromise);
                void worktreePromise
                  .finally(() => this.pendingWorktrees.delete(worktreeKey))
                  .catch(() => undefined);
              }
              const { workdir, branch: worktreeBranch, slug: worktreeSlug } = await worktreePromise;
              this.sessionWorkdirs.set(sessionId, workdir);
              this.send({ type: "register_session", sessionId });
              this.send({
                type: "workspace_ready",
                sessionId,
                workdir,
                branch: worktreeBranch,
                slug: worktreeSlug,
                warning: repoResult.warning,
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

      case "prepare_general": {
        const workdir = generalWorkspacePath(cmd.sessionGroupId ?? cmd.sessionId);
        fs.promises
          .mkdir(workdir, { recursive: true })
          .then(() => {
            this.sessionWorkdirs.set(cmd.sessionId, workdir);
            this.send({ type: "register_session", sessionId: cmd.sessionId });
            this.send({ type: "workspace_ready", sessionId: cmd.sessionId, workdir });
          })
          .catch((err: Error) => {
            this.send({ type: "workspace_failed", sessionId: cmd.sessionId, error: err.message });
          });
        break;
      }

      case "cleanup_general_workspace": {
        const sessionKey = cmd.sessionGroupId ?? cmd.sessionId;
        const workdir = this.sessionWorkdirs.get(cmd.sessionId);
        void removeGeneralWorkspace(workdir, sessionKey)
          .then((removed) => {
            if (removed && workdir) {
              for (const [trackedSessionId, trackedWorkdir] of this.sessionWorkdirs) {
                if (trackedWorkdir === workdir) this.sessionWorkdirs.delete(trackedSessionId);
              }
            }
            this.send({
              type: "cleanup_general_workspace_result",
              sessionId: cmd.sessionId,
              success: removed,
              ...(!removed ? { error: "General workspace path was rejected" } : {}),
            });
          })
          .catch((err: Error) => {
            console.warn(
              `[container-bridge] failed to remove general workspace ${workdir}:`,
              err.message,
            );
            this.send({
              type: "cleanup_general_workspace_result",
              sessionId: cmd.sessionId,
              success: false,
              error: err.message,
            });
          });
        break;
      }

      case "list_workspace_slugs": {
        getWorkspaceSlugs(cmd.repoId)
          .then((slugs) => {
            this.send({
              type: "workspace_slugs_result",
              requestId: cmd.requestId,
              slugs: [...slugs],
            });
          })
          .catch((err: Error) => {
            this.send({
              type: "workspace_slugs_result",
              requestId: cmd.requestId,
              slugs: [],
              error: err.message,
            });
          });
        break;
      }

      case "prepare_app": {
        const {
          sessionId,
          sessionGroupId,
          sessionGroupKind,
          slug,
          repoRemoteUrl,
          defaultBranch,
          baseCommitSha,
          designSystemPackage,
          sourceRepository,
        } = cmd;
        const previousWorkdir = this.sessionWorkdirs.get(sessionId);
        (async () => {
          try {
            const { workdir, slug: workspaceSlug } = await createAppWorkspace({
              sessionId,
              sessionGroupId,
              slug,
              repoRemoteUrl,
              defaultBranch,
              baseCommitSha,
              sessionGroupKind,
            });
            if (sessionGroupKind === "design" && designSystemPackage) {
              await materializeDesignSystemPackage(workdir, designSystemPackage);
            }
            let sourceWorkdir: string | undefined;
            let sourceCommitSha: string | undefined;
            if (sessionGroupKind === "design_system") {
              if (!sessionGroupId || !sourceRepository)
                throw new Error("Design-system source descriptor is unavailable");
              const source = await prepareReadOnlySourceCheckout(sessionGroupId, sourceRepository);
              sourceWorkdir = source.sourceWorkdir;
              sourceCommitSha = source.commitSha;
              await fs.promises.mkdir(path.join(workdir, ".trace"), { recursive: true });
              const sourceMetadataPath = path.join(workdir, ".trace", "source-workdir");
              await fs.promises.chmod(sourceMetadataPath, 0o600).catch(() => undefined);
              await fs.promises.writeFile(
                sourceMetadataPath,
                `${source.sourceWorkdir}\n${source.commitSha}\n`,
                { mode: 0o444 },
              );
            }
            this.sessionWorkdirs.set(sessionId, workdir);
            this.send({ type: "register_session", sessionId });
            this.send({
              type: "workspace_ready",
              sessionId,
              workdir,
              slug: workspaceSlug,
              ...(sourceWorkdir ? { sourceWorkdir } : {}),
              ...(sourceCommitSha ? { sourceCommitSha } : {}),
            });
            try {
              await removeGeneralWorkspace(previousWorkdir, sessionGroupId ?? sessionId);
            } catch (error) {
              console.warn(
                `[container-bridge] failed to remove converted general workspace ${previousWorkdir}:`,
                error instanceof Error ? error.message : String(error),
              );
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[container-bridge] app workspace failed for ${sessionId}:`, message);
            this.send({ type: "workspace_failed", sessionId, error: message });
          }
        })();
        break;
      }

      case "upgrade_workspace": {
        const {
          sessionId,
          sessionGroupId,
          slug,
          repoId,
          repoRemoteUrl,
          defaultBranch,
          branch,
          preserveBranchName,
        } = cmd;
        const previousWorkdir = this.sessionWorkdirs.get(sessionId);

        (async () => {
          try {
            const repoResult = await ensureRepo(repoId, repoRemoteUrl, branch, defaultBranch);
            this.send({ type: "repo_linked", repoId });
            const {
              workdir,
              branch: worktreeBranch,
              slug: worktreeSlug,
            } = await createWorktree({
              repoId,
              sessionId,
              defaultBranch,
              branch,
              preserveBranchName,
              sessionGroupId,
              slug,
            });
            this.sessionWorkdirs.set(sessionId, workdir);
            this.readOnlySessions.delete(sessionId);
            this.send({
              type: "workspace_ready",
              sessionId,
              workdir,
              branch: worktreeBranch,
              slug: worktreeSlug,
              warning: repoResult.warning,
            });
            const sessionKey = sessionGroupId ?? sessionId;
            try {
              const removed = await removeGeneralWorkspace(previousWorkdir, sessionKey);
              if (removed && previousWorkdir) {
                for (const [trackedSessionId, trackedWorkdir] of this.sessionWorkdirs) {
                  if (trackedWorkdir === previousWorkdir) {
                    this.sessionWorkdirs.delete(trackedSessionId);
                  }
                }
              }
            } catch (error) {
              console.warn(
                `[container-bridge] failed to remove upgraded general workspace ${previousWorkdir}:`,
                error instanceof Error ? error.message : String(error),
              );
            }
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
        void this.cleanupPlaywrightSession(cmd.sessionId);
        break;
      }

      case "pause": {
        const adapter = this.adapters.get(cmd.sessionId);
        if (adapter) {
          this.cancelRun(cmd.sessionId);
          adapter.abort();
        }
        void this.cleanupPlaywrightSession(cmd.sessionId);
        break;
      }

      case "resume": {
        // Nothing to do — adapter reused on next run/send
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
        void this.cleanupPlaywrightSession(cmd.sessionId);
        const wasReadOnly = this.readOnlySessions.has(cmd.sessionId);
        this.readOnlySessions.delete(cmd.sessionId);
        // Capture the workdir before dropping it from the map — the app
        // workspace lives at this path (a slug dir under WORKSPACES_DIR).
        const appWorkdir =
          (typeof cmd.workdir === "string" ? cmd.workdir : null) ??
          this.sessionWorkdirs.get(cmd.sessionId) ??
          null;
        this.sessionWorkdirs.delete(cmd.sessionId);
        this.terminalManager.destroyForSession(cmd.sessionId);

        // App sessions run managed dev-server processes (keyed by
        // sessionGroupId) and a standalone workspace at the slug directory.
        // Stop the processes and remove the workspace so a deleted app doesn't
        // leak a running server or disk. removeAppWorkspace only removes a
        // direct child of WORKSPACES_DIR, so it is a safe no-op for worktree
        // sessions whose workdir lives elsewhere.
        if (cmd.sessionGroupId) {
          this.managedProcessManager.destroyForSessionGroup(cmd.sessionGroupId);
        }
        if (appWorkdir) {
          removeAppWorkspace(appWorkdir).catch((err: unknown) => {
            console.warn(
              `[container-bridge] failed to remove app workspace ${appWorkdir}:`,
              err instanceof Error ? err.message : String(err),
            );
          });
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

      case "setup_script_run": {
        this.managedProcessManager.runSetupScript({
          requestId: cmd.requestId,
          sessionId: cmd.sessionId,
          command: cmd.command,
          cwd: cmd.cwd,
          env: cmd.env,
        });
        break;
      }

      case "app_process_start": {
        this.managedProcessManager.start({
          requestId: cmd.requestId,
          processInstanceId: cmd.processInstanceId,
          sessionGroupId: cmd.sessionGroupId,
          sessionId: cmd.sessionId,
          command: cmd.command,
          cwd: cmd.cwd,
          env: cmd.env,
          ports: cmd.ports.map((port) => port.port),
        });
        break;
      }

      case "app_process_stop": {
        this.managedProcessManager.stop(cmd.processInstanceId);
        break;
      }

      case "pdf_export": {
        const workdir = this.sessionWorkdirs.get(cmd.sessionId);
        if (!workdir) {
          this.send({
            type: "pdf_export_result",
            requestId: cmd.requestId,
            sessionGroupId: cmd.sessionGroupId,
            commitSha: cmd.commitSha,
            storageKey: cmd.storageKey,
            error: "PDF workspace is unavailable",
          });
          break;
        }
        void exportPdfToTarget({ ...cmd, workdir })
          .then(() => {
            this.send({
              type: "pdf_export_result",
              requestId: cmd.requestId,
              sessionGroupId: cmd.sessionGroupId,
              commitSha: cmd.commitSha,
              storageKey: cmd.storageKey,
            });
          })
          .catch((error: unknown) => {
            this.send({
              type: "pdf_export_result",
              requestId: cmd.requestId,
              sessionGroupId: cmd.sessionGroupId,
              commitSha: cmd.commitSha,
              storageKey: cmd.storageKey,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        break;
      }

      case "animation_export": {
        const workdir = this.sessionWorkdirs.get(cmd.sessionId);
        if (!workdir) {
          this.send({
            type: "animation_export_result",
            requestId: cmd.requestId,
            sessionGroupId: cmd.sessionGroupId,
            commitSha: cmd.commitSha,
            storageKey: cmd.storageKey,
            error: "Animation workspace is unavailable",
          });
          break;
        }
        void exportSelfContainedHtmlToTarget({ ...cmd, workdir })
          .then(() => {
            this.send({
              type: "animation_export_result",
              requestId: cmd.requestId,
              sessionGroupId: cmd.sessionGroupId,
              commitSha: cmd.commitSha,
              storageKey: cmd.storageKey,
            });
          })
          .catch((error: unknown) => {
            this.send({
              type: "animation_export_result",
              requestId: cmd.requestId,
              sessionGroupId: cmd.sessionGroupId,
              commitSha: cmd.commitSha,
              storageKey: cmd.storageKey,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        break;
      }

      case "design_system_export": {
        const workdir = this.sessionWorkdirs.get(cmd.sessionId);
        if (!workdir) {
          this.send({
            type: "design_system_export_result",
            requestId: cmd.requestId,
            sessionGroupId: cmd.sessionGroupId,
            commitSha: cmd.commitSha,
            storageKey: cmd.storageKey,
            error: "Design-system workspace is unavailable",
          });
          break;
        }
        void exportSelfContainedHtmlToTarget({ ...cmd, workdir })
          .then(() => {
            this.send({
              type: "design_system_export_result",
              requestId: cmd.requestId,
              sessionGroupId: cmd.sessionGroupId,
              commitSha: cmd.commitSha,
              storageKey: cmd.storageKey,
            });
          })
          .catch((error: unknown) => {
            this.send({
              type: "design_system_export_result",
              requestId: cmd.requestId,
              sessionGroupId: cmd.sessionGroupId,
              commitSha: cmd.commitSha,
              storageKey: cmd.storageKey,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        break;
      }

      case "endpoint_http_request": {
        this.managedProcessManager.proxyHttp({
          requestId: cmd.requestId,
          port: cmd.port,
          method: cmd.method,
          path: cmd.path,
          headers: cmd.headers,
          bodyBase64: cmd.bodyBase64,
        });
        break;
      }

      case "endpoint_ws_open": {
        this.managedProcessManager.openWebSocket({
          requestId: cmd.requestId,
          port: cmd.port,
          path: cmd.path,
          headers: cmd.headers,
          protocols: cmd.protocols,
        });
        break;
      }

      case "endpoint_ws_data": {
        this.managedProcessManager.sendWebSocketData(
          cmd.requestId,
          cmd.dataBase64,
          cmd.isBinary ?? true,
        );
        break;
      }

      case "endpoint_ws_close": {
        this.managedProcessManager.closeWebSocket(cmd.requestId, cmd.code, cmd.reason);
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

      case "session_current_branch": {
        const workdir = this.sessionWorkdirs.get(cmd.sessionId) ?? cmd.workdirHint;
        if (!workdir) {
          this.send({
            type: "session_current_branch_result",
            requestId: cmd.requestId,
            error: "Session workdir is unavailable",
          });
          break;
        }
        void inspectSessionCurrentBranch((args, options) =>
          execFileAsync("git", args, {
            cwd: workdir,
            maxBuffer: options?.maxBuffer,
            timeout: options?.timeoutMs,
          }).then(({ stdout }) => String(stdout)),
        )
          .then((branch) => {
            this.send({
              type: "session_current_branch_result",
              requestId: cmd.requestId,
              branch,
            });
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            this.send({
              type: "session_current_branch_result",
              requestId: cmd.requestId,
              error: message,
            });
          });
        break;
      }
      case "session_git_sync_status": {
        const workdir = this.sessionWorkdirs.get(cmd.sessionId) ?? cmd.workdirHint;
        if (!workdir) {
          this.send({
            type: "session_git_sync_status_result",
            requestId: cmd.requestId,
            error: "Session workdir is unavailable",
          });
          break;
        }
        void inspectSessionGitSyncStatus((args, options) =>
          execFileAsync("git", args, {
            cwd: workdir,
            maxBuffer: options?.maxBuffer,
            timeout: options?.timeoutMs,
          }).then(({ stdout }) => String(stdout)),
        )
          .then((status) => {
            this.send({
              type: "session_git_sync_status_result",
              requestId: cmd.requestId,
              status,
            });
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            this.send({
              type: "session_git_sync_status_result",
              requestId: cmd.requestId,
              error: message,
            });
          });
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

      case "write_file":
      case "write_file_guarded": {
        handleWriteFile(cmd, this.sessionWorkdirs, (msg) => this.send(msg), { fs, path });
        break;
      }

      case "commit_file_changes":
      case "commit_scoped_file_changes": {
        void handleCommitFileChanges(cmd, this.sessionWorkdirs, (msg) => this.send(msg), {
          fs,
          path,
          gitExec: this.gitExec,
        });
        break;
      }

      case "worktree_changes": {
        void handleWorktreeChanges(cmd, this.sessionWorkdirs, (msg) => this.send(msg), {
          fs,
          path,
          gitExec: this.gitExec,
        });
        break;
      }

      case "revert_worktree_file": {
        void handleRevertWorktreeFile(cmd, this.sessionWorkdirs, (msg) => this.send(msg), {
          fs,
          path,
          gitExec: this.gitExec,
        });
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
        const { terminalId, sessionId, ownerUserId, cols, rows, cwd } = cmd;
        const workdir = cwd || this.sessionWorkdirs.get(sessionId) || os.homedir();
        try {
          this.terminalManager.create(terminalId, sessionId, ownerUserId, workdir, cols, rows);
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
    appendSystemPrompt,
    cwd,
    tool,
    model,
    reasoningEffort,
    enableClaudeInChrome,
    interactionMode,
    toolSessionId,
    imageUrls,
    runtimeEnv,
  }: {
    sessionId: string;
    prompt: string;
    appendSystemPrompt?: string;
    cwd: string;
    tool?: string;
    model?: string;
    reasoningEffort?: string;
    enableClaudeInChrome?: boolean;
    interactionMode?: string;
    toolSessionId?: string;
    imageUrls?: string[];
    runtimeEnv?: Record<string, string>;
  }): Promise<void> {
    const resolvedTool = tool ?? this.defaultTool;
    await ensureToolReady(resolvedTool);
    const traceRuntime = await this.traceRuntime;
    const playwrightSession = await this.preparePlaywrightSession(
      sessionId,
      runtimeEnv?.TRACE_INVOCATION_ID,
    );
    const invocationEnv = buildTraceInvocationEnv({
      runtimeEnv: { ...runtimeEnv, ...playwrightSession?.env },
      serverUrl: this.serverUrl,
      skillsDir: traceRuntime.skillsDir,
      binDir: traceRuntime.binDir,
      nodeBinary: process.execPath,
      basePath: process.env.PATH,
    });

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
    let recoveringMissingToolSession = false;

    // Download attached files to temp files
    let imagePaths: string[] | undefined;
    if (imageUrls?.length) {
      try {
        imagePaths = await downloadAttachmentsToTempFiles(imageUrls, {
          fs,
          path,
          tmpdir: os.tmpdir,
          randomUUID: crypto.randomUUID,
        });
      } catch (err) {
        console.error(`[container-bridge] Failed to download files for ${sessionId}:`, err);
      }
    }

    // Prepend file paths to the prompt so all adapters see them, then append
    // the system suffix last. The refs line must build on finalPrompt (not the
    // original prompt) or the appended instruction is lost whenever an image is
    // attached — the dominant "make it look like this screenshot" flow.
    let finalPrompt = prompt;
    if (imagePaths?.length) {
      const refs = imagePaths.map((p) => `[Attached file: ${p}]`).join("\n");
      finalPrompt = `${refs}\n\n${finalPrompt}`;
    }
    if (appendSystemPrompt) finalPrompt = `${finalPrompt}\n\n${appendSystemPrompt}`;

    // Single owner of temp-image lifetime so we don't leak files when the
    // adapter ends via the pending-input branch (which doesn't always fire
    // onComplete).
    let imagesCleanedUp = false;
    const cleanupImages = () => {
      if (imagePaths && !imagesCleanedUp) {
        imagesCleanedUp = true;
        cleanupTempAttachments(imagePaths, fs);
      }
    };

    const runId = this.startRun(sessionId);
    adapter.abort();

    let browserCleanupStarted = false;
    const completeRun = () => {
      const complete = () => this.send({ type: "session_complete", sessionId });
      if (resolvedTool !== "codex") {
        complete();
        return;
      }
      void syncCodexAuthFile().then(complete, (error: unknown) => {
        console.warn("[container-bridge] failed to persist Codex session credential:", error);
        complete();
      });
    };
    const completeRunAfterBrowserCleanup = () => {
      if (browserCleanupStarted) return;
      browserCleanupStarted = true;
      void this.cleanupPlaywrightSession(sessionId, playwrightSession).then(
        completeRun,
        (error: unknown) => {
          console.warn("[container-bridge] failed to clean Playwright session:", error);
          completeRun();
        },
      );
    };

    const activeAdapter = adapter;
    const recoverMissingToolSession = (message: string) => {
      if (!toolSessionId || hasForwardedOutput || recoveringMissingToolSession) return false;
      if (!isMissingToolSessionError(message)) return false;

      recoveringMissingToolSession = true;
      this.finishRun(sessionId, runId);
      activeAdapter.abort();
      this.adapters.delete(sessionId);
      this.reportedToolSessionIds.delete(sessionId);
      this.pendingInputToolUseIds.delete(sessionId);
      cleanupImages();
      void this.cleanupPlaywrightSession(sessionId, playwrightSession);
      this.send({
        type: "tool_session_missing",
        sessionId,
        toolSessionId,
        message,
        interactionMode,
        imageUrls,
      });
      return true;
    };

    adapter.run({
      prompt: finalPrompt,
      cwd,
      onOutput: (output) => {
        if (!this.isCurrentRun(sessionId, activeAdapter, runId)) return;

        if (output.type === "error" && recoverMissingToolSession(output.message)) {
          return;
        }

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

        maybeReportToolSessionId();

        if (isPendingInputOutput(output)) {
          endedOnPending = true;
          if (pendingToolUseId) {
            this.pendingInputToolUseIds.set(sessionId, pendingToolUseId);
          } else {
            this.pendingInputToolUseIds.delete(sessionId);
          }
          this.finishRun(sessionId, runId);
          completeRunAfterBrowserCleanup();
          activeAdapter.abort();
          cleanupImages();
        }
      },
      onComplete: () => {
        if (!this.isCurrentRun(sessionId, activeAdapter, runId)) return;
        if (recoveringMissingToolSession) return;
        if (!endedOnPending && priorPendingToolUseId) {
          this.pendingInputToolUseIds.delete(sessionId);
        }
        this.finishRun(sessionId, runId);
        completeRunAfterBrowserCleanup();
        cleanupImages();
      },
      interactionMode: interactionMode as "code" | "plan" | "ask" | undefined,
      model,
      reasoningEffort,
      enableClaudeInChrome,
      toolSessionId,
      runtimeEnv: invocationEnv,
    });
  }
}
