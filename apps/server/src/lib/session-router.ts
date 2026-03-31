import type WebSocket from "ws";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import type { CloudMachineService } from "./cloud-machine-service.js";
import type { BridgeTerminalCreateCommand, BridgeTerminalInputCommand, BridgeTerminalResizeCommand, BridgeTerminalDestroyCommand, BridgeListFilesCommand, BridgeReadFileCommand, BridgeBranchDiffCommand, BridgeFileAtRefCommand, BridgeBranchDiffFile } from "@trace/shared";
import { prisma } from "./db.js";
import { apiTokenService } from "../services/api-token.js";
import { runtimeDebug } from "./runtime-debug.js";

interface BaseSessionCommand {
  type: "run" | "terminate" | "pause" | "resume" | "send" | "prepare" | "delete" | "list_branches" | "upgrade_workspace";
  sessionId: string;
  prompt?: string;
  [key: string]: unknown;
}

export type SessionCommand =
  | BaseSessionCommand
  | BridgeListFilesCommand
  | BridgeReadFileCommand
  | BridgeBranchDiffCommand
  | BridgeFileAtRefCommand
  | BridgeTerminalCreateCommand
  | BridgeTerminalInputCommand
  | BridgeTerminalResizeCommand
  | BridgeTerminalDestroyCommand;

export type DeliveryResult =
  | "delivered"
  | "no_runtime"
  | "runtime_disconnected"
  | "session_unbound"
  | "delivery_failed";

export interface RuntimeInstance {
  id: string;
  label: string;
  ws: WebSocket;
  hostingMode: "cloud" | "local";
  supportedTools: string[];
  /** Repo IDs this runtime has locally registered. Cloud runtimes use empty (supports all). */
  registeredRepoIds: string[];
  lastHeartbeat: number;
  boundSessions: Set<string>;
}

// --- SessionAdapter interface ---
// Each hosting mode implements this. The router dispatches through it.

export interface SessionAdapterCreateOptions {
  sessionId: string;
  /** Session group ID — used to key worktrees so all sessions in a group share the same workspace. */
  sessionGroupId?: string;
  /** Animal slug for the worktree. If set, reuses the existing slug. */
  slug?: string;
  tool: string;
  model?: string;
  repo?: { id: string; name: string; remoteUrl: string; defaultBranch: string } | null;
  branch?: string;
  checkpointSha?: string;
  createdById: string;
  organizationId: string;
  readOnly?: boolean;
}

export interface SessionAdapterDestroyOptions {
  sessionId: string;
  workdir?: string | null;
  repoId?: string | null;
  connection?: unknown;
}

interface SessionAdapterCreateCtx {
  send: (cmd: SessionCommand) => DeliveryResult;
  onFailed: (error: string) => void;
  onWorkspaceReady: (workdir: string) => void;
  waitForBridge: (sessionId: string, timeoutMs?: number, runtimeId?: string) => Promise<void>;
}

interface SessionAdapter {
  create(options: SessionAdapterCreateOptions, ctx: SessionAdapterCreateCtx): void;
  destroy(options: SessionAdapterDestroyOptions, ctx: { send: (cmd: SessionCommand) => DeliveryResult }): Promise<void>;
  transition(sessionId: string, command: "pause" | "resume" | "terminate", ctx: { send: (cmd: SessionCommand) => DeliveryResult; waitForBridge: (sessionId: string, timeoutMs?: number, runtimeId?: string) => Promise<void> }): Promise<DeliveryResult>;
}

// --- Cloud adapter factory ---

function createCloudAdapter(cloudMachineService: CloudMachineService): SessionAdapter {
  return {
    create(options, ctx) {
      apiTokenService.getDecryptedTokens(options.createdById).then(async (userTokens) => {
        try {
          const machine = await cloudMachineService.getOrCreateMachine({
            userId: options.createdById,
            orgId: options.organizationId,
            defaultTool: options.tool,
            userTokens,
          });

          // Store cloudMachineId and runtimeInstanceId in session connection
          const updatedSession = await prisma.session.update({
            where: { id: options.sessionId },
            data: {
              connection: {
                state: "connected",
                retryCount: 0,
                canRetry: true,
                canMove: true,
                cloudMachineId: machine.id,
                runtimeInstanceId: machine.runtimeInstanceId,
              } satisfies Prisma.InputJsonValue,
            },
            select: { sessionGroupId: true, connection: true },
          });
          if (updatedSession.sessionGroupId) {
            await prisma.sessionGroup.update({
              where: { id: updatedSession.sessionGroupId },
              data: {
                connection: updatedSession.connection ?? Prisma.DbNull,
                worktreeDeleted: false,
              },
            });
          }

          // Wait for bridge to connect. Pass runtimeId so if the bridge already
          // connected (race: restoreSessionsForRuntime ran before we wrote connection),
          // we immediately bind and proceed.
          await ctx.waitForBridge(options.sessionId, 120_000, machine.runtimeInstanceId);

          // Send prepare if there's a repo to set up
          if (options.repo) {
            ctx.send({
              type: "prepare",
              sessionId: options.sessionId,
              sessionGroupId: options.sessionGroupId,
              slug: options.slug,
              repoId: options.repo.id,
              repoName: options.repo.name,
              repoRemoteUrl: options.repo.remoteUrl,
              defaultBranch: options.repo.defaultBranch,
              branch: options.branch,
              checkpointSha: options.checkpointSha,
              readOnly: options.readOnly,
            });
          } else {
            // No repo — signal workspace_ready with home directory so session transitions to pending
            // Must match USER in apps/container-bridge/Dockerfile (currently "coder")
            ctx.onWorkspaceReady("/home/coder");
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[cloud-adapter] failed to provision for ${options.sessionId}:`, message);
          ctx.onFailed(`Cloud machine failed: ${message}`);
        }
      });
    },

    async destroy(options, ctx) {
      // Send delete to bridge — cleans up worktree + adapter for this session only
      ctx.send({ type: "delete", sessionId: options.sessionId, workdir: options.workdir, repoId: options.repoId });

      // Notify cloud machine service that a session ended (schedules idle check)
      const conn = options.connection as Record<string, unknown> | null;
      const cloudMachineId = conn?.cloudMachineId as string | undefined;
      if (cloudMachineId) {
        await cloudMachineService.sessionEnded(cloudMachineId).catch((err: Error) => {
          console.warn(`[cloud-adapter] sessionEnded failed for machine ${cloudMachineId}:`, err.message);
        });
      }
    },

    async transition(sessionId, command, ctx) {
      switch (command) {
        case "pause":
        case "terminate":
          // Send command to bridge for this session only — don't stop/destroy the machine
          ctx.send({ type: command, sessionId });
          break;
        case "resume": {
          // Look up machine from session connection — restart if stopped
          const session = await prisma.session.findUnique({
            where: { id: sessionId },
            select: { connection: true, createdById: true, organizationId: true, tool: true },
          });
          const conn = session?.connection as Record<string, unknown> | null;
          const cloudMachineId = conn?.cloudMachineId as string | undefined;

          if (cloudMachineId && session) {
            const userTokens = await apiTokenService.getDecryptedTokens(session.createdById);
            // getOrCreateMachine handles stopped→restart transparently
            await cloudMachineService.getOrCreateMachine({
              userId: session.createdById,
              orgId: session.organizationId,
              defaultTool: session.tool,
              userTokens,
            });
            const runtimeId = conn?.runtimeInstanceId as string | undefined;
            await ctx.waitForBridge(sessionId, 120_000, runtimeId);
          }
          ctx.send({ type: "resume", sessionId });
          break;
        }
      }
      return "delivered";
    },
  };
}

// --- Local adapter (Electron bridge via WebSocket) ---

const localAdapter: SessionAdapter = {
  create(options, ctx) {
    if (!options.repo) return;
    const result = ctx.send({
      type: "prepare",
      sessionId: options.sessionId,
      sessionGroupId: options.sessionGroupId,
      slug: options.slug,
      repoId: options.repo.id,
      repoName: options.repo.name,
      repoRemoteUrl: options.repo.remoteUrl,
      defaultBranch: options.repo.defaultBranch,
      branch: options.branch,
      checkpointSha: options.checkpointSha,
      readOnly: options.readOnly,
    });
    if (result !== "delivered") {
      ctx.onFailed(`prepare: ${result}`);
    }
  },

  async destroy(options, ctx) {
    const result = ctx.send({ type: "delete", sessionId: options.sessionId, workdir: options.workdir, repoId: options.repoId });
    if (result !== "delivered") {
      console.warn(`[local-adapter] bridge did not receive delete for ${options.sessionId}: ${result}`);
    }
  },

  async transition(sessionId, command, ctx) {
    return ctx.send({ type: command, sessionId });
  },
};

/**
 * Runtime-aware registry that tracks runtime instances, their capabilities,
 * and which sessions they own. Replaces the old bridge-only socket map.
 */
export class SessionRouter {
  private runtimes = new Map<string, RuntimeInstance>();
  /** Maps sessionId → runtimeId */
  private sessionRuntime = new Map<string, string>();
  /** Pending waitForBridge promises for cloud sessions */
  private pendingWaits = new Map<string, { resolve: () => void; reject: (err: Error) => void }>();
  /** Pending branch list requests: requestId → resolve/reject */
  private pendingBranchRequests = new Map<string, { resolve: (branches: string[]) => void; reject: (err: Error) => void }>();
  /** Pending file list requests: requestId → resolve/reject */
  private pendingFileRequests = new Map<string, { resolve: (files: string[]) => void; reject: (err: Error) => void }>();
  /** Pending file content requests: requestId → resolve/reject */
  private pendingFileContentRequests = new Map<string, { resolve: (content: string) => void; reject: (err: Error) => void }>();
  /** Pending branch diff requests: requestId → resolve/reject */
  private pendingBranchDiffRequests = new Map<string, { resolve: (files: BridgeBranchDiffFile[]) => void; reject: (err: Error) => void }>();
  /** Pending file-at-ref requests: requestId → resolve/reject */
  private pendingFileAtRefRequests = new Map<string, { resolve: (content: string) => void; reject: (err: Error) => void }>();

  /** Cloud adapter instance, initialized once CloudMachineService is available */
  private cloudAdapter: SessionAdapter | null = null;

  /** Heartbeat timeout in ms — if no heartbeat in this window, runtime is considered stale */
  static HEARTBEAT_TIMEOUT_MS = 30_000;

  /** Inject the CloudMachineService to create the cloud adapter. Call once at startup. */
  setCloudMachineService(service: CloudMachineService): void {
    this.cloudAdapter = createCloudAdapter(service);
  }

  registerRuntime(runtime: {
    id: string;
    label: string;
    ws: WebSocket;
    hostingMode: "cloud" | "local";
    supportedTools: string[];
    registeredRepoIds?: string[];
  }) {
    const existing = this.runtimes.get(runtime.id);
    const boundSessions = existing?.boundSessions ?? new Set<string>();
    if (existing && existing.ws !== runtime.ws) {
      runtimeDebug("replacing runtime websocket", {
        runtimeId: runtime.id,
        previousLabel: existing.label,
        previousReadyState: existing.ws.readyState,
        preservedBoundSessions: [...boundSessions],
      });
    }
    this.runtimes.set(runtime.id, {
      ...runtime,
      registeredRepoIds: runtime.registeredRepoIds ?? existing?.registeredRepoIds ?? [],
      lastHeartbeat: Date.now(),
      boundSessions,
    });
    runtimeDebug("registered runtime", {
      runtimeId: runtime.id,
      label: runtime.label,
      hostingMode: runtime.hostingMode,
      supportedTools: runtime.supportedTools,
      registeredRepoIds: runtime.registeredRepoIds ?? [],
      totalRuntimes: this.runtimes.size,
      runtimeIds: [...this.runtimes.keys()],
    });
  }

  recordHeartbeat(runtimeId: string, ws?: WebSocket): boolean {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) return false;
    if (ws && runtime.ws !== ws) {
      runtimeDebug("ignored heartbeat from stale websocket", {
        runtimeId,
        activeReadyState: runtime.ws.readyState,
        staleReadyState: ws.readyState,
      });
      return false;
    }
    runtime.lastHeartbeat = Date.now();
    return true;
  }

  /** Add a newly linked repo to a runtime's registeredRepoIds (called when bridge sends repo_linked). */
  addRegisteredRepo(runtimeId: string, repoId: string, ws?: WebSocket): void {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      runtimeDebug("repo_linked ignored for missing runtime", { runtimeId, repoId });
      return;
    }
    if (ws && runtime.ws !== ws) {
      runtimeDebug("repo_linked ignored for stale websocket", { runtimeId, repoId });
      return;
    }
    if (!runtime.registeredRepoIds.includes(repoId)) {
      runtime.registeredRepoIds.push(repoId);
      runtimeDebug("registered repo on runtime", {
        runtimeId,
        repoId,
        registeredRepoIds: runtime.registeredRepoIds,
      });
      return;
    }
    runtimeDebug("repo already registered on runtime", { runtimeId, repoId });
  }

  /**
   * Wait for a bridge/runtime to register for the given session.
   * Used by cloud sessions where there's a timing gap between
   * Machine creation and bridge connection.
   *
   * If runtimeId is provided and that runtime is already connected,
   * immediately binds the session (handles race where the runtime
   * connected before the session's connection data was written to DB).
   */
  waitForBridge(sessionId: string, timeoutMs = 60_000, runtimeId?: string): Promise<void> {
    // Already bound
    if (this.sessionRuntime.has(sessionId)) return Promise.resolve();

    // If runtime is already connected, bind immediately (fixes race condition)
    if (runtimeId) {
      const runtime = this.runtimes.get(runtimeId);
      if (runtime && runtime.ws.readyState === runtime.ws.OPEN) {
        this.bindSession(sessionId, runtimeId);
        return Promise.resolve();
      }
    }

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingWaits.delete(sessionId);
        reject(new Error(`Bridge for session ${sessionId} did not connect within ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingWaits.set(sessionId, {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  /**
   * Unregister a runtime and return the session IDs that were bound to it.
   */
  unregisterRuntime(runtimeId: string, ws?: WebSocket): string[] {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) return [];
    if (ws && runtime.ws !== ws) {
      runtimeDebug("skipped runtime unregister for stale websocket", {
        runtimeId,
        activeLabel: runtime.label,
        activeReadyState: runtime.ws.readyState,
        staleReadyState: ws.readyState,
      });
      return [];
    }
    const affectedSessions = [...runtime.boundSessions];
    for (const sessionId of affectedSessions) {
      this.sessionRuntime.delete(sessionId);
    }
    this.runtimes.delete(runtimeId);
    runtimeDebug("unregistered runtime", {
      runtimeId,
      label: runtime.label,
      affectedSessions,
      totalRuntimes: this.runtimes.size,
      remainingRuntimeIds: [...this.runtimes.keys()],
    });
    return affectedSessions;
  }

  bindSession(sessionId: string, runtimeId: string) {
    const previousRuntimeId = this.sessionRuntime.get(sessionId);
    if (previousRuntimeId && previousRuntimeId !== runtimeId) {
      const previousRuntime = this.runtimes.get(previousRuntimeId);
      previousRuntime?.boundSessions.delete(sessionId);
    }
    this.sessionRuntime.set(sessionId, runtimeId);
    const runtime = this.runtimes.get(runtimeId);
    if (runtime) {
      runtime.boundSessions.add(sessionId);
    }
    runtimeDebug("bound session to runtime", {
      sessionId,
      runtimeId,
      previousRuntimeId,
      boundSessions: runtime ? [...runtime.boundSessions] : [],
    });

    // Resolve any pending waitForBridge promise
    const pending = this.pendingWaits.get(sessionId);
    if (pending) {
      this.pendingWaits.delete(sessionId);
      pending.resolve();
    }
  }

  unbindSession(sessionId: string) {
    const runtimeId = this.sessionRuntime.get(sessionId);
    if (runtimeId) {
      const runtime = this.runtimes.get(runtimeId);
      if (runtime) runtime.boundSessions.delete(sessionId);
      runtimeDebug("unbound session from runtime", {
        sessionId,
        runtimeId,
        remainingBoundSessions: runtime ? [...runtime.boundSessions] : [],
      });
    }
    this.sessionRuntime.delete(sessionId);
  }

  getRuntimeForSession(sessionId: string): RuntimeInstance | undefined {
    const runtimeId = this.sessionRuntime.get(sessionId);
    if (!runtimeId) return undefined;
    return this.runtimes.get(runtimeId);
  }

  getRuntime(runtimeId: string): RuntimeInstance | undefined {
    return this.runtimes.get(runtimeId);
  }

  /** Send a command to the runtime that owns this session, returning a typed delivery result. */
  send(sessionId: string, command: SessionCommand): DeliveryResult {
    let runtimeId = this.sessionRuntime.get(sessionId);
    const requiredTool = "tool" in command && typeof command.tool === "string" ? command.tool : undefined;

    // Auto-bind to a default runtime if not yet bound
    if (!runtimeId) {
      const runtime = this.getDefaultRuntime(requiredTool);
      if (!runtime) return "no_runtime";
      this.bindSession(sessionId, runtime.id);
      runtimeId = runtime.id;
    }

    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) return "session_unbound";
    if (runtime.ws.readyState !== runtime.ws.OPEN) return "runtime_disconnected";
    if (requiredTool && !runtime.supportedTools.includes(requiredTool)) {
      const fallbackRuntime = this.getDefaultRuntime(requiredTool);
      if (!fallbackRuntime) return "no_runtime";
      this.bindSession(sessionId, fallbackRuntime.id);
      return this.send(sessionId, command);
    }

    try {
      runtime.ws.send(JSON.stringify(command));
      return "delivered";
    } catch {
      return "delivery_failed";
    }
  }

  getDefaultRuntime(requiredTool?: string): RuntimeInstance | undefined {
    for (const runtime of this.runtimes.values()) {
      if (runtime.ws.readyState !== runtime.ws.OPEN) continue;
      if (requiredTool && !runtime.supportedTools.includes(requiredTool)) continue;
      return runtime;
    }
    return undefined;
  }

  /** Find a connected runtime that has a given repo registered (or any cloud runtime). */
  getRuntimeForRepo(repoId: string): RuntimeInstance | undefined {
    for (const runtime of this.runtimes.values()) {
      if (runtime.ws.readyState !== runtime.ws.OPEN) continue;
      // Cloud runtimes support all repos; local runtimes must have the repo registered
      if (runtime.hostingMode === "cloud" || runtime.registeredRepoIds.includes(repoId)) {
        return runtime;
      }
    }
    return undefined;
  }

  /** List all connected runtimes, optionally filtered by hosting mode. */
  listRuntimes(filter?: { hostingMode?: string }): RuntimeInstance[] {
    const results: RuntimeInstance[] = [];
    for (const runtime of this.runtimes.values()) {
      if (runtime.ws.readyState !== runtime.ws.OPEN) continue;
      if (filter?.hostingMode && runtime.hostingMode !== filter.hostingMode) continue;
      results.push(runtime);
    }
    return results;
  }

  /** Check for stale runtimes that have missed heartbeats. Returns affected session IDs. */
  checkStaleRuntimes(): Array<{ runtimeId: string; sessionIds: string[] }> {
    const now = Date.now();
    const stale: Array<{ runtimeId: string; sessionIds: string[] }> = [];
    for (const [runtimeId, runtime] of this.runtimes) {
      if (now - runtime.lastHeartbeat > SessionRouter.HEARTBEAT_TIMEOUT_MS) {
        runtimeDebug("detected stale runtime", {
          runtimeId,
          label: runtime.label,
          ageMs: now - runtime.lastHeartbeat,
          readyState: runtime.ws.readyState,
          boundSessions: [...runtime.boundSessions],
        });
        stale.push({ runtimeId, sessionIds: [...runtime.boundSessions] });
      }
    }
    return stale;
  }

  getRuntimeDiagnostics(): Array<Record<string, unknown>> {
    const now = Date.now();
    return [...this.runtimes.values()].map((runtime) => ({
      id: runtime.id,
      label: runtime.label,
      hostingMode: runtime.hostingMode,
      supportedTools: runtime.supportedTools,
      registeredRepoIds: runtime.registeredRepoIds,
      readyState: runtime.ws.readyState,
      lastHeartbeatAgeMs: now - runtime.lastHeartbeat,
      boundSessions: [...runtime.boundSessions],
    }));
  }

  /** Send a command directly to a runtime (not session-scoped). */
  private sendToRuntime(runtimeId: string, command: Record<string, unknown>): DeliveryResult {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) return "no_runtime";
    if (runtime.ws.readyState !== runtime.ws.OPEN) return "runtime_disconnected";
    try {
      runtime.ws.send(JSON.stringify(command));
      return "delivered";
    } catch {
      return "delivery_failed";
    }
  }

  /**
   * Ask a runtime to list branches for a given repo.
   * Returns a promise that resolves when the bridge responds with branches_result.
   */
  listBranches(runtimeId: string, repoId: string, timeoutMs = 10_000): Promise<string[]> {
    const requestId = randomUUID();
    const result = this.sendToRuntime(runtimeId, { type: "list_branches", requestId, repoId });
    if (result !== "delivered") {
      return Promise.reject(new Error(`Runtime not available: ${result}`));
    }

    return new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingBranchRequests.delete(requestId);
        reject(new Error("Branch list request timed out"));
      }, timeoutMs);

      this.pendingBranchRequests.set(requestId, {
        resolve: (branches) => { clearTimeout(timer); resolve(branches); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
    });
  }

  /** Resolve a pending branch list request (called from bridge handler). */
  resolveBranchRequest(requestId: string, branches: string[], error?: string): void {
    const pending = this.pendingBranchRequests.get(requestId);
    if (!pending) return;
    this.pendingBranchRequests.delete(requestId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(branches);
    }
  }

  /**
   * Ask a runtime to list files in a working directory.
   * Returns a promise that resolves when the bridge responds with files_result.
   */
  listFiles(runtimeId: string, sessionId: string, workdirHint?: string, timeoutMs = 15_000): Promise<string[]> {
    const requestId = randomUUID();
    const result = this.sendToRuntime(runtimeId, { type: "list_files", requestId, sessionId, workdirHint });
    if (result !== "delivered") {
      return Promise.reject(new Error(`Runtime not available: ${result}`));
    }

    return new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFileRequests.delete(requestId);
        reject(new Error("File list request timed out"));
      }, timeoutMs);

      this.pendingFileRequests.set(requestId, {
        resolve: (files) => { clearTimeout(timer); resolve(files); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
    });
  }

  /** Resolve a pending file list request (called from bridge handler). */
  resolveFileRequest(requestId: string, files: string[], error?: string): void {
    const pending = this.pendingFileRequests.get(requestId);
    if (!pending) return;
    this.pendingFileRequests.delete(requestId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(files);
    }
  }

  /**
   * Ask a runtime to read a file's contents.
   * Returns a promise that resolves when the bridge responds with file_content_result.
   */
  readFile(runtimeId: string, sessionId: string, relativePath: string, workdirHint?: string, timeoutMs = 15_000): Promise<string> {
    const requestId = randomUUID();
    const result = this.sendToRuntime(runtimeId, { type: "read_file", requestId, sessionId, relativePath, workdirHint });
    if (result !== "delivered") {
      return Promise.reject(new Error(`Runtime not available: ${result}`));
    }

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFileContentRequests.delete(requestId);
        reject(new Error("File read request timed out"));
      }, timeoutMs);

      this.pendingFileContentRequests.set(requestId, {
        resolve: (content) => { clearTimeout(timer); resolve(content); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
    });
  }

  /** Resolve a pending file content request (called from bridge handler). */
  resolveFileContentRequest(requestId: string, content: string, error?: string): void {
    const pending = this.pendingFileContentRequests.get(requestId);
    if (!pending) return;
    this.pendingFileContentRequests.delete(requestId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(content);
    }
  }

  /**
   * Ask a runtime to compute the branch diff (changed files vs base branch).
   */
  branchDiff(runtimeId: string, sessionId: string, baseBranch: string, workdirHint?: string, timeoutMs = 30_000): Promise<BridgeBranchDiffFile[]> {
    const requestId = randomUUID();
    const result = this.sendToRuntime(runtimeId, { type: "branch_diff", requestId, sessionId, baseBranch, workdirHint });
    if (result !== "delivered") {
      return Promise.reject(new Error(`Runtime not available: ${result}`));
    }

    return new Promise<BridgeBranchDiffFile[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingBranchDiffRequests.delete(requestId);
        reject(new Error("Branch diff request timed out"));
      }, timeoutMs);

      this.pendingBranchDiffRequests.set(requestId, {
        resolve: (files) => { clearTimeout(timer); resolve(files); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
    });
  }

  /** Resolve a pending branch diff request (called from bridge handler). */
  resolveBranchDiffRequest(requestId: string, files: BridgeBranchDiffFile[], error?: string): void {
    const pending = this.pendingBranchDiffRequests.get(requestId);
    if (!pending) return;
    this.pendingBranchDiffRequests.delete(requestId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(files);
    }
  }

  /**
   * Ask a runtime to read a file's content at a specific git ref.
   */
  fileAtRef(runtimeId: string, sessionId: string, filePath: string, ref: string, workdirHint?: string, timeoutMs = 15_000): Promise<string> {
    const requestId = randomUUID();
    const result = this.sendToRuntime(runtimeId, { type: "file_at_ref", requestId, sessionId, filePath, ref, workdirHint });
    if (result !== "delivered") {
      return Promise.reject(new Error(`Runtime not available: ${result}`));
    }

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFileAtRefRequests.delete(requestId);
        reject(new Error("File at ref request timed out"));
      }, timeoutMs);

      this.pendingFileAtRefRequests.set(requestId, {
        resolve: (content) => { clearTimeout(timer); resolve(content); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
    });
  }

  /** Resolve a pending file-at-ref request (called from bridge handler). */
  resolveFileAtRefRequest(requestId: string, content: string, error?: string): void {
    const pending = this.pendingFileAtRefRequests.get(requestId);
    if (!pending) return;
    this.pendingFileAtRefRequests.delete(requestId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(content);
    }
  }

  // --- Adapter-dispatched lifecycle methods ---

  private getAdapter(hosting: string): SessionAdapter {
    if (hosting === "cloud") {
      if (!this.cloudAdapter) throw new Error("CloudMachineService not initialized — call setCloudMachineService() first");
      return this.cloudAdapter;
    }
    return localAdapter;
  }

  /**
   * Provision the runtime for a session. Delegates to the correct adapter.
   */
  createRuntime(options: SessionAdapterCreateOptions & { hosting: string; onFailed: (error: string) => void; onWorkspaceReady?: (workdir: string) => void }): void {
    const { hosting, onFailed, onWorkspaceReady, ...adapterOptions } = options;
    const adapter = this.getAdapter(hosting);
    adapter.create(adapterOptions, {
      send: (cmd) => this.send(options.sessionId, cmd),
      onFailed,
      onWorkspaceReady: onWorkspaceReady ?? (() => {}),
      waitForBridge: (sid, timeoutMs?, runtimeId?) => this.waitForBridge(sid, timeoutMs, runtimeId),
    });
  }

  /**
   * Destroy a session's runtime. Delegates to the correct adapter.
   */
  async destroyRuntime(sessionId: string, session: { hosting: string; workdir?: string | null; repoId?: string | null; connection?: unknown }): Promise<void> {
    const adapter = this.getAdapter(session.hosting);
    await adapter.destroy(
      { sessionId, workdir: session.workdir, repoId: session.repoId, connection: session.connection },
      { send: (cmd) => this.send(sessionId, cmd) },
    );
    this.unbindSession(sessionId);
  }

  /**
   * Transition a session's runtime (pause/resume/terminate). Delegates to the correct adapter.
   */
  async transitionRuntime(sessionId: string, hosting: string, command: "pause" | "resume" | "terminate"): Promise<DeliveryResult> {
    const adapter = this.getAdapter(hosting);
    return adapter.transition(sessionId, command, {
      send: (cmd) => this.send(sessionId, cmd),
      waitForBridge: (sid, timeoutMs?, runtimeId?) => this.waitForBridge(sid, timeoutMs, runtimeId),
    });
  }

  // Backwards-compatible aliases for bridge-handler migration
  registerBridge(bridgeId: string, ws: WebSocket) {
    this.registerRuntime({
      id: bridgeId,
      label: bridgeId,
      ws,
      hostingMode: "local",
      supportedTools: ["claude_code", "codex", "custom"],
    });
  }

  unregisterBridge(bridgeId: string): string[] {
    return this.unregisterRuntime(bridgeId);
  }

  getDefaultBridge(): { id: string; ws: WebSocket } | undefined {
    const runtime = this.getDefaultRuntime();
    if (!runtime) return undefined;
    return { id: runtime.id, ws: runtime.ws };
  }
}

export const sessionRouter = new SessionRouter();
