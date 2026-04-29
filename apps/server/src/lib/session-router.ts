import type WebSocket from "ws";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import type { CloudMachineService } from "./cloud-machine-service.js";
import type {
  BridgeTerminalCreateCommand,
  BridgeTerminalInputCommand,
  BridgeTerminalResizeCommand,
  BridgeTerminalDestroyCommand,
  BridgeListFilesCommand,
  BridgeReadFileCommand,
  BridgeBranchDiffCommand,
  BridgeFileAtRefCommand,
  BridgeBranchDiffFile,
  BridgeListSkillsCommand,
  BridgeSkillInfo,
  BridgeLinkedCheckoutStatus,
  BridgeLinkedCheckoutActionResultPayload,
  BridgeSessionGitSyncStatus,
} from "@trace/shared";
import { prisma } from "./db.js";
import { runtimeDebug } from "./runtime-debug.js";
import {
  runtimeAdapterRegistry,
  setProvisionedRuntimeCloudMachineService,
} from "./runtime-adapters.js";
import {
  RuntimeAdapterRegistry,
  type RuntimeAdapterType,
  type RuntimeEnvironment,
} from "./runtime-adapter-registry.js";

interface BaseSessionCommand {
  type:
    | "run"
    | "terminate"
    | "pause"
    | "resume"
    | "send"
    | "prepare"
    | "delete"
    | "list_branches"
    | "upgrade_workspace";
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
  | BridgeListSkillsCommand
  | { type: "session_git_sync_status"; requestId: string; sessionId: string; workdirHint?: string }
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
  organizationId?: string;
  ownerUserId?: string;
  bridgeRuntimeId?: string;
  supportedTools: string[];
  /** Repo IDs this runtime has locally registered. Cloud runtimes use empty (supports all). */
  registeredRepoIds: string[];
  lastHeartbeat: number;
  boundSessions: Set<string>;
  /**
   * Cache of linked-checkout status per repo, populated as the bridge responds
   * to status/action requests. Lets queries like `BridgeRuntime.linkedCheckouts`
   * answer without a per-call WebSocket round-trip.
   */
  linkedCheckouts: Map<string, BridgeLinkedCheckoutStatus>;
}

export interface StaleRuntimeSnapshot {
  runtimeId: string;
  sessionIds: string[];
  lastHeartbeat: number;
}

export interface StaleRuntimeEvictionResult {
  evicted: boolean;
  affectedSessions: string[];
}

export interface SessionAdapterCreateOptions {
  sessionId: string;
  /** Session group ID — used to key worktrees so all sessions in a group share the same workspace. */
  sessionGroupId?: string;
  /** Animal slug for the worktree. If set, reuses the existing slug. */
  slug?: string;
  /** Preserve the persisted branch name instead of generating trace/{slug}. */
  preserveBranchName?: boolean;
  tool: string;
  model?: string;
  repo?: { id: string; name: string; remoteUrl: string; defaultBranch: string } | null;
  branch?: string;
  checkpointSha?: string;
  createdById: string;
  organizationId: string;
  readOnly?: boolean;
  adapterType?: RuntimeAdapterType;
  runtimeToken?: string;
  bridgeUrl?: string;
  environment?: {
    id: string;
    name: string;
    adapterType: RuntimeAdapterType;
    config: Prisma.JsonValue;
  } | null;
}

function adapterTypeFromHosting(
  hosting: string,
  runtimeAdapters: RuntimeAdapterRegistry,
): RuntimeAdapterType {
  if (hosting === "cloud") return "provisioned";
  if (hosting === "local") return "local";
  return runtimeAdapters.get(hosting).type;
}

function connectionRecord(connection: unknown): Record<string, unknown> | null {
  if (!connection || typeof connection !== "object" || Array.isArray(connection)) return null;
  return connection as Record<string, unknown>;
}

function connectionEnvironmentId(connection: Record<string, unknown> | null): string | null {
  const environmentId = connection?.environmentId;
  return typeof environmentId === "string" && environmentId.trim() ? environmentId : null;
}

/**
 * Runtime-aware registry that tracks runtime instances, their capabilities,
 * and which sessions they own. Replaces the old bridge-only socket map.
 */
export class SessionRouter {
  constructor(private readonly runtimeAdapters = runtimeAdapterRegistry) {}

  private runtimes = new Map<string, RuntimeInstance>();
  /** Maps sessionId → runtimeId */
  private sessionRuntime = new Map<string, string>();
  /** Pending waitForBridge promises for cloud sessions */
  private pendingWaits = new Map<string, { resolve: () => void; reject: (err: Error) => void }>();
  /** Pending branch list requests: requestId → resolve/reject */
  private pendingBranchRequests = new Map<
    string,
    { runtimeId: string; resolve: (branches: string[]) => void; reject: (err: Error) => void }
  >();
  /** Pending file list requests: requestId → resolve/reject */
  private pendingFileRequests = new Map<
    string,
    { runtimeId: string; resolve: (files: string[]) => void; reject: (err: Error) => void }
  >();
  /** Pending file content requests: requestId → resolve/reject */
  private pendingFileContentRequests = new Map<
    string,
    { runtimeId: string; resolve: (content: string) => void; reject: (err: Error) => void }
  >();
  /** Pending branch diff requests: requestId → resolve/reject */
  private pendingBranchDiffRequests = new Map<
    string,
    {
      runtimeId: string;
      resolve: (files: BridgeBranchDiffFile[]) => void;
      reject: (err: Error) => void;
    }
  >();
  /** Pending file-at-ref requests: requestId → resolve/reject */
  private pendingFileAtRefRequests = new Map<
    string,
    { runtimeId: string; resolve: (content: string) => void; reject: (err: Error) => void }
  >();
  /** Pending skills list requests: requestId → resolve/reject */
  private pendingSkillsRequests = new Map<
    string,
    {
      runtimeId: string;
      resolve: (skills: BridgeSkillInfo[]) => void;
      reject: (err: Error) => void;
    }
  >();
  /** Pending linked-checkout status requests: requestId → resolve/reject */
  private pendingLinkedCheckoutStatusRequests = new Map<
    string,
    {
      runtimeId: string;
      resolve: (status: BridgeLinkedCheckoutStatus) => void;
      reject: (err: Error) => void;
    }
  >();
  /** Pending linked-checkout action requests: requestId → resolve/reject */
  private pendingLinkedCheckoutActionRequests = new Map<
    string,
    {
      runtimeId: string;
      resolve: (result: BridgeLinkedCheckoutActionResultPayload) => void;
      reject: (err: Error) => void;
    }
  >();
  /** Pending session git-sync-status requests: requestId → resolve/reject */
  private pendingSessionGitSyncStatusRequests = new Map<
    string,
    {
      runtimeId: string;
      resolve: (status: BridgeSessionGitSyncStatus) => void;
      reject: (err: Error) => void;
    }
  >();

  /** Heartbeat timeout in ms — if no heartbeat in this window, runtime is considered stale */
  static HEARTBEAT_TIMEOUT_MS = 30_000;

  /** Inject the CloudMachineService for the transitional provisioned adapter. */
  setCloudMachineService(service: CloudMachineService): void {
    setProvisionedRuntimeCloudMachineService(service);
  }

  registerRuntime(runtime: {
    id: string;
    label: string;
    ws: WebSocket;
    hostingMode: "cloud" | "local";
    organizationId?: string;
    ownerUserId?: string;
    bridgeRuntimeId?: string;
    supportedTools: string[];
    registeredRepoIds?: string[];
  }) {
    const existing = this.runtimes.get(runtime.id);
    const boundSessions = existing?.boundSessions ?? new Set<string>();
    const linkedCheckouts =
      existing?.linkedCheckouts ?? new Map<string, BridgeLinkedCheckoutStatus>();
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
      organizationId: runtime.organizationId ?? existing?.organizationId,
      ownerUserId: runtime.ownerUserId ?? existing?.ownerUserId,
      bridgeRuntimeId: runtime.bridgeRuntimeId ?? existing?.bridgeRuntimeId,
      registeredRepoIds: runtime.registeredRepoIds ?? existing?.registeredRepoIds ?? [],
      lastHeartbeat: Date.now(),
      boundSessions,
      linkedCheckouts,
    });
    runtimeDebug("registered runtime", {
      runtimeId: runtime.id,
      label: runtime.label,
      hostingMode: runtime.hostingMode,
      organizationId: runtime.organizationId ?? null,
      ownerUserId: runtime.ownerUserId ?? null,
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

  /** True when the given runtime is registered and its websocket is open. */
  isRuntimeAvailable(runtimeId: string): boolean {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) return false;
    return runtime.ws.readyState === runtime.ws.OPEN;
  }

  /**
   * Send a command to the runtime that owns this session, returning a typed
   * delivery result.
   *
   * `expectedHomeRuntimeId` pins delivery to the session's persistent home
   * bridge. Callers MUST pass it for any session that has (or should have) a
   * home runtime — otherwise the router would have to guess, and the runtime
   * map is a single cross-tenant namespace. We do not guess: when the session
   * is not already bound AND no expected home was provided, we return
   * `no_runtime` rather than auto-binding to whichever bridge happens to be
   * connected first (which previously leaked PTYs/commands across orgs).
   */
  send(
    sessionId: string,
    command: SessionCommand,
    options?: { expectedHomeRuntimeId?: string },
  ): DeliveryResult {
    const expectedHomeId = options?.expectedHomeRuntimeId;
    if (expectedHomeId) {
      if (!this.isRuntimeAvailable(expectedHomeId)) return "runtime_disconnected";
      // Force the in-memory binding to match the persisted home so we never
      // dispatch to a stale (possibly hijacked) runtime.
      this.bindSession(sessionId, expectedHomeId);
    }

    const runtimeId = this.sessionRuntime.get(sessionId);
    if (!runtimeId) return "no_runtime";

    const requiredTool =
      "tool" in command && typeof command.tool === "string" ? command.tool : undefined;

    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) return "session_unbound";
    if (runtime.ws.readyState !== runtime.ws.OPEN) return "runtime_disconnected";
    if (requiredTool && !runtime.supportedTools.includes(requiredTool)) {
      // The bound runtime doesn't speak the requested tool. We used to silently
      // rebind to any connected runtime that did — that's a cross-tenant
      // dispatch, so we now fail and let the caller resolve a proper home
      // runtime via the authorized-runtime-selection path.
      return "no_runtime";
    }

    try {
      runtime.ws.send(JSON.stringify(command));
      return "delivered";
    } catch {
      return "delivery_failed";
    }
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
  checkStaleRuntimes(): StaleRuntimeSnapshot[] {
    const now = Date.now();
    const stale: StaleRuntimeSnapshot[] = [];
    for (const [runtimeId, runtime] of this.runtimes) {
      if (now - runtime.lastHeartbeat > SessionRouter.HEARTBEAT_TIMEOUT_MS) {
        runtimeDebug("detected stale runtime", {
          runtimeId,
          label: runtime.label,
          ageMs: now - runtime.lastHeartbeat,
          readyState: runtime.ws.readyState,
          boundSessions: [...runtime.boundSessions],
        });
        stale.push({
          runtimeId,
          sessionIds: [...runtime.boundSessions],
          lastHeartbeat: runtime.lastHeartbeat,
        });
      }
    }
    return stale;
  }

  /**
   * Evict a runtime only if it is still the same stale instance we observed
   * earlier. This avoids racing a reconnect that reused the same runtime ID.
   */
  evictRuntimeIfStale(
    runtimeId: string,
    expectedLastHeartbeat: number,
  ): StaleRuntimeEvictionResult {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) return { evicted: false, affectedSessions: [] };

    if (runtime.lastHeartbeat !== expectedLastHeartbeat) {
      runtimeDebug("skipped stale runtime eviction after reconnect", {
        runtimeId,
        expectedLastHeartbeat,
        actualLastHeartbeat: runtime.lastHeartbeat,
        boundSessions: [...runtime.boundSessions],
      });
      return { evicted: false, affectedSessions: [] };
    }

    if (Date.now() - runtime.lastHeartbeat <= SessionRouter.HEARTBEAT_TIMEOUT_MS) {
      runtimeDebug("skipped stale runtime eviction after fresh heartbeat", {
        runtimeId,
        lastHeartbeat: runtime.lastHeartbeat,
      });
      return { evicted: false, affectedSessions: [] };
    }

    return {
      evicted: true,
      affectedSessions: this.unregisterRuntime(runtimeId),
    };
  }

  getRuntimeDiagnostics(): Array<Record<string, unknown>> {
    const now = Date.now();
    return [...this.runtimes.values()].map((runtime) => ({
      id: runtime.id,
      label: runtime.label,
      hostingMode: runtime.hostingMode,
      organizationId: runtime.organizationId ?? null,
      ownerUserId: runtime.ownerUserId ?? null,
      bridgeRuntimeId: runtime.bridgeRuntimeId ?? null,
      supportedTools: runtime.supportedTools,
      registeredRepoIds: runtime.registeredRepoIds,
      readyState: runtime.ws.readyState,
      lastHeartbeatAgeMs: now - runtime.lastHeartbeat,
      boundSessions: [...runtime.boundSessions],
    }));
  }

  private async resolveRuntimeEnvironment(
    connection: Record<string, unknown> | null,
  ): Promise<RuntimeEnvironment | null> {
    const environmentId = connectionEnvironmentId(connection);
    if (!environmentId) return null;

    const environment = await prisma.agentEnvironment.findFirst({
      where: { id: environmentId },
      select: { id: true, name: true, adapterType: true, config: true },
    });
    if (!environment) return null;

    const adapterType = this.runtimeAdapters.get(environment.adapterType).type;
    return {
      id: environment.id,
      name: environment.name,
      adapterType,
      config: environment.config,
    };
  }

  /** Send a command directly to a runtime (not session-scoped). */
  sendToRuntime(runtimeId: string, command: Record<string, unknown>): DeliveryResult {
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
        runtimeId,
        resolve: (branches) => {
          clearTimeout(timer);
          resolve(branches);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  /** Resolve a pending branch list request (called from bridge handler). */
  resolveBranchRequest(
    requestId: string,
    branches: string[],
    error?: string,
    sourceRuntimeId?: string,
  ): void {
    const pending = this.pendingBranchRequests.get(requestId);
    if (!pending) return;
    if (sourceRuntimeId && pending.runtimeId !== sourceRuntimeId) return;
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
  listFiles(
    runtimeId: string,
    sessionId: string,
    workdirHint?: string,
    timeoutMs = 15_000,
  ): Promise<string[]> {
    const requestId = randomUUID();
    const result = this.sendToRuntime(runtimeId, {
      type: "list_files",
      requestId,
      sessionId,
      workdirHint,
    });
    if (result !== "delivered") {
      return Promise.reject(new Error(`Runtime not available: ${result}`));
    }

    return new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFileRequests.delete(requestId);
        reject(new Error("File list request timed out"));
      }, timeoutMs);

      this.pendingFileRequests.set(requestId, {
        runtimeId,
        resolve: (files) => {
          clearTimeout(timer);
          resolve(files);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  /** Resolve a pending file list request (called from bridge handler). */
  resolveFileRequest(
    requestId: string,
    files: string[],
    error?: string,
    sourceRuntimeId?: string,
  ): void {
    const pending = this.pendingFileRequests.get(requestId);
    if (!pending) return;
    if (sourceRuntimeId && pending.runtimeId !== sourceRuntimeId) return;
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
  readFile(
    runtimeId: string,
    sessionId: string,
    relativePath: string,
    workdirHint?: string,
    timeoutMs = 15_000,
  ): Promise<string> {
    const requestId = randomUUID();
    const result = this.sendToRuntime(runtimeId, {
      type: "read_file",
      requestId,
      sessionId,
      relativePath,
      workdirHint,
    });
    if (result !== "delivered") {
      return Promise.reject(new Error(`Runtime not available: ${result}`));
    }

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFileContentRequests.delete(requestId);
        reject(new Error("File read request timed out"));
      }, timeoutMs);

      this.pendingFileContentRequests.set(requestId, {
        runtimeId,
        resolve: (content) => {
          clearTimeout(timer);
          resolve(content);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  /** Resolve a pending file content request (called from bridge handler). */
  resolveFileContentRequest(
    requestId: string,
    content: string,
    error?: string,
    sourceRuntimeId?: string,
  ): void {
    const pending = this.pendingFileContentRequests.get(requestId);
    if (!pending) return;
    if (sourceRuntimeId && pending.runtimeId !== sourceRuntimeId) return;
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
  branchDiff(
    runtimeId: string,
    sessionId: string,
    baseBranch: string,
    workdirHint?: string,
    timeoutMs = 30_000,
  ): Promise<BridgeBranchDiffFile[]> {
    const requestId = randomUUID();
    const result = this.sendToRuntime(runtimeId, {
      type: "branch_diff",
      requestId,
      sessionId,
      baseBranch,
      workdirHint,
    });
    if (result !== "delivered") {
      return Promise.reject(new Error(`Runtime not available: ${result}`));
    }

    return new Promise<BridgeBranchDiffFile[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingBranchDiffRequests.delete(requestId);
        reject(new Error("Branch diff request timed out"));
      }, timeoutMs);

      this.pendingBranchDiffRequests.set(requestId, {
        runtimeId,
        resolve: (files) => {
          clearTimeout(timer);
          resolve(files);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  /** Resolve a pending branch diff request (called from bridge handler). */
  resolveBranchDiffRequest(
    requestId: string,
    files: BridgeBranchDiffFile[],
    error?: string,
    sourceRuntimeId?: string,
  ): void {
    const pending = this.pendingBranchDiffRequests.get(requestId);
    if (!pending) return;
    if (sourceRuntimeId && pending.runtimeId !== sourceRuntimeId) return;
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
  fileAtRef(
    runtimeId: string,
    sessionId: string,
    filePath: string,
    ref: string,
    workdirHint?: string,
    timeoutMs = 15_000,
  ): Promise<string> {
    const requestId = randomUUID();
    const result = this.sendToRuntime(runtimeId, {
      type: "file_at_ref",
      requestId,
      sessionId,
      filePath,
      ref,
      workdirHint,
    });
    if (result !== "delivered") {
      return Promise.reject(new Error(`Runtime not available: ${result}`));
    }

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFileAtRefRequests.delete(requestId);
        reject(new Error("File at ref request timed out"));
      }, timeoutMs);

      this.pendingFileAtRefRequests.set(requestId, {
        runtimeId,
        resolve: (content) => {
          clearTimeout(timer);
          resolve(content);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  /** Resolve a pending file-at-ref request (called from bridge handler). */
  resolveFileAtRefRequest(
    requestId: string,
    content: string,
    error?: string,
    sourceRuntimeId?: string,
  ): void {
    const pending = this.pendingFileAtRefRequests.get(requestId);
    if (!pending) return;
    if (sourceRuntimeId && pending.runtimeId !== sourceRuntimeId) return;
    this.pendingFileAtRefRequests.delete(requestId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(content);
    }
  }

  /**
   * Ask a runtime to list skills (user + project SKILL.md files).
   */
  listSkills(
    runtimeId: string,
    sessionId: string,
    options?: {
      workdirHint?: string;
      includeUserSkills?: boolean;
      includeProjectSkills?: boolean;
      timeoutMs?: number;
    },
  ): Promise<BridgeSkillInfo[]> {
    const {
      workdirHint,
      includeUserSkills = true,
      includeProjectSkills = true,
      timeoutMs = 15_000,
    } = options ?? {};
    const requestId = randomUUID();
    const result = this.sendToRuntime(runtimeId, {
      type: "list_skills",
      requestId,
      sessionId,
      workdirHint,
      includeUserSkills,
      includeProjectSkills,
    });
    if (result !== "delivered") {
      return Promise.reject(new Error(`Runtime not available: ${result}`));
    }

    return new Promise<BridgeSkillInfo[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingSkillsRequests.delete(requestId);
        reject(new Error("Skills list request timed out"));
      }, timeoutMs);

      this.pendingSkillsRequests.set(requestId, {
        runtimeId,
        resolve: (skills) => {
          clearTimeout(timer);
          resolve(skills);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  /** Resolve a pending skills list request (called from bridge handler). */
  resolveSkillsRequest(
    requestId: string,
    skills: BridgeSkillInfo[],
    error?: string,
    sourceRuntimeId?: string,
  ): void {
    const pending = this.pendingSkillsRequests.get(requestId);
    if (!pending) return;
    if (sourceRuntimeId && pending.runtimeId !== sourceRuntimeId) return;
    this.pendingSkillsRequests.delete(requestId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(skills);
    }
  }

  getLinkedCheckoutStatus(
    runtimeId: string,
    repoId: string,
    timeoutMs = 15_000,
  ): Promise<BridgeLinkedCheckoutStatus> {
    const requestId = randomUUID();
    const result = this.sendToRuntime(runtimeId, {
      type: "linked_checkout_status",
      requestId,
      repoId,
    });
    if (result !== "delivered") {
      return Promise.reject(new Error(`Runtime not available: ${result}`));
    }

    return new Promise<BridgeLinkedCheckoutStatus>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingLinkedCheckoutStatusRequests.delete(requestId);
        reject(new Error("Linked checkout status request timed out"));
      }, timeoutMs);

      this.pendingLinkedCheckoutStatusRequests.set(requestId, {
        runtimeId,
        resolve: (status) => {
          clearTimeout(timer);
          resolve(status);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  resolveLinkedCheckoutStatusRequest(
    requestId: string,
    status: BridgeLinkedCheckoutStatus,
    sourceRuntimeId?: string,
  ): void {
    const pending = this.pendingLinkedCheckoutStatusRequests.get(requestId);
    if (!pending) return;
    if (sourceRuntimeId && pending.runtimeId !== sourceRuntimeId) return;
    this.pendingLinkedCheckoutStatusRequests.delete(requestId);
    this.cacheLinkedCheckoutStatus(pending.runtimeId, status);
    pending.resolve(status);
  }

  /**
   * Populate the cache for one repo. Called whenever the bridge volunteers a
   * fresh status (status_result or action_result), so foreground sync actions
   * keep the home-screen view warm without extra round-trips.
   */
  private cacheLinkedCheckoutStatus(runtimeId: string, status: BridgeLinkedCheckoutStatus): void {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) return;
    runtime.linkedCheckouts.set(status.repoId, status);
  }

  private requestLinkedCheckoutAction(
    runtimeId: string,
    command: Record<string, unknown>,
    timeoutMs = 30_000,
  ): Promise<BridgeLinkedCheckoutActionResultPayload> {
    const requestId = randomUUID();
    const result = this.sendToRuntime(runtimeId, {
      ...command,
      requestId,
    });
    if (result !== "delivered") {
      return Promise.reject(new Error(`Runtime not available: ${result}`));
    }

    return new Promise<BridgeLinkedCheckoutActionResultPayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingLinkedCheckoutActionRequests.delete(requestId);
        reject(new Error("Linked checkout action request timed out"));
      }, timeoutMs);

      this.pendingLinkedCheckoutActionRequests.set(requestId, {
        runtimeId,
        resolve: (actionResult) => {
          clearTimeout(timer);
          resolve(actionResult);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  linkLinkedCheckoutRepo(
    runtimeId: string,
    repoId: string,
    localPath: string,
    timeoutMs = 30_000,
  ): Promise<BridgeLinkedCheckoutActionResultPayload> {
    return this.requestLinkedCheckoutAction(
      runtimeId,
      {
        type: "linked_checkout_link_repo",
        repoId,
        localPath,
      },
      timeoutMs,
    );
  }

  syncLinkedCheckout(
    runtimeId: string,
    input: {
      repoId: string;
      sessionGroupId: string;
      branch: string;
      commitSha?: string | null;
      autoSyncEnabled?: boolean;
      conflictStrategy?: "discard" | "commit" | "rebase";
      commitMessage?: string | null;
    },
    timeoutMs = 60_000,
  ): Promise<BridgeLinkedCheckoutActionResultPayload> {
    return this.requestLinkedCheckoutAction(
      runtimeId,
      {
        type: "linked_checkout_sync",
        repoId: input.repoId,
        sessionGroupId: input.sessionGroupId,
        branch: input.branch,
        commitSha: input.commitSha,
        autoSyncEnabled: input.autoSyncEnabled,
        conflictStrategy: input.conflictStrategy,
        commitMessage: input.commitMessage,
      },
      timeoutMs,
    );
  }

  commitLinkedCheckoutChanges(
    runtimeId: string,
    input: {
      repoId: string;
      sessionGroupId: string;
      message?: string | null;
    },
    timeoutMs = 60_000,
  ): Promise<BridgeLinkedCheckoutActionResultPayload> {
    return this.requestLinkedCheckoutAction(
      runtimeId,
      {
        type: "linked_checkout_commit",
        repoId: input.repoId,
        sessionGroupId: input.sessionGroupId,
        message: input.message,
      },
      timeoutMs,
    );
  }

  restoreLinkedCheckout(
    runtimeId: string,
    repoId: string,
    timeoutMs = 60_000,
  ): Promise<BridgeLinkedCheckoutActionResultPayload> {
    return this.requestLinkedCheckoutAction(
      runtimeId,
      {
        type: "linked_checkout_restore",
        repoId,
      },
      timeoutMs,
    );
  }

  setLinkedCheckoutAutoSync(
    runtimeId: string,
    repoId: string,
    enabled: boolean,
    timeoutMs = 15_000,
  ): Promise<BridgeLinkedCheckoutActionResultPayload> {
    return this.requestLinkedCheckoutAction(
      runtimeId,
      {
        type: "linked_checkout_set_auto_sync",
        repoId,
        enabled,
      },
      timeoutMs,
    );
  }

  resolveLinkedCheckoutActionRequest(
    requestId: string,
    result: BridgeLinkedCheckoutActionResultPayload,
    sourceRuntimeId?: string,
  ): void {
    const pending = this.pendingLinkedCheckoutActionRequests.get(requestId);
    if (!pending) return;
    if (sourceRuntimeId && pending.runtimeId !== sourceRuntimeId) return;
    this.pendingLinkedCheckoutActionRequests.delete(requestId);
    if (result.status) this.cacheLinkedCheckoutStatus(pending.runtimeId, result.status);
    pending.resolve(result);
  }

  inspectSessionGitSyncStatus(
    runtimeId: string,
    input: {
      sessionId: string;
      workdirHint?: string | null;
    },
    timeoutMs = 15_000,
  ): Promise<BridgeSessionGitSyncStatus> {
    const requestId = randomUUID();
    const result = this.sendToRuntime(runtimeId, {
      type: "session_git_sync_status",
      requestId,
      sessionId: input.sessionId,
      workdirHint: input.workdirHint ?? undefined,
    });
    if (result !== "delivered") {
      return Promise.reject(new Error(`Runtime not available: ${result}`));
    }

    return new Promise<BridgeSessionGitSyncStatus>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingSessionGitSyncStatusRequests.delete(requestId);
        reject(new Error("Session git sync status request timed out"));
      }, timeoutMs);

      this.pendingSessionGitSyncStatusRequests.set(requestId, {
        runtimeId,
        resolve: (status) => {
          clearTimeout(timer);
          resolve(status);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  resolveSessionGitSyncStatusRequest(
    requestId: string,
    status?: BridgeSessionGitSyncStatus,
    error?: string,
    sourceRuntimeId?: string,
  ): void {
    const pending = this.pendingSessionGitSyncStatusRequests.get(requestId);
    if (!pending) return;
    if (sourceRuntimeId && pending.runtimeId !== sourceRuntimeId) return;
    this.pendingSessionGitSyncStatusRequests.delete(requestId);
    if (error || !status) {
      pending.reject(new Error(error ?? "Missing session git sync status"));
    } else {
      pending.resolve(status);
    }
  }

  // --- Adapter-dispatched lifecycle methods ---

  /**
   * Provision/select compute for a session through the runtime adapter registry,
   * then keep bridge command delivery centralized here.
   */
  createRuntime(
    options: SessionAdapterCreateOptions & {
      hosting: string;
      onFailed: (error: string) => void;
      onWorkspaceReady?: (workdir: string) => void;
    },
  ): void {
    const adapterType =
      options.adapterType ?? adapterTypeFromHosting(options.hosting, this.runtimeAdapters);
    const adapter = this.runtimeAdapters.get(adapterType);

    void (async () => {
      try {
        const startResult = await adapter.startSession({
          sessionId: options.sessionId,
          sessionGroupId: options.sessionGroupId,
          slug: options.slug,
          preserveBranchName: options.preserveBranchName,
          organizationId: options.organizationId,
          actorId: options.createdById,
          environment: options.environment,
          tool: options.tool,
          model: options.model,
          repo: options.repo,
          branch: options.branch,
          checkpointSha: options.checkpointSha,
          readOnly: options.readOnly,
          runtimeToken: options.runtimeToken,
          bridgeUrl: options.bridgeUrl,
        });

        if (startResult.runtimeInstanceId) {
          this.bindSession(options.sessionId, startResult.runtimeInstanceId);
        }

        if (adapterType === "provisioned" && startResult.runtimeInstanceId) {
          const updatedSession = await prisma.session.update({
            where: { id: options.sessionId },
            data: {
              connection: {
                state: "connected",
                retryCount: 0,
                canRetry: true,
                canMove: true,
                ...(options.environment && {
                  environmentId: options.environment.id,
                  adapterType: options.environment.adapterType,
                }),
                ...(startResult.runtimeInstanceId && {
                  runtimeInstanceId: startResult.runtimeInstanceId,
                }),
                ...(startResult.runtimeLabel && { runtimeLabel: startResult.runtimeLabel }),
                ...(startResult.providerRuntimeId && {
                  cloudMachineId: startResult.providerRuntimeId,
                  providerRuntimeId: startResult.providerRuntimeId,
                }),
                ...(startResult.providerRuntimeUrl && {
                  providerRuntimeUrl: startResult.providerRuntimeUrl,
                }),
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

          await this.waitForBridge(options.sessionId, 120_000, startResult.runtimeInstanceId);
        }

        if (options.repo) {
          const result = this.send(
            options.sessionId,
            {
              type: "prepare",
              sessionId: options.sessionId,
              sessionGroupId: options.sessionGroupId,
              slug: options.slug,
              preserveBranchName: options.preserveBranchName,
              repoId: options.repo.id,
              repoName: options.repo.name,
              repoRemoteUrl: options.repo.remoteUrl,
              defaultBranch: options.repo.defaultBranch,
              branch: options.branch,
              checkpointSha: options.checkpointSha,
              readOnly: options.readOnly,
            },
            { expectedHomeRuntimeId: startResult.runtimeInstanceId },
          );
          if (result !== "delivered") {
            options.onFailed(`prepare: ${result}`);
          }
          return;
        }

        if (adapterType === "provisioned") {
          options.onWorkspaceReady?.("/home/coder");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[runtime-adapter] failed to start ${options.sessionId}:`, message);
        options.onFailed(`${adapterType} runtime failed: ${message}`);
      }
    })();
  }

  /**
   * Destroy a session's runtime. Delegates to the correct adapter.
   */
  async destroyRuntime(
    sessionId: string,
    session: {
      hosting: string;
      organizationId?: string;
      workdir?: string | null;
      repoId?: string | null;
      connection?: unknown;
    },
  ): Promise<void> {
    const adapterType =
      typeof connectionRecord(session.connection)?.adapterType === "string"
        ? (connectionRecord(session.connection)?.adapterType as string)
        : adapterTypeFromHosting(session.hosting, this.runtimeAdapters);
    const adapter = this.runtimeAdapters.get(adapterType);
    const connection = connectionRecord(session.connection);
    const environment = await this.resolveRuntimeEnvironment(connection);

    const result = this.send(sessionId, {
      type: "delete",
      sessionId,
      workdir: session.workdir,
      repoId: session.repoId,
    });
    if (result !== "delivered" && adapter.type === "local") {
      console.warn(`[local-adapter] bridge did not receive delete for ${sessionId}: ${result}`);
    }
    await adapter.stopSession({
      sessionId,
      organizationId: session.organizationId,
      environment,
      connection,
      reason: "session_deleted",
    });
    this.unbindSession(sessionId);
  }

  /**
   * Transition a session's runtime (pause/resume/terminate). Delegates to the correct adapter.
   */
  async transitionRuntime(
    sessionId: string,
    hosting: string,
    command: "pause" | "resume" | "terminate",
  ): Promise<DeliveryResult> {
    const adapterType = adapterTypeFromHosting(hosting, this.runtimeAdapters);
    const adapter = this.runtimeAdapters.get(adapterType);

    if (command === "resume" && adapter.type === "provisioned") {
      const session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
        select: {
          connection: true,
          createdById: true,
          organizationId: true,
          tool: true,
          model: true,
        },
      });
      const conn = connectionRecord(session.connection);
      const environment = await this.resolveRuntimeEnvironment(conn);
      const startResult = await adapter.startSession({
        sessionId,
        organizationId: session.organizationId,
        actorId: session.createdById,
        environment,
        tool: session.tool,
        model: session.model ?? undefined,
      });
      const runtimeId =
        startResult.runtimeInstanceId ??
        (typeof conn?.runtimeInstanceId === "string" ? conn.runtimeInstanceId : undefined);
      await this.waitForBridge(sessionId, 120_000, runtimeId);
    }

    return this.send(sessionId, { type: command, sessionId });
  }
}

export const sessionRouter = new SessionRouter();
