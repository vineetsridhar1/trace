import type WebSocket from "ws";
import type { EventType } from "@trace/gql";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import type {
  BridgeTerminalCreateCommand,
  BridgeTerminalInputCommand,
  BridgeTerminalResizeCommand,
  BridgeTerminalDestroyCommand,
  BridgePrepareAppCommand,
  BridgeListFilesCommand,
  BridgeReadFileCommand,
  BridgeWriteFileCommand,
  BridgeCommitFileChangesCommand,
  BridgeWorktreeChangesCommand,
  BridgeRevertWorktreeFileCommand,
  BridgeLinkedCheckoutChangedFile,
  BridgeWorktreeChangesPayload,
  BridgeBranchDiffCommand,
  BridgeFileAtRefCommand,
  BridgeBranchDiffFile,
  BridgeListSkillsCommand,
  BridgeSkillInfo,
  BridgeSessionCurrentBranchCommand,
  BridgeLinkedCheckoutChangedFilePreview,
  BridgeLinkedCheckoutStatus,
  BridgeLinkedCheckoutActionResultPayload,
  BridgeSessionGitSyncStatus,
  BridgeListWorkspaceSlugsCommand,
  BridgeRepoWorktree,
  ActionRequiredArtifact,
} from "@trace/shared";
import { GENERAL_WORKSPACE_PROTOCOL_VERSION } from "@trace/shared";
import { prisma } from "./db.js";
import { runtimeDebug } from "./runtime-debug.js";
import { ProvisionedLauncherError, runtimeAdapterRegistry } from "./runtime-adapters.js";
import { apiTokenService } from "../services/api-token.js";
import { codexCredentialService } from "../services/codex-credential.js";
import { ActionRequiredError } from "./errors.js";
import { logAgentEnvironmentTelemetry } from "./agent-environment-telemetry.js";
import { realtimeBackplane, type BackplaneEnvelope } from "./realtime-backplane.js";
import { runtimeDirectory, type RuntimeDescriptor } from "./runtime-directory.js";
import { correlatedResponseRelay } from "./correlated-response-relay.js";
import {
  RuntimeAdapterRegistry,
  type RuntimeAdapter,
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
    | "prepare_general"
    | "cleanup_general_workspace"
    | "prepare_app"
    | "delete"
    | "list_branches"
    | "upgrade_workspace";
  sessionId: string;
  prompt?: string;
  [key: string]: unknown;
}

export type SessionCommand =
  | BaseSessionCommand
  | BridgePrepareAppCommand
  | BridgeListFilesCommand
  | BridgeReadFileCommand
  | BridgeWriteFileCommand
  | BridgeCommitFileChangesCommand
  | BridgeWorktreeChangesCommand
  | BridgeRevertWorktreeFileCommand
  | BridgeBranchDiffCommand
  | BridgeFileAtRefCommand
  | BridgeListSkillsCommand
  | BridgeListWorkspaceSlugsCommand
  | { type: "session_git_sync_status"; requestId: string; sessionId: string; workdirHint?: string }
  | BridgeSessionCurrentBranchCommand
  | BridgeTerminalCreateCommand
  | BridgeTerminalInputCommand
  | BridgeTerminalResizeCommand
  | BridgeTerminalDestroyCommand;

/**
 * Outcome of a dispatch, as a vocabulary callers can act on.
 *
 * Delivery results describe command transport, never runtime liveness. Only
 * the replica holding a socket may declare it disconnected, from the socket's
 * close path and behind the persisted connection-generation fence.
 */
export type DeliveryResult =
  | "delivered"
  | "no_runtime"
  | "session_unbound"
  | "delivery_failed"
  | "unsupported_runtime";

/** Where a runtime's socket lives, as resolved by {@link SessionRouter.resolveRuntime}. */
export type RuntimeResolution =
  /** This replica holds an open, confirmed-current socket. */
  | { state: "local"; runtime: RuntimeInstance }
  /** A peer has acknowledged that it holds this open, current-generation socket. */
  | { state: "remote"; descriptor: RuntimeDescriptor }
  /** No authoritative route is currently available. Not a liveness verdict. */
  | { state: "unreachable" };

type LocalOwnershipResult = "owned" | "superseded" | "unreachable";

type PendingRuntimeRequest<T> = {
  runtimeId: string;
  connectionGeneration?: string;
  resolve: (value: T) => void;
  reject: (err: Error) => void;
};

type PendingBridgeWait = {
  waitId: string;
  expectedRuntimeId?: string;
  startedAt: number;
  resolve: () => void;
  reject: (err: Error) => void;
};

export interface RuntimeInstance {
  key: string;
  id: string;
  label: string;
  ws: WebSocket;
  hostingMode: "cloud" | "local";
  organizationId?: string;
  ownerUserId?: string;
  bridgeRuntimeId?: string;
  supportedTools: string[];
  protocolVersion?: number;
  /** Repo IDs this runtime has locally registered. Cloud runtimes use empty (supports all). */
  registeredRepoIds: string[];
  lastHeartbeat: number;
  connectionGeneration: string;
  connectedAt?: Date | null;
  boundSessions: Set<string>;
  /**
   * Sessions that received a run/send command on this live runtime connection.
   * Heartbeat reconciliation only considers these sessions so restored DB
   * bindings after a bridge reconnect cannot silently complete a run whose
   * local process state was lost.
   */
  commandDeliveredSessions?: Set<string>;
  /**
   * Cache of linked-checkout status per repo, populated as the bridge responds
   * to status/action requests. Lets queries like `BridgeRuntime.linkedCheckouts`
   * answer without a per-call WebSocket round-trip.
   */
  linkedCheckouts: Map<string, BridgeLinkedCheckoutStatus>;
  linkedCheckoutObservedAt: Map<string, number>;
}

export type RuntimeMetadata = RuntimeInstance | RuntimeDescriptor;

export interface StaleRuntimeSnapshot {
  runtimeId: string;
  runtimeInstanceId: string;
  organizationId?: string;
  sessionIds: string[];
  lastHeartbeat: number;
  connectedAt?: Date | null;
  /** Fences the eviction against a reconnect that reused this runtime id. */
  connectionGeneration: string;
}

export interface StaleRuntimeEvictionResult {
  evicted: boolean;
  affectedSessions: string[];
}

export interface SessionAdapterCreateOptions {
  sessionId: string;
  /** Session group ID — used to key worktrees so all sessions in a group share the same workspace. */
  sessionGroupId?: string;
  sessionGroupKind?: "general" | "coding" | "design" | "app";
  prepareAppGit?: (runtimeInstanceId: string) => Promise<{
    repoId: string;
    repoRemoteUrl: string;
    defaultBranch: string;
  }>;
  /** Animal slug for the worktree. If set, reuses the existing slug. */
  slug?: string;
  /** Preserve the persisted branch name instead of generating trace/{slug}. */
  preserveBranchName?: boolean;
  tool: string;
  model?: string;
  reasoningEffort?: string;
  repo?: { id: string; name: string; remoteUrl: string | null; defaultBranch: string } | null;
  /** Named launcher runtime profile from the repo's setup config. */
  runtimeProfile?: string;
  branch?: string;
  baseCommitSha?: string;
  createdById: string;
  organizationId: string;
  readOnly?: boolean;
  /** Absolute path to an existing worktree to adopt instead of creating one (local only). */
  adoptWorktreePath?: string;
  adapterType?: RuntimeAdapterType;
  /** Persisted local bridge selected as this session's authorized home. */
  expectedHomeRuntimeId?: string;
  runtimeToken?: string;
  bridgeUrl?: string;
  environment?: {
    id: string;
    name: string;
    adapterType: RuntimeAdapterType;
    config: Prisma.JsonValue;
  } | null;
}

export type RuntimeLifecycleUpdate = {
  runtimeInstanceId?: string;
  runtimeLabel?: string;
  providerRuntimeId?: string;
  providerRuntimeUrl?: string;
  providerStatus?: string;
  runtimeHardDeadlineAt?: string;
  providerDeadlineEnforcementId?: string;
  error?: string;
  artifact?: ActionRequiredArtifact;
  /**
   * Set on `session_runtime_deprovision_failed` to mark the runtime
   * permanently abandoned (cap exhausted). Suppresses retry flags so the
   * reconciler stops touching the session and lets operator alerts fire.
   */
  abandoned?: boolean;
  /** Reconcile attempt count at the moment of abandonment. */
  reconcileAttempts?: number;
};

export type RuntimeLifecycleEventType = Extract<
  EventType,
  | "session_runtime_start_requested"
  | "session_runtime_provisioning"
  | "session_runtime_connecting"
  | "session_runtime_connected"
  | "session_runtime_start_failed"
  | "session_runtime_start_timed_out"
  | "session_runtime_stopping"
  | "session_runtime_stopped"
  | "session_runtime_deprovision_failed"
>;

export function runtimeRouterKey(runtimeInstanceId: string, organizationId: string): string {
  return `${organizationId}:${runtimeInstanceId}`;
}

function adapterTypeFromHosting(
  hosting: string,
  runtimeAdapters: RuntimeAdapterRegistry,
): RuntimeAdapterType {
  if (hosting === "cloud") return "provisioned";
  if (hosting === "local") return "local";
  return runtimeAdapters.get(hosting).type;
}

async function resolveUserRuntimeTokens(
  userId: string,
  options: { includeCodexAccessToken: boolean },
): Promise<{
  userGithubToken?: string;
  userCodexAccessToken?: string;
  userCodexAuthMethod?: "chatgpt_session" | "access_token" | "api_key";
  userCodexCredential?: string;
}> {
  try {
    const [tokens, codexCredential] = await Promise.all([
      apiTokenService.getDecryptedTokens(userId),
      options.includeCodexAccessToken
        ? codexCredentialService.getDecryptedCredential(userId)
        : Promise.resolve(null),
    ]);
    return {
      userGithubToken: tokens.github,
      userCodexAccessToken:
        options.includeCodexAccessToken && !codexCredential ? tokens.codex_access_token : undefined,
      userCodexAuthMethod: codexCredential?.method,
      userCodexCredential: codexCredential?.credential,
    };
  } catch (err) {
    // Fall back to launcher/runtime-side auth on transient lookup failures
    // (DB blip, decryption error) instead of aborting the session start.
    logAgentEnvironmentTelemetry("user_runtime_token_lookup_failed", {
      userId,
      includeCodexAccessToken: options.includeCodexAccessToken,
      message: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

function connectionRecord(connection: unknown): Record<string, unknown> | null {
  if (!connection || typeof connection !== "object" || Array.isArray(connection)) return null;
  return connection as Record<string, unknown>;
}

function connectionEnvironmentId(connection: Record<string, unknown> | null): string | null {
  const environmentId = connection?.environmentId;
  return typeof environmentId === "string" && environmentId.trim() ? environmentId : null;
}

function environmentConfigRecord(environment?: RuntimeEnvironment | null): Record<string, unknown> {
  const config = environment?.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  return config as Record<string, unknown>;
}

function optionalConnectionString(
  connection: Record<string, unknown> | null,
  key: string,
): string | undefined {
  const value = connection?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function runtimeResponseMatches(expectedRuntimeId: string, sourceRuntimeId: string): boolean {
  return expectedRuntimeId === sourceRuntimeId || sourceRuntimeId.endsWith(`:${expectedRuntimeId}`);
}

function linkedCheckoutSnapshot(status: BridgeLinkedCheckoutStatus): BridgeLinkedCheckoutStatus {
  return { ...status, changedFiles: [] };
}

function lifecycleSnapshotFromConnection(
  connection: Record<string, unknown> | null,
): RuntimeLifecycleUpdate {
  const snapshot: RuntimeLifecycleUpdate = {};
  const runtimeInstanceId = optionalConnectionString(connection, "runtimeInstanceId");
  if (runtimeInstanceId) snapshot.runtimeInstanceId = runtimeInstanceId;
  const runtimeLabel = optionalConnectionString(connection, "runtimeLabel");
  if (runtimeLabel) snapshot.runtimeLabel = runtimeLabel;
  const providerRuntimeId = optionalConnectionString(connection, "providerRuntimeId");
  if (providerRuntimeId) snapshot.providerRuntimeId = providerRuntimeId;
  const providerRuntimeUrl = optionalConnectionString(connection, "providerRuntimeUrl");
  if (providerRuntimeUrl) snapshot.providerRuntimeUrl = providerRuntimeUrl;
  const runtimeHardDeadlineAt = optionalConnectionString(connection, "runtimeHardDeadlineAt");
  if (runtimeHardDeadlineAt) snapshot.runtimeHardDeadlineAt = runtimeHardDeadlineAt;
  const providerDeadlineEnforcementId = optionalConnectionString(
    connection,
    "providerDeadlineEnforcementId",
  );
  if (providerDeadlineEnforcementId) {
    snapshot.providerDeadlineEnforcementId = providerDeadlineEnforcementId;
  }
  return snapshot;
}

function startupTimeoutMs(environment?: RuntimeEnvironment | null): number {
  const rawSeconds = environmentConfigRecord(environment).startupTimeoutSeconds;
  if (typeof rawSeconds === "number" && Number.isInteger(rawSeconds) && rawSeconds > 0) {
    return rawSeconds * 1000;
  }
  return 120_000;
}

function deprovisionPolicy(environment?: RuntimeEnvironment | null): string | null {
  const policy = environmentConfigRecord(environment).deprovisionPolicy;
  return typeof policy === "string" && policy.trim() ? policy : null;
}

function shouldSkipProvisionedStopForPolicy(
  adapter: RuntimeAdapter,
  environment: RuntimeEnvironment | null,
  reason: string,
): boolean {
  if (adapter.type !== "provisioned") return false;
  if (deprovisionPolicy(environment) !== "manual") return false;
  return (
    reason !== "deprovision_reconciliation" &&
    reason !== "idle_session_group_cleanup" &&
    reason !== "session_moved_to_local"
  );
}

/**
 * Runtime-aware registry that tracks runtime instances, their capabilities,
 * and which sessions they own. Replaces the old bridge-only socket map.
 */
export class SessionRouter {
  constructor(private readonly runtimeAdapters = runtimeAdapterRegistry) {
    this.unsubscribers.push(
      realtimeBackplane.on("runtime_command", (envelope) => this.receiveRuntimeCommand(envelope)),
      realtimeBackplane.on("runtime_command_ack", (envelope) =>
        this.receiveRuntimeCommandAck(envelope),
      ),
    );
    this.unsubscribers.push(
      runtimeDirectory.onPresence((message) => {
        if (message.action !== "upsert") return;
        this.rejectSupersededRequests(
          message.descriptor.key,
          message.descriptor.connectionGeneration,
        );
        const localRuntime = this.runtimes.get(message.descriptor.key);
        if (
          localRuntime &&
          localRuntime.connectionGeneration !== message.descriptor.connectionGeneration
        ) {
          this.runtimes.delete(message.descriptor.key);
          if (localRuntime.ws.readyState === localRuntime.ws.OPEN) {
            localRuntime.ws.close(1012, "Runtime ownership replaced");
          }
        }
        for (const [sessionId, pending] of this.pendingWaits) {
          if (pending.expectedRuntimeId && pending.expectedRuntimeId !== message.descriptor.id)
            continue;
          // Presence is only a prompt to ask the named owner. The broadcast
          // may be stale, and registration publishes it just before the owner
          // installs the socket in its local map, so defer the confirmation to
          // the next turn.
          setTimeout(() => {
            void this.resolvePendingBridgeWait(sessionId, pending, message.descriptor);
          }, 0);
        }
      }),
    );
  }

  private readonly unsubscribers: Array<() => void> = [];
  private runtimes = new Map<string, RuntimeInstance>();
  /** Maps sessionId → runtimeId */
  private sessionRuntime = new Map<string, string>();
  /** Pending waitForBridge promises for cloud sessions */
  private pendingWaits = new Map<string, PendingBridgeWait>();
  private pendingRemoteDeliveries = new Map<
    string,
    {
      runtimeKey: string;
      connectionGeneration: string;
      ownerReplicaId: string;
      resolve: (result: DeliveryResult) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private pendingRuntimeRequests = new Map<string, PendingRuntimeRequest<unknown>>();

  dispose(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    for (const pending of this.pendingRemoteDeliveries.values()) {
      clearTimeout(pending.timer);
      pending.resolve("delivery_failed");
    }
    this.pendingRemoteDeliveries.clear();
  }
  private runtimeCommandQueues = new Map<string, Promise<void>>();
  /** Pending branch list requests: requestId → resolve/reject */
  private pendingBranchRequests = new Map<
    string,
    { runtimeId: string; resolve: (branches: string[]) => void; reject: (err: Error) => void }
  >();
  /** Pending workspace slug requests: requestId → resolve/reject */
  private pendingWorkspaceSlugRequests = new Map<
    string,
    { runtimeId: string; resolve: (slugs: string[]) => void; reject: (err: Error) => void }
  >();
  /** Pending worktree list requests: requestId → resolve/reject */
  private pendingWorktreeListRequests = new Map<
    string,
    {
      runtimeId: string;
      resolve: (worktrees: BridgeRepoWorktree[]) => void;
      reject: (err: Error) => void;
    }
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
  /** Pending file write requests: requestId → resolve/reject */
  private pendingFileWriteRequests = new Map<
    string,
    { runtimeId: string; resolve: () => void; reject: (err: Error) => void }
  >();
  /** Pending file commit requests: requestId → resolve/reject */
  private pendingFileCommitRequests = new Map<
    string,
    { runtimeId: string; resolve: (commitSha: string) => void; reject: (err: Error) => void }
  >();
  private pendingWorktreeChangesRequests = new Map<
    string,
    {
      runtimeId: string;
      resolve: (result: BridgeWorktreeChangesPayload) => void;
      reject: (err: Error) => void;
    }
  >();
  private pendingRevertWorktreeFileRequests = new Map<
    string,
    { runtimeId: string; resolve: () => void; reject: (err: Error) => void }
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
  private pendingLinkedCheckoutChangedFileRequests = new Map<
    string,
    {
      runtimeId: string;
      resolve: (file: BridgeLinkedCheckoutChangedFilePreview) => void;
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
  /** Pending session current-branch requests: requestId → resolve/reject */
  private pendingSessionCurrentBranchRequests = new Map<
    string,
    {
      runtimeId: string;
      resolve: (branch: string | null) => void;
      reject: (err: Error) => void;
    }
  >();

  /** Heartbeat timeout in ms — if no heartbeat in this window, runtime is considered stale */
  static HEARTBEAT_TIMEOUT_MS = 30_000;
  /**
   * Directory lease duration. Kept well above HEARTBEAT_TIMEOUT_MS so a single
   * slow or dropped heartbeat cannot expire the lease of a live runtime — at
   * 45_000 the margin was 1.5x and one late beat was enough to make a healthy
   * bridge look offline. Stale *local* sockets are still evicted on the
   * HEARTBEAT_TIMEOUT_MS cadence by checkStaleRuntimes.
   */
  static DIRECTORY_TTL_MS = 120_000;
  static LINKED_CHECKOUT_SNAPSHOT_REFRESH_MS = 30_000;
  static LINKED_CHECKOUT_SNAPSHOT_TTL_MS = 120_000;

  async registerRuntime(runtime: {
    key?: string;
    id: string;
    label: string;
    ws: WebSocket;
    hostingMode: "cloud" | "local";
    organizationId?: string;
    ownerUserId?: string;
    bridgeRuntimeId?: string;
    supportedTools: string[];
    protocolVersion?: number;
    registeredRepoIds?: string[];
    connectedAt?: Date | null;
  }): Promise<boolean> {
    const runtimeKey = runtime.key ?? runtime.id;
    const existing = this.runtimes.get(runtimeKey);
    const boundSessions = existing?.boundSessions ?? new Set<string>();
    const commandDeliveredSessions =
      existing && existing.ws === runtime.ws
        ? (existing.commandDeliveredSessions ?? new Set<string>())
        : new Set<string>();
    const sameConnection = existing?.ws === runtime.ws;
    const linkedCheckouts = sameConnection
      ? existing.linkedCheckouts
      : new Map<string, BridgeLinkedCheckoutStatus>();
    const linkedCheckoutObservedAt = sameConnection
      ? existing.linkedCheckoutObservedAt
      : new Map<string, number>();
    const pendingDescriptor = runtimeDirectory.createDescriptor(
      {
        key: runtimeKey,
        id: runtime.id,
        organizationId: runtime.organizationId ?? existing?.organizationId,
        label: runtime.label,
        hostingMode: runtime.hostingMode,
        ownerUserId: runtime.ownerUserId ?? existing?.ownerUserId,
        bridgeRuntimeId: runtime.bridgeRuntimeId ?? existing?.bridgeRuntimeId,
        supportedTools: runtime.supportedTools,
        protocolVersion: runtime.protocolVersion,
        registeredRepoIds: runtime.registeredRepoIds ?? existing?.registeredRepoIds ?? [],
        linkedCheckoutStatuses: [...linkedCheckouts.values()].map(linkedCheckoutSnapshot),
        linkedCheckoutStatusObservedAt: Object.fromEntries(linkedCheckoutObservedAt),
      },
      SessionRouter.DIRECTORY_TTL_MS,
    );
    const descriptor = realtimeBackplane.enabled
      ? await runtimeDirectory.register(pendingDescriptor, SessionRouter.DIRECTORY_TTL_MS)
      : runtimeDirectory.registerLocal(pendingDescriptor);
    if (
      runtimeDirectory.get(runtimeKey)?.connectionGeneration !== descriptor.connectionGeneration
    ) {
      if (runtime.ws.readyState === runtime.ws.OPEN) {
        runtime.ws.close(1012, "Runtime ownership replaced");
      }
      return false;
    }
    if (existing && existing.ws !== runtime.ws) {
      this.rejectSupersededRequests(runtimeKey, descriptor.connectionGeneration);
      runtimeDebug("replacing runtime websocket", {
        runtimeId: runtime.id,
        previousLabel: existing.label,
        previousReadyState: existing.ws.readyState,
        preservedBoundSessions: [...boundSessions],
      });
      if (existing.ws.readyState === existing.ws.OPEN) {
        existing.ws.close(1012, "Runtime ownership replaced");
      }
    }
    this.runtimes.set(runtimeKey, {
      ...runtime,
      key: runtimeKey,
      organizationId: runtime.organizationId ?? existing?.organizationId,
      ownerUserId: runtime.ownerUserId ?? existing?.ownerUserId,
      bridgeRuntimeId: runtime.bridgeRuntimeId ?? existing?.bridgeRuntimeId,
      registeredRepoIds: runtime.registeredRepoIds ?? existing?.registeredRepoIds ?? [],
      lastHeartbeat: Date.now(),
      connectionGeneration: descriptor.connectionGeneration,
      boundSessions,
      commandDeliveredSessions,
      linkedCheckouts,
      linkedCheckoutObservedAt,
      connectedAt: runtime.connectedAt,
    });
    this.linkedCheckoutRefreshAfter.set(
      runtimeKey,
      Date.now() + SessionRouter.LINKED_CHECKOUT_SNAPSHOT_REFRESH_MS,
    );
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
    return true;
  }

  recordHeartbeat(runtimeId: string, ws?: WebSocket): boolean {
    const runtime = this.getRuntime(runtimeId);
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
    void runtimeDirectory
      .renew(runtime.key, runtime.connectionGeneration, SessionRouter.DIRECTORY_TTL_MS)
      .then((renewed) => {
        if (renewed || runtime.ws.readyState !== runtime.ws.OPEN) return;
        // renew() fails both when a peer took the lease and when the lease
        // simply expired. Try to reclaim before killing a live bridge —
        // reclaimDirectoryEntry closes the socket itself if a peer really owns
        // the key now.
        void this.reclaimDirectoryEntry(runtime);
      })
      .catch((error) => console.error("[runtime-directory] heartbeat renewal failed:", error));
    this.refreshLinkedCheckoutSnapshots(runtime);
    return true;
  }

  private linkedCheckoutRefreshAfter = new Map<string, number>();
  private directoryReclaims = new Map<string, Promise<LocalOwnershipResult>>();

  private refreshLinkedCheckoutSnapshots(runtime: RuntimeInstance): void {
    if (runtime.hostingMode !== "local" || runtime.registeredRepoIds.length === 0) return;
    const now = Date.now();
    if ((this.linkedCheckoutRefreshAfter.get(runtime.key) ?? 0) > now) return;
    this.linkedCheckoutRefreshAfter.set(
      runtime.key,
      now + SessionRouter.LINKED_CHECKOUT_SNAPSHOT_REFRESH_MS,
    );
    void Promise.allSettled(
      runtime.registeredRepoIds.map((repoId) =>
        this.getLinkedCheckoutStatus(runtime.key, repoId, 10_000),
      ),
    );
  }

  /** Add a newly linked repo to a runtime's registeredRepoIds (called when bridge sends repo_linked). */
  addRegisteredRepo(runtimeId: string, repoId: string, ws?: WebSocket): void {
    const runtime = this.getRuntime(runtimeId);
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
      void runtimeDirectory
        .updateRegisteredRepoIds(
          runtime.key,
          runtime.connectionGeneration,
          runtime.registeredRepoIds,
          SessionRouter.DIRECTORY_TTL_MS,
        )
        .catch((error) => console.error("[runtime-directory] repo update failed:", error));
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
  async waitForBridge(
    sessionId: string,
    timeoutMs = 60_000,
    runtimeId?: string,
    organizationId?: string | null,
  ): Promise<void> {
    const candidateRuntimeId = runtimeId ?? this.sessionRuntime.get(sessionId);
    if (candidateRuntimeId) {
      const resolution = await this.resolveRuntime(candidateRuntimeId, organizationId);
      if (resolution.state !== "unreachable") {
        const runtime = resolution.state === "local" ? resolution.runtime : resolution.descriptor;
        this.bindSession(sessionId, runtime.key);
        return;
      }
    }

    return new Promise<void>((resolve, reject) => {
      const waitId = randomUUID();
      const startedAt = Date.now();
      const timer = setTimeout(() => {
        const pending = this.pendingWaits.get(sessionId);
        if (pending?.waitId === waitId) {
          this.pendingWaits.delete(sessionId);
        }
        logAgentEnvironmentTelemetry("bridge.connection_timeout", {
          sessionId,
          runtimeInstanceId: runtimeId,
          timeoutMs,
          latencyMs: Date.now() - startedAt,
        });
        reject(new Error(`Bridge for session ${sessionId} did not connect within ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingWaits.set(sessionId, {
        waitId,
        expectedRuntimeId: runtimeId,
        startedAt,
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

  private async resolvePendingBridgeWait(
    sessionId: string,
    pending: PendingBridgeWait,
    descriptor: Pick<RuntimeDescriptor, "id" | "organizationId">,
  ): Promise<void> {
    if (this.pendingWaits.get(sessionId) !== pending) return;
    const resolution = await this.resolveRuntime(descriptor.id, descriptor.organizationId);
    if (resolution.state === "unreachable" || this.pendingWaits.get(sessionId) !== pending) return;
    const runtime = resolution.state === "local" ? resolution.runtime : resolution.descriptor;
    this.bindSession(sessionId, runtime.key);
    this.completePendingBridgeWait(sessionId, pending, runtime.key);
  }

  private completePendingBridgeWait(
    sessionId: string,
    pending: PendingBridgeWait,
    runtimeId: string,
  ): void {
    if (this.pendingWaits.get(sessionId) !== pending) return;
    this.pendingWaits.delete(sessionId);
    logAgentEnvironmentTelemetry("bridge.connected", {
      sessionId,
      runtimeInstanceId: runtimeId,
      expectedRuntimeId: pending.expectedRuntimeId,
      latencyMs: Date.now() - pending.startedAt,
    });
    pending.resolve();
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
    this.rejectRuntimeRequests(runtime.key, new Error("Runtime connection closed"));
    for (const sessionId of affectedSessions) {
      this.sessionRuntime.delete(sessionId);
    }
    this.runtimes.delete(runtimeId);
    this.linkedCheckoutRefreshAfter.delete(runtime.key);
    void runtimeDirectory
      .remove(runtime.key, runtime.connectionGeneration)
      .catch((error) => console.error("[runtime-directory] failed to unregister runtime:", error));
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
    const resolvedRuntime = this.getRuntime(runtimeId);
    const runtimeKey = resolvedRuntime?.key ?? runtimeId;
    const previousRuntimeId = this.sessionRuntime.get(sessionId);
    if (previousRuntimeId && previousRuntimeId !== runtimeKey) {
      const previousRuntime = this.runtimes.get(previousRuntimeId);
      previousRuntime?.boundSessions.delete(sessionId);
    }
    this.sessionRuntime.set(sessionId, runtimeKey);
    const runtime = this.runtimes.get(runtimeKey);
    if (runtime) {
      runtime.boundSessions.add(sessionId);
    }
    runtimeDebug("bound session to runtime", {
      sessionId,
      runtimeId: runtimeKey,
      previousRuntimeId,
      boundSessions: runtime ? [...runtime.boundSessions] : [],
    });

    // A binding records routing intent; it is not proof that a socket exists.
    // Confirm the local owner before completing bridge readiness.
    const pending = this.pendingWaits.get(sessionId);
    if (pending) {
      if (
        pending.expectedRuntimeId &&
        !runtimeResponseMatches(pending.expectedRuntimeId, runtimeKey)
      ) {
        runtimeDebug("pending bridge wait ignored mismatched runtime", {
          sessionId,
          expectedRuntimeId: pending.expectedRuntimeId,
          receivedRuntimeId: runtimeId,
        });
        return;
      }
      if (runtime) {
        void this.resolvePendingBridgeWait(sessionId, pending, runtime);
      }
    }
  }

  unbindSession(sessionId: string) {
    const runtimeId = this.sessionRuntime.get(sessionId);
    if (runtimeId) {
      const runtime = this.runtimes.get(runtimeId);
      if (runtime) {
        runtime.boundSessions.delete(sessionId);
        runtime.commandDeliveredSessions?.delete(sessionId);
      }
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
    const runtime = this.runtimes.get(runtimeId);
    return runtime && this.isCurrentLocalOwner(runtime) ? runtime : undefined;
  }

  getBoundSessionIds(runtimeId: string): string[] {
    return [...(this.runtimes.get(runtimeId)?.boundSessions ?? [])];
  }

  getHeartbeatReconcileSessionIds(runtimeId: string): string[] {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) return [];
    return [...(runtime.commandDeliveredSessions ?? [])].filter((sessionId) =>
      runtime.boundSessions.has(sessionId),
    );
  }

  getRuntime(runtimeId: string, organizationId?: string | null): RuntimeInstance | undefined {
    const key = organizationId ? runtimeRouterKey(runtimeId, organizationId) : runtimeId;
    const direct = this.runtimes.get(key);
    if (direct) return direct;

    const matches = [...this.runtimes.values()].filter(
      (runtime) =>
        runtime.id === runtimeId &&
        (organizationId == null || runtime.organizationId === organizationId),
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

  isCurrentRuntimeSocket(runtimeId: string, ws: WebSocket): boolean {
    return this.getCurrentRuntimeConnectionGeneration(runtimeId, ws) !== undefined;
  }

  getCurrentRuntimeConnectionGeneration(runtimeId: string, ws: WebSocket): string | undefined {
    const runtime = this.runtimes.get(runtimeId);
    return runtime && runtime.ws === ws && this.isCurrentLocalOwner(runtime)
      ? runtime.connectionGeneration
      : undefined;
  }

  async confirmCurrentRuntimeSocket(runtimeId: string, ws: WebSocket): Promise<string | undefined> {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime || runtime.ws !== ws || !(await this.confirmCurrentLocalOwner(runtime))) {
      return undefined;
    }
    return runtime.connectionGeneration;
  }

  isRuntimeGenerationCurrent(runtimeId: string, connectionGeneration: string): boolean {
    return runtimeDirectory.get(runtimeId)?.connectionGeneration === connectionGeneration;
  }

  private isCurrentLocalOwner(
    runtime: RuntimeInstance,
    descriptor = runtimeDirectory.find(runtime.id, runtime.organizationId),
  ): boolean {
    if (!descriptor) {
      // An absent directory entry means the lease lapsed, not that someone else
      // owns the runtime: a peer taking over writes its own descriptor rather
      // than deleting ours. So "absent" is "unknown", and while our socket is
      // open we are still the owner. Disowning here let the replica holding a
      // healthy bridge report it offline — which on the cloud retry path moved
      // the session onto a fresh runtime and discarded its workspace.
      if (runtime.ws.readyState === runtime.ws.OPEN) {
        this.reclaimDirectoryEntry(runtime);
        return true;
      }
      return !realtimeBackplane.enabled;
    }
    return (
      descriptor.ownerReplicaId === realtimeBackplane.replicaId &&
      descriptor.connectionGeneration === runtime.connectionGeneration
    );
  }

  /**
   * Rebuild this runtime's directory descriptor from live socket state,
   * preserving `connectionGeneration` so existing bindings stay valid.
   */
  private descriptorFor(runtime: RuntimeInstance): RuntimeDescriptor {
    return {
      ...runtimeDirectory.createDescriptor(
        {
          key: runtime.key,
          id: runtime.id,
          organizationId: runtime.organizationId,
          label: runtime.label,
          hostingMode: runtime.hostingMode,
          ownerUserId: runtime.ownerUserId,
          bridgeRuntimeId: runtime.bridgeRuntimeId,
          supportedTools: runtime.supportedTools,
          protocolVersion: runtime.protocolVersion,
          registeredRepoIds: runtime.registeredRepoIds,
          linkedCheckoutStatuses: [...runtime.linkedCheckouts.values()].map(linkedCheckoutSnapshot),
          linkedCheckoutStatusObservedAt: Object.fromEntries(runtime.linkedCheckoutObservedAt),
        },
        SessionRouter.DIRECTORY_TTL_MS,
      ),
      connectionGeneration: runtime.connectionGeneration,
    };
  }

  /**
   * Heal a lapsed directory lease for a socket we still hold. Concurrent calls
   * are coalesced so a burst of lookups cannot stampede Redis. If a peer has
   * genuinely taken the lease, close our socket so the bridge reconnects to
   * the real owner instead of serving state from a replica that no longer owns
   * it.
   */
  private reclaimDirectoryEntry(runtime: RuntimeInstance): Promise<LocalOwnershipResult> {
    const pending = this.directoryReclaims.get(runtime.key);
    if (pending) return pending;

    const reclaim = runtimeDirectory
      .reclaim(this.descriptorFor(runtime), SessionRouter.DIRECTORY_TTL_MS)
      .then((reclaimed) => {
        if (reclaimed) {
          runtimeDebug("reclaimed lapsed runtime directory lease", {
            runtimeId: runtime.id,
            connectionGeneration: runtime.connectionGeneration,
          });
          return "owned" as const;
        }
        this.disownRuntime(runtime);
        return "superseded" as const;
      })
      .catch((error) => {
        console.error("[runtime-directory] lapsed lease reclaim failed:", error);
        return "unreachable" as const;
      })
      .finally(() => {
        if (this.directoryReclaims.get(runtime.key) === reclaim) {
          this.directoryReclaims.delete(runtime.key);
        }
      });
    this.directoryReclaims.set(runtime.key, reclaim);
    return reclaim;
  }

  /** Drop a socket this replica no longer owns, failing anything waiting on it. */
  private disownRuntime(runtime: RuntimeInstance): void {
    this.rejectRuntimeRequests(runtime.key, new Error("Runtime ownership replaced"));
    if (this.runtimes.get(runtime.key)?.ws === runtime.ws) {
      this.runtimes.delete(runtime.key);
    }
    if (runtime.ws.readyState === runtime.ws.OPEN) {
      runtime.ws.close(1012, "Runtime ownership replaced");
    }
  }

  /**
   * Authoritative check that this replica may still write to a socket it holds.
   *
   * The absent case is the one that matters: a peer taking over writes its own
   * descriptor rather than deleting ours, so a missing entry is a lapsed lease
   * and the socket is still ours to reclaim. Reading absence as a takeover here
   * closed live bridges — `recordHeartbeat` and `isCurrentLocalOwner` already
   * applied the right rule, this path did not, and that asymmetry produced
   * phantom disconnects on runtimes that never died.
   */
  private async confirmCurrentLocalOwner(runtime: RuntimeInstance): Promise<boolean> {
    const status = await runtimeDirectory.ownershipStatus(
      runtime.key,
      runtime.connectionGeneration,
      realtimeBackplane.replicaId,
    );
    if (status === "owned") return true;
    // A directory we cannot read is neither permission to write nor evidence
    // of a takeover. Keep the socket, but defer delivery until ownership can be
    // fenced again; this prevents split-brain during a one-replica partition.
    if (status === "unknown") return false;
    if (status === "absent") {
      if (runtime.ws.readyState === runtime.ws.OPEN) {
        return (await this.reclaimDirectoryEntry(runtime)) === "owned";
      }
      if (!realtimeBackplane.enabled) return true;
    }
    this.disownRuntime(runtime);
    return false;
  }

  /**
   * The single authority on "can I reach this runtime right now".
   *
   * Every dispatch and every irreversible decision goes through here. The
   * answer is a fact owned by the replica holding the socket, not an inference
   * assembled from whichever sources a given caller happened to consult — five
   * separate combinations of the local map, the mirror and Redis used to
   * disagree, and each disagreement surfaced as a live bridge reported offline.
   *
   * Directory state is routing information, not proof of liveness. A missing
   * lease may belong to a live socket that is reclaiming it, and a descriptor
   * may outlive its socket. Delivery is confirmed by the named owner; only that
   * owner's socket-close path may persist an offline state.
   */
  async resolveRuntime(
    runtimeId: string,
    organizationId?: string | null,
  ): Promise<RuntimeResolution> {
    const local = this.getRuntime(runtimeId, organizationId);
    if (local && (await this.confirmCurrentLocalOwner(local))) {
      if (local.ws.readyState === local.ws.OPEN) return { state: "local", runtime: local };
    }

    // No deliverable socket here. A mirror entry naming a peer is only a route
    // candidate; the named replica must confirm it still holds the socket. If
    // the mirror is missing or names us, it is provably stale and must be read
    // through to Redis before there is anyone to probe.
    const mirrored = runtimeDirectory.find(runtimeId, organizationId);
    // A missing directory entry is never an offline verdict: a live owner may
    // be atomically reclaiming a lapsed lease. Without a route, callers defer.
    if (!realtimeBackplane.enabled) return { state: "unreachable" };

    let descriptor: RuntimeDescriptor | undefined =
      mirrored?.ownerReplicaId !== realtimeBackplane.replicaId ? mirrored : undefined;
    if (!descriptor && !organizationId) return { state: "unreachable" };
    try {
      descriptor ??= await runtimeDirectory.lookup(runtimeId, organizationId, {
        bypassCache: Boolean(mirrored),
      });
    } catch (error) {
      console.error("[session-router] authoritative runtime lookup failed:", error);
      return { state: "unreachable" };
    }
    if (!descriptor || descriptor.ownerReplicaId === realtimeBackplane.replicaId) {
      return { state: "unreachable" };
    }
    const confirmed = await this.confirmRemoteOwner(descriptor);
    return confirmed ? { state: "remote", descriptor: confirmed } : { state: "unreachable" };
  }

  /**
   * Cache-only view of runtime presence, for rendering rather than deciding.
   *
   * This is `resolveRuntime`'s fast path without the authoritative read, and it
   * can be wrong: a replica that missed a presence broadcast reports a live
   * peer-owned runtime as absent. That is acceptable for a status dot and never
   * acceptable for a decision. If a wrong answer here would move a session,
   * rebuild a workspace, or tell a user their bridge is offline, use
   * `resolveRuntime` instead.
   */
  peekRuntimePresence(runtimeId: string, organizationId?: string | null): boolean {
    const descriptor = runtimeDirectory.find(runtimeId, organizationId);
    const runtime = this.getRuntime(runtimeId, organizationId);
    if (runtime && this.isCurrentLocalOwner(runtime, descriptor)) {
      return runtime.ws.readyState === runtime.ws.OPEN;
    }
    return descriptor !== undefined;
  }

  getRuntimeDescriptor(
    runtimeId: string,
    organizationId?: string | null,
  ): RuntimeDescriptor | undefined {
    return runtimeDirectory.find(runtimeId, organizationId);
  }

  getRuntimeMetadata(
    runtimeId: string,
    organizationId?: string | null,
  ): RuntimeMetadata | undefined {
    const descriptor = runtimeDirectory.find(runtimeId, organizationId);
    const runtime = this.getRuntime(runtimeId, organizationId);
    return runtime && this.isCurrentLocalOwner(runtime, descriptor) ? runtime : descriptor;
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
  async sendAsync(
    sessionId: string,
    command: SessionCommand,
    options?: { expectedHomeRuntimeId?: string; organizationId?: string | null },
  ): Promise<DeliveryResult> {
    const expectedHomeId = options?.expectedHomeRuntimeId;
    if (expectedHomeId) {
      const resolution = await this.resolveRuntime(expectedHomeId, options?.organizationId);
      const rejected = this.dispatchTo(resolution, command);
      if (rejected !== null) return rejected;
      if (resolution.state === "local") {
        // Force the in-memory binding to match the persisted home so we never
        // dispatch to a stale (possibly hijacked) runtime.
        this.bindSession(sessionId, resolution.runtime.key);
        return this.writeToRuntime(resolution.runtime, command, sessionId);
      }
      if (resolution.state === "remote") {
        return this.relayToOwner(
          resolution.descriptor,
          command as unknown as Record<string, unknown>,
        );
      }
      return "delivery_failed";
    }

    // A binding is only a route candidate. The socket may have reconnected on
    // another replica since it was recorded, so it goes through the same owner
    // authority as an explicitly pinned runtime.
    const boundKey = this.sessionRuntime.get(sessionId);
    if (!boundKey) return "no_runtime";
    const resolution = await this.resolveRuntime(boundKey, options?.organizationId);
    const rejected = this.dispatchTo(resolution, command);
    if (rejected !== null) return rejected;
    if (resolution.state === "local") {
      return this.writeToRuntime(resolution.runtime, command, sessionId);
    }
    if (resolution.state === "remote") {
      return this.relayToOwner(
        resolution.descriptor,
        command as unknown as Record<string, unknown>,
      );
    }
    return "delivery_failed";
  }

  /** Find a connected runtime that has a given repo registered (or any cloud runtime). */
  getRuntimeForRepo(repoId: string): RuntimeInstance | undefined {
    for (const runtime of this.runtimes.values()) {
      if (!this.isCurrentLocalOwner(runtime)) continue;
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
      if (!this.isCurrentLocalOwner(runtime)) continue;
      if (runtime.ws.readyState !== runtime.ws.OPEN) continue;
      if (filter?.hostingMode && runtime.hostingMode !== filter.hostingMode) continue;
      results.push(runtime);
    }
    return results;
  }

  /**
   * List connected runtime metadata across every replica. Local runtime
   * instances replace their directory descriptors so callers on the socket
   * owner can still use richer process-local state without hiding runtimes
   * connected elsewhere.
   */
  listRuntimeMetadata(filter?: { hostingMode?: string }): RuntimeMetadata[] {
    const results = new Map<string, RuntimeMetadata>();
    for (const descriptor of runtimeDirectory.list(filter)) {
      results.set(descriptor.key, descriptor);
    }
    for (const runtime of this.listRuntimes(filter)) {
      const descriptor = runtimeDirectory.get(runtime.key);
      if (!descriptor || this.isCurrentLocalOwner(runtime, descriptor)) {
        results.set(runtime.key, runtime);
      }
    }
    return [...results.values()];
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
          runtimeInstanceId: runtime.id,
          organizationId: runtime.organizationId,
          sessionIds: [...runtime.boundSessions],
          lastHeartbeat: runtime.lastHeartbeat,
          connectedAt: runtime.connectedAt,
          connectionGeneration: runtime.connectionGeneration,
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
      commandDeliveredSessions: [...(runtime.commandDeliveredSessions ?? [])],
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
  async sendToRuntimeAsync(
    runtimeId: string,
    command: Record<string, unknown>,
    organizationId?: string | null,
  ): Promise<DeliveryResult> {
    const resolution = await this.resolveRuntime(runtimeId, organizationId);
    const dispatch = this.dispatchTo(resolution, command);
    if (dispatch !== null) return dispatch;

    if (resolution.state === "local") return this.writeToRuntime(resolution.runtime, command);
    if (resolution.state === "remote") {
      return this.relayToOwner(resolution.descriptor, command);
    }
    return "delivery_failed";
  }

  /** Write to a socket `resolveRuntime` has already confirmed is ours and current. */
  private writeToRuntime(
    runtime: RuntimeInstance,
    command: SessionCommand | Record<string, unknown>,
    sessionId?: string,
  ): DeliveryResult {
    // Transport, not a verdict: the socket closed between resolution and this
    // write, which does not tell us the bridge is gone — it may be reconnecting
    // to a peer right now. A delivery path never declares a runtime offline.
    if (runtime.ws.readyState !== runtime.ws.OPEN) return "delivery_failed";
    try {
      runtime.ws.send(JSON.stringify(command));
      const type = (command as { type?: unknown }).type;
      if (sessionId && (type === "run" || type === "send")) {
        runtime.commandDeliveredSessions ??= new Set<string>();
        runtime.commandDeliveredSessions.add(sessionId);
      }
      return "delivered";
    } catch {
      return "delivery_failed";
    }
  }

  /**
   * Capability checks that must not depend on which replica took the request.
   * Applied against whichever of the runtime or its descriptor we resolved —
   * both carry the same values, copied at registration.
   */
  private dispatchTo(
    resolution: RuntimeResolution,
    command: SessionCommand | Record<string, unknown>,
  ): DeliveryResult | null {
    const target =
      resolution.state === "local"
        ? resolution.runtime
        : resolution.state === "remote"
          ? resolution.descriptor
          : null;
    if (!target) return null;

    const fields = command as Record<string, unknown>;
    const requiredTool = typeof fields.tool === "string" ? fields.tool : undefined;
    if (requiredTool && !target.supportedTools.includes(requiredTool)) {
      // The runtime doesn't speak the requested tool. We used to silently
      // rebind to any connected runtime that did — that's a cross-tenant
      // dispatch, so we now fail and let the caller resolve a proper home
      // runtime via the authorized-runtime-selection path.
      return "no_runtime";
    }
    if (
      fields.type === "prepare_app" &&
      (fields.designSystemPackage || fields.sourceRepository) &&
      (target.protocolVersion ?? 1) < 2
    ) {
      return "unsupported_runtime";
    }
    return null;
  }

  /** Hand a command to the replica that owns the socket and await its ack. */
  private async relayToOwner(
    descriptor: RuntimeDescriptor,
    command: Record<string, unknown>,
    confirmOnly = false,
  ): Promise<DeliveryResult> {
    const deliveryId = randomUUID();
    const timeoutMs = Number(process.env.TRACE_RUNTIME_COMMAND_TIMEOUT_MS) || 3_000;
    const result = new Promise<DeliveryResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRemoteDeliveries.delete(deliveryId);
        resolve("delivery_failed");
      }, timeoutMs);
      this.pendingRemoteDeliveries.set(deliveryId, {
        runtimeKey: descriptor.key,
        connectionGeneration: descriptor.connectionGeneration,
        ownerReplicaId: descriptor.ownerReplicaId,
        resolve,
        timer,
      });
    });
    try {
      const routedCommand =
        typeof command.requestId === "string"
          ? {
              ...command,
              requestId: correlatedResponseRelay.routeRequestId(
                command.type as string,
                command.requestId,
              ),
            }
          : command;
      await realtimeBackplane.send(descriptor.ownerReplicaId, "runtime_command", {
        deliveryId,
        runtimeKey: descriptor.key,
        organizationId: descriptor.organizationId,
        connectionGeneration: descriptor.connectionGeneration,
        command: routedCommand,
        confirmOnly,
      });
    } catch {
      const pending = this.pendingRemoteDeliveries.get(deliveryId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRemoteDeliveries.delete(deliveryId);
        pending.resolve("delivery_failed");
      }
    }
    return result;
  }

  /**
   * Turn a directory route into an owner-authoritative fact.
   *
   * `runtime_command` is used instead of a new backplane message so this is
   * safe during rolling deploys. An older owner will forward the deliberately
   * unknown command to the bridge (where it is ignored) and acknowledge the
   * socket write; a current owner validates without writing to the socket.
   */
  private async confirmRemoteOwner(
    descriptor: RuntimeDescriptor,
  ): Promise<RuntimeDescriptor | undefined> {
    const check = { type: "runtime_route_check" };
    if ((await this.relayToOwner(descriptor, check, true)) === "delivered") {
      return descriptor;
    }
    if (!descriptor.organizationId) return undefined;

    let current: RuntimeDescriptor | undefined;
    try {
      current = await runtimeDirectory.lookup(descriptor.id, descriptor.organizationId, {
        bypassCache: true,
      });
    } catch {
      return undefined;
    }
    if (
      !current ||
      current.ownerReplicaId === realtimeBackplane.replicaId ||
      (current.ownerReplicaId === descriptor.ownerReplicaId &&
        current.connectionGeneration === descriptor.connectionGeneration)
    ) {
      return undefined;
    }
    return (await this.relayToOwner(current, check, true)) === "delivered" ? current : undefined;
  }

  private receiveRuntimeCommand(envelope: BackplaneEnvelope): void {
    const payload = envelope.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
    const input = payload as Record<string, unknown>;
    if (
      typeof input.deliveryId !== "string" ||
      typeof input.runtimeKey !== "string" ||
      typeof input.connectionGeneration !== "string" ||
      !input.command ||
      typeof input.command !== "object" ||
      Array.isArray(input.command)
    ) {
      return;
    }

    const previous = this.runtimeCommandQueues.get(input.runtimeKey) ?? Promise.resolve();
    const delivery = previous
      .catch(() => undefined)
      .then(async () => {
        const runtime = this.runtimes.get(input.runtimeKey as string);
        // `delivery_failed`, not `runtime_disconnected`: this replica failing to
        // deliver locally is exactly the non-authoritative answer this design
        // removed. The bridge may have just reconnected somewhere else, and the
        // requesting replica re-resolves on its next attempt.
        let result: DeliveryResult = "delivery_failed";
        if (
          runtime &&
          runtime.connectionGeneration === input.connectionGeneration &&
          runtime.ws.readyState === runtime.ws.OPEN &&
          (await this.confirmCurrentLocalOwner(runtime))
        ) {
          result =
            input.confirmOnly === true
              ? "delivered"
              : this.writeToRuntime(runtime, input.command as Record<string, unknown>);
        }
        await realtimeBackplane.send(envelope.sourceReplicaId, "runtime_command_ack", {
          deliveryId: input.deliveryId,
          result,
        });
      });
    this.runtimeCommandQueues.set(input.runtimeKey, delivery);
    const finish = () => {
      if (this.runtimeCommandQueues.get(input.runtimeKey as string) === delivery) {
        this.runtimeCommandQueues.delete(input.runtimeKey as string);
      }
    };
    void delivery.then(finish, (error: unknown) => {
      console.error("[session-router] runtime command acknowledgement failed:", error);
      finish();
    });
  }

  private receiveRuntimeCommandAck(envelope: BackplaneEnvelope): void {
    const payload = envelope.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
    const input = payload as Record<string, unknown>;
    if (typeof input.deliveryId !== "string" || typeof input.result !== "string") return;
    const pending = this.pendingRemoteDeliveries.get(input.deliveryId);
    if (!pending || pending.ownerReplicaId !== envelope.sourceReplicaId) return;
    clearTimeout(pending.timer);
    this.pendingRemoteDeliveries.delete(input.deliveryId);
    // `runtime_disconnected` is deliberately not accepted over the wire. A
    // replica still running the previous build may send one, so a rolling
    // deploy degrades it to a retry rather than an offline verdict.
    const allowed: DeliveryResult[] = [
      "delivered",
      "no_runtime",
      "session_unbound",
      "unsupported_runtime",
      "delivery_failed",
    ];
    pending.resolve(
      allowed.includes(input.result as DeliveryResult)
        ? (input.result as DeliveryResult)
        : "delivery_failed",
    );
  }

  /** Register reply correlation before delivery so a fast bridge response cannot be lost. */
  private requestRuntimeResponse<T>(
    runtimeId: string,
    command: Record<string, unknown>,
    pendingRequests: Map<string, PendingRuntimeRequest<T>>,
    timeoutMs: number,
    timeoutMessage: string,
    organizationId?: string | null,
    responseRuntimeId = runtimeId,
  ): Promise<T> {
    const requestId = randomUUID();
    const connectionGeneration = runtimeDirectory.find(
      runtimeId,
      organizationId,
    )?.connectionGeneration;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.get(requestId)?.reject(new Error(timeoutMessage));
      }, timeoutMs);
      const pending: PendingRuntimeRequest<T> = {
        runtimeId: responseRuntimeId,
        connectionGeneration,
        resolve: (value) => {
          clearTimeout(timer);
          pendingRequests.delete(requestId);
          this.pendingRuntimeRequests.delete(requestId);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          pendingRequests.delete(requestId);
          this.pendingRuntimeRequests.delete(requestId);
          reject(error);
        },
      };
      pendingRequests.set(requestId, pending);
      this.pendingRuntimeRequests.set(
        requestId,
        pending as unknown as PendingRuntimeRequest<unknown>,
      );

      void this.sendToRuntimeAsync(runtimeId, { ...command, requestId }, organizationId)
        .then((result) => {
          if (result === "delivered" || pendingRequests.get(requestId) !== pending) return;
          pending.reject(new Error(`Runtime not available: ${result}`));
        })
        .catch((error: unknown) => {
          if (pendingRequests.get(requestId) !== pending) return;
          pending.reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  private rejectSupersededRequests(runtimeKey: string, connectionGeneration: string): void {
    for (const pending of [...this.pendingRuntimeRequests.values()]) {
      if (
        pending.connectionGeneration &&
        pending.connectionGeneration !== connectionGeneration &&
        runtimeResponseMatches(pending.runtimeId, runtimeKey)
      ) {
        pending.reject(new Error("Runtime ownership replaced"));
      }
    }
    for (const [deliveryId, pending] of this.pendingRemoteDeliveries) {
      if (
        pending.runtimeKey === runtimeKey &&
        pending.connectionGeneration !== connectionGeneration
      ) {
        clearTimeout(pending.timer);
        this.pendingRemoteDeliveries.delete(deliveryId);
        // A new generation means the bridge reconnected, not that it died. The
        // in-flight delivery was superseded and is worth retrying.
        pending.resolve("delivery_failed");
      }
    }
  }

  private rejectRuntimeRequests(runtimeKey: string, error: Error): void {
    for (const pending of [...this.pendingRuntimeRequests.values()]) {
      if (runtimeResponseMatches(pending.runtimeId, runtimeKey)) pending.reject(error);
    }
  }

  /**
   * Ask a runtime to list branches for a given repo.
   * Returns a promise that resolves when the bridge responds with branches_result.
   */
  listBranches(runtimeId: string, repoId: string, timeoutMs = 10_000): Promise<string[]> {
    return this.requestRuntimeResponse(
      runtimeId,
      {
        type: "list_branches",
        repoId,
      },
      this.pendingBranchRequests,
      timeoutMs,
      "Branch list request timed out",
    );
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
    if (sourceRuntimeId && !runtimeResponseMatches(pending.runtimeId, sourceRuntimeId)) return;
    this.pendingBranchRequests.delete(requestId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(branches);
    }
  }

  /**
   * Ask a runtime to list workspace slugs already in use for a repo.
   * Used before durable session-group slug allocation so local bridge state
   * participates in the server-owned reservation.
   */
  async listWorkspaceSlugs(
    runtimeId: string,
    repoId: string,
    organizationId?: string | null,
    timeoutMs = 10_000,
  ): Promise<string[]> {
    const resolution = await this.resolveRuntime(runtimeId, organizationId);
    if (resolution.state === "unreachable") {
      throw new Error("Runtime not available: delivery_failed");
    }
    const runtime = resolution.state === "local" ? resolution.runtime : resolution.descriptor;
    return this.requestRuntimeResponse(
      runtimeId,
      { type: "list_workspace_slugs", repoId },
      this.pendingWorkspaceSlugRequests,
      timeoutMs,
      "Workspace slug request timed out",
      organizationId,
      runtime.key,
    );
  }

  resolveWorkspaceSlugRequest(
    requestId: string,
    slugs: string[],
    error?: string,
    sourceRuntimeId?: string,
  ): void {
    const pending = this.pendingWorkspaceSlugRequests.get(requestId);
    if (!pending) return;
    if (sourceRuntimeId && !runtimeResponseMatches(pending.runtimeId, sourceRuntimeId)) return;
    this.pendingWorkspaceSlugRequests.delete(requestId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(slugs);
    }
  }

  /** Ask a runtime to list the on-disk git worktrees for a repo. */
  async listRepoWorktrees(
    runtimeId: string,
    repoId: string,
    organizationId?: string | null,
    timeoutMs = 10_000,
  ): Promise<BridgeRepoWorktree[]> {
    const resolution = await this.resolveRuntime(runtimeId, organizationId);
    if (resolution.state === "unreachable") {
      throw new Error("Runtime not available: delivery_failed");
    }
    const runtime = resolution.state === "local" ? resolution.runtime : resolution.descriptor;
    return this.requestRuntimeResponse(
      runtimeId,
      { type: "list_worktrees", repoId },
      this.pendingWorktreeListRequests,
      timeoutMs,
      "Worktree list request timed out",
      organizationId,
      runtime.key,
    );
  }

  resolveWorktreeListRequest(
    requestId: string,
    worktrees: BridgeRepoWorktree[],
    error?: string,
    sourceRuntimeId?: string,
  ): void {
    const pending = this.pendingWorktreeListRequests.get(requestId);
    if (!pending) return;
    if (sourceRuntimeId && !runtimeResponseMatches(pending.runtimeId, sourceRuntimeId)) return;
    this.pendingWorktreeListRequests.delete(requestId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(worktrees);
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
    return this.requestRuntimeResponse(
      runtimeId,
      { type: "list_files", sessionId, workdirHint },
      this.pendingFileRequests,
      timeoutMs,
      "File list request timed out",
    );
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
    if (sourceRuntimeId && !runtimeResponseMatches(pending.runtimeId, sourceRuntimeId)) return;
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
    return this.requestRuntimeResponse(
      runtimeId,
      { type: "read_file", sessionId, relativePath, workdirHint },
      this.pendingFileContentRequests,
      timeoutMs,
      "File read request timed out",
    );
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
    if (sourceRuntimeId && !runtimeResponseMatches(pending.runtimeId, sourceRuntimeId)) return;
    this.pendingFileContentRequests.delete(requestId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(content);
    }
  }

  /**
   * Ask a runtime to write a file's contents to its live workspace.
   */
  writeFile(
    runtimeId: string,
    sessionId: string,
    relativePath: string,
    content: string,
    workdirHint?: string,
    expectedContent?: string,
    timeoutMs = 15_000,
  ): Promise<void> {
    return this.requestRuntimeResponse(
      runtimeId,
      {
        type: expectedContent === undefined ? "write_file" : "write_file_guarded",
        sessionId,
        relativePath,
        content,
        workdirHint,
        ...(expectedContent === undefined ? {} : { expectedContent }),
      },
      this.pendingFileWriteRequests,
      timeoutMs,
      "File write request timed out",
    );
  }

  /** Resolve a pending file write request (called from bridge handler). */
  resolveFileWriteRequest(requestId: string, error?: string, sourceRuntimeId?: string): void {
    const pending = this.pendingFileWriteRequests.get(requestId);
    if (!pending) return;
    if (sourceRuntimeId && !runtimeResponseMatches(pending.runtimeId, sourceRuntimeId)) return;
    this.pendingFileWriteRequests.delete(requestId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve();
    }
  }

  /**
   * Ask a runtime to commit the current file changes in its live workspace.
   */
  commitFileChanges(
    runtimeId: string,
    sessionId: string,
    message?: string | null,
    workdirHint?: string,
    paths?: string[],
    timeoutMs = 60_000,
  ): Promise<string> {
    return this.requestRuntimeResponse(
      runtimeId,
      {
        type: paths?.length ? "commit_scoped_file_changes" : "commit_file_changes",
        sessionId,
        message,
        workdirHint,
        ...(paths?.length ? { paths } : {}),
      },
      this.pendingFileCommitRequests,
      timeoutMs,
      "File commit request timed out",
    );
  }

  /** Resolve a pending file commit request (called from bridge handler). */
  resolveFileCommitRequest(
    requestId: string,
    commitSha?: string,
    error?: string,
    sourceRuntimeId?: string,
  ): void {
    const pending = this.pendingFileCommitRequests.get(requestId);
    if (!pending) return;
    if (sourceRuntimeId && !runtimeResponseMatches(pending.runtimeId, sourceRuntimeId)) return;
    this.pendingFileCommitRequests.delete(requestId);
    if (error) {
      pending.reject(new Error(error));
    } else if (commitSha) {
      pending.resolve(commitSha);
    } else {
      pending.reject(new Error("File commit did not return a commit SHA"));
    }
  }

  listWorktreeChanges(
    runtimeId: string,
    sessionId: string,
    workdirHint?: string,
    timeoutMs = 15_000,
  ): Promise<BridgeWorktreeChangesPayload> {
    return this.requestRuntimeResponse(
      runtimeId,
      { type: "worktree_changes", sessionId, workdirHint },
      this.pendingWorktreeChangesRequests,
      timeoutMs,
      "Worktree changes request timed out",
    );
  }

  resolveWorktreeChangesRequest(
    requestId: string,
    files: BridgeLinkedCheckoutChangedFile[],
    totalCount: number,
    truncated: boolean,
    error?: string,
    sourceRuntimeId?: string,
  ): void {
    const pending = this.pendingWorktreeChangesRequests.get(requestId);
    if (!pending) return;
    if (sourceRuntimeId && !runtimeResponseMatches(pending.runtimeId, sourceRuntimeId)) return;
    this.pendingWorktreeChangesRequests.delete(requestId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve({ files, totalCount, truncated });
    }
  }

  revertWorktreeFile(
    runtimeId: string,
    sessionId: string,
    filePath: string,
    workdirHint?: string,
    timeoutMs = 15_000,
  ): Promise<void> {
    return this.requestRuntimeResponse(
      runtimeId,
      { type: "revert_worktree_file", sessionId, filePath, workdirHint },
      this.pendingRevertWorktreeFileRequests,
      timeoutMs,
      "Revert file request timed out",
    );
  }

  resolveRevertWorktreeFileRequest(
    requestId: string,
    error?: string,
    sourceRuntimeId?: string,
  ): void {
    const pending = this.pendingRevertWorktreeFileRequests.get(requestId);
    if (!pending) return;
    if (sourceRuntimeId && !runtimeResponseMatches(pending.runtimeId, sourceRuntimeId)) return;
    this.pendingRevertWorktreeFileRequests.delete(requestId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve();
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
    return this.requestRuntimeResponse(
      runtimeId,
      { type: "branch_diff", sessionId, baseBranch, workdirHint },
      this.pendingBranchDiffRequests,
      timeoutMs,
      "Branch diff request timed out",
    );
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
    if (sourceRuntimeId && !runtimeResponseMatches(pending.runtimeId, sourceRuntimeId)) return;
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
    return this.requestRuntimeResponse(
      runtimeId,
      { type: "file_at_ref", sessionId, filePath, ref, workdirHint },
      this.pendingFileAtRefRequests,
      timeoutMs,
      "File at ref request timed out",
    );
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
    if (sourceRuntimeId && !runtimeResponseMatches(pending.runtimeId, sourceRuntimeId)) return;
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
    return this.requestRuntimeResponse(
      runtimeId,
      { type: "list_skills", sessionId, workdirHint, includeUserSkills, includeProjectSkills },
      this.pendingSkillsRequests,
      timeoutMs,
      "Skills list request timed out",
    );
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
    if (sourceRuntimeId && !runtimeResponseMatches(pending.runtimeId, sourceRuntimeId)) return;
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
    return this.requestRuntimeResponse(
      runtimeId,
      { type: "linked_checkout_status", repoId },
      this.pendingLinkedCheckoutStatusRequests,
      timeoutMs,
      "Linked checkout status request timed out",
    );
  }

  resolveLinkedCheckoutStatusRequest(
    requestId: string,
    status: BridgeLinkedCheckoutStatus,
    sourceRuntimeId?: string,
  ): void {
    const pending = this.pendingLinkedCheckoutStatusRequests.get(requestId);
    if (!pending) return;
    if (sourceRuntimeId && !runtimeResponseMatches(pending.runtimeId, sourceRuntimeId)) return;
    this.pendingLinkedCheckoutStatusRequests.delete(requestId);
    this.cacheLinkedCheckoutStatus(pending.runtimeId, status);
    pending.resolve(status);
  }

  getLinkedCheckoutChangedFile(
    runtimeId: string,
    repoId: string,
    filePath: string,
    timeoutMs = 15_000,
  ): Promise<BridgeLinkedCheckoutChangedFilePreview> {
    return this.requestRuntimeResponse(
      runtimeId,
      { type: "linked_checkout_changed_file", repoId, filePath },
      this.pendingLinkedCheckoutChangedFileRequests,
      timeoutMs,
      "Linked checkout changed file request timed out",
    );
  }

  resolveLinkedCheckoutChangedFileRequest(
    requestId: string,
    file?: BridgeLinkedCheckoutChangedFilePreview,
    error?: string,
    sourceRuntimeId?: string,
  ): void {
    const pending = this.pendingLinkedCheckoutChangedFileRequests.get(requestId);
    if (!pending) return;
    if (sourceRuntimeId && !runtimeResponseMatches(pending.runtimeId, sourceRuntimeId)) return;
    this.pendingLinkedCheckoutChangedFileRequests.delete(requestId);
    if (error || !file) {
      pending.reject(new Error(error ?? "Missing linked checkout changed file"));
    } else {
      pending.resolve(file);
    }
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
    runtime.linkedCheckoutObservedAt.set(status.repoId, Date.now());
  }

  recordLinkedCheckoutStatus(
    runtimeId: string,
    status: BridgeLinkedCheckoutStatus,
    ws?: WebSocket,
  ): boolean {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime || (ws && runtime.ws !== ws) || !this.isCurrentLocalOwner(runtime)) return false;
    runtime.linkedCheckouts.set(status.repoId, status);
    runtime.linkedCheckoutObservedAt.set(status.repoId, Date.now());
    void runtimeDirectory
      .updateLinkedCheckoutStatus(
        runtime.key,
        runtime.connectionGeneration,
        linkedCheckoutSnapshot(status),
        SessionRouter.DIRECTORY_TTL_MS,
      )
      .catch((error) => console.error("[runtime-directory] linked checkout update failed:", error));
    return true;
  }

  isLinkedCheckoutStatusFresh(runtime: RuntimeMetadata, repoId: string): boolean {
    const observedAt =
      "ws" in runtime
        ? runtime.linkedCheckoutObservedAt.get(repoId)
        : runtime.linkedCheckoutStatusObservedAt[repoId];
    return (
      typeof observedAt === "number" &&
      Date.now() - observedAt <= SessionRouter.LINKED_CHECKOUT_SNAPSHOT_TTL_MS
    );
  }

  private requestLinkedCheckoutAction(
    runtimeId: string,
    command: Record<string, unknown>,
    timeoutMs = 30_000,
  ): Promise<BridgeLinkedCheckoutActionResultPayload> {
    return this.requestRuntimeResponse(
      runtimeId,
      command,
      this.pendingLinkedCheckoutActionRequests,
      timeoutMs,
      "Linked checkout action request timed out",
    );
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
      refreshBeforeSync?: boolean;
      conflictStrategy?: "discard" | "commit" | "rebase" | "stash";
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
        refreshBeforeSync: input.refreshBeforeSync,
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
    if (sourceRuntimeId && !runtimeResponseMatches(pending.runtimeId, sourceRuntimeId)) return;
    this.pendingLinkedCheckoutActionRequests.delete(requestId);
    if (result.status) this.cacheLinkedCheckoutStatus(pending.runtimeId, result.status);
    pending.resolve(result);
  }

  inspectSessionCurrentBranch(
    runtimeId: string,
    input: {
      sessionId: string;
      workdirHint?: string | null;
    },
    timeoutMs = 5_000,
  ): Promise<string | null> {
    return this.requestRuntimeResponse(
      runtimeId,
      {
        type: "session_current_branch",
        sessionId: input.sessionId,
        workdirHint: input.workdirHint ?? undefined,
      },
      this.pendingSessionCurrentBranchRequests,
      timeoutMs,
      "Session current branch request timed out",
    );
  }

  resolveSessionCurrentBranchRequest(
    requestId: string,
    branch?: string | null,
    error?: string,
    sourceRuntimeId?: string,
  ): void {
    const pending = this.pendingSessionCurrentBranchRequests.get(requestId);
    if (!pending) return;
    if (sourceRuntimeId && !runtimeResponseMatches(pending.runtimeId, sourceRuntimeId)) return;
    this.pendingSessionCurrentBranchRequests.delete(requestId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(branch ?? null);
    }
  }

  inspectSessionGitSyncStatus(
    runtimeId: string,
    input: {
      sessionId: string;
      workdirHint?: string | null;
    },
    timeoutMs = 15_000,
  ): Promise<BridgeSessionGitSyncStatus> {
    return this.requestRuntimeResponse(
      runtimeId,
      {
        type: "session_git_sync_status",
        sessionId: input.sessionId,
        workdirHint: input.workdirHint ?? undefined,
      },
      this.pendingSessionGitSyncStatusRequests,
      timeoutMs,
      "Session git sync status request timed out",
    );
  }

  resolveSessionGitSyncStatusRequest(
    requestId: string,
    status?: BridgeSessionGitSyncStatus,
    error?: string,
    sourceRuntimeId?: string,
  ): void {
    const pending = this.pendingSessionGitSyncStatusRequests.get(requestId);
    if (!pending) return;
    if (sourceRuntimeId && !runtimeResponseMatches(pending.runtimeId, sourceRuntimeId)) return;
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
      /**
       * Claim this session's next runtime generation and return the runtime
       * instance id the claim created. `null` means a live runtime already owns
       * the session — a concurrent provision won the race, so this one must
       * stop rather than start competing compute. Required for provisioned
       * adapters; local adapters select an already-registered bridge instead.
       */
      reserveRuntime?: () => Promise<string | null>;
      onLifecycle?: (
        eventType: RuntimeLifecycleEventType,
        update?: RuntimeLifecycleUpdate,
      ) => Promise<void> | void;
    },
  ): void {
    const adapterType =
      options.adapterType ?? adapterTypeFromHosting(options.hosting, this.runtimeAdapters);
    const adapter = this.runtimeAdapters.get(adapterType);

    void (async () => {
      try {
        // Reserving is what mints the identity, so a second provision for this
        // session cannot invent a competing runtime id and then fail a session
        // the winner is already serving. Losing the claim means the session
        // already has a live runtime: converge on it and start nothing.
        let provisionedRuntimeInstanceId: string | undefined;
        if (adapterType === "provisioned") {
          if (!options.reserveRuntime) {
            throw new Error("Provisioned runtime creation requires a reservation callback");
          }
          provisionedRuntimeInstanceId = (await options.reserveRuntime()) ?? undefined;
          if (!provisionedRuntimeInstanceId) {
            console.warn(
              `[runtime-adapter] skipping provisioned start for ${options.sessionId}: another runtime already owns this session`,
            );
            return;
          }
        }

        const userRuntimeTokens =
          adapterType === "provisioned"
            ? await resolveUserRuntimeTokens(options.createdById, {
                includeCodexAccessToken: options.tool === "codex",
              })
            : {};

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
          reasoningEffort: options.reasoningEffort,
          repo: options.repo,
          runtimeProfile: options.runtimeProfile,
          branch: options.branch,
          baseCommitSha: options.baseCommitSha,
          readOnly: options.readOnly,
          runtimeInstanceId: provisionedRuntimeInstanceId,
          runtimeToken: options.runtimeToken,
          bridgeUrl: options.bridgeUrl,
          userGithubToken: userRuntimeTokens.userGithubToken,
          userCodexAccessToken: userRuntimeTokens.userCodexAccessToken,
          userCodexAuthMethod: userRuntimeTokens.userCodexAuthMethod,
          userCodexCredential: userRuntimeTokens.userCodexCredential,
        });

        if (startResult.runtimeInstanceId && adapterType !== "provisioned") {
          this.bindSession(options.sessionId, startResult.runtimeInstanceId);
        }

        if (adapterType === "provisioned" && startResult.runtimeInstanceId) {
          const lifecycleUpdate = {
            runtimeInstanceId: startResult.runtimeInstanceId,
            ...(startResult.runtimeLabel && { runtimeLabel: startResult.runtimeLabel }),
            ...(startResult.providerRuntimeId && {
              providerRuntimeId: startResult.providerRuntimeId,
            }),
            ...(startResult.providerRuntimeUrl && {
              providerRuntimeUrl: startResult.providerRuntimeUrl,
            }),
            ...(startResult.runtimeHardDeadlineAt && {
              runtimeHardDeadlineAt: startResult.runtimeHardDeadlineAt,
            }),
            ...(startResult.providerDeadlineEnforcementId && {
              providerDeadlineEnforcementId: startResult.providerDeadlineEnforcementId,
            }),
            providerStatus: startResult.status,
          } satisfies RuntimeLifecycleUpdate;
          if (startResult.status !== "selected") {
            await options.onLifecycle?.("session_runtime_provisioning", lifecycleUpdate);
          }
          if (startResult.status === "connecting" || startResult.status === "connected") {
            await options.onLifecycle?.("session_runtime_connecting", lifecycleUpdate);
          }

          try {
            const bridgeWaitStartedAt = Date.now();
            await this.waitForBridge(
              options.sessionId,
              startupTimeoutMs(options.environment),
              startResult.runtimeInstanceId,
              options.organizationId,
            );
            logAgentEnvironmentTelemetry("provisioned.bridge_ready", {
              organizationId: options.organizationId,
              sessionId: options.sessionId,
              environmentId: options.environment?.id,
              runtimeInstanceId: startResult.runtimeInstanceId,
              latencyMs: Date.now() - bridgeWaitStartedAt,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logAgentEnvironmentTelemetry("provisioned.startup_timeout", {
              organizationId: options.organizationId,
              sessionId: options.sessionId,
              environmentId: options.environment?.id,
              runtimeInstanceId: startResult.runtimeInstanceId,
              error: message,
            });
            await options.onLifecycle?.("session_runtime_start_timed_out", {
              ...lifecycleUpdate,
              error: message,
            });
            await this.cleanupFailedProvisionedStart(adapter, {
              sessionId: options.sessionId,
              organizationId: options.organizationId,
              environment: options.environment ?? null,
              lifecycleUpdate,
              onLifecycle: options.onLifecycle,
            });
            options.onFailed(`${adapterType} runtime timed out: ${message}`);
            return;
          }

          await options.onLifecycle?.("session_runtime_connected", lifecycleUpdate);
        }

        const expectedHomeRuntimeId =
          startResult.runtimeInstanceId ?? options.expectedHomeRuntimeId;

        if (options.sessionGroupKind === "app") {
          const runtimeInstanceId = startResult.runtimeInstanceId;
          if (!runtimeInstanceId || !options.prepareAppGit) {
            options.onFailed("App managed git credentials are unavailable");
            return;
          }
          const appGit = await options.prepareAppGit(runtimeInstanceId);
          const result = await this.sendAsync(
            options.sessionId,
            {
              type: "prepare_app",
              sessionId: options.sessionId,
              sessionGroupId: options.sessionGroupId,
              slug: options.slug,
              baseCommitSha: options.baseCommitSha,
              ...appGit,
            },
            { expectedHomeRuntimeId, organizationId: options.organizationId },
          );
          if (result !== "delivered") {
            options.onFailed(`prepare_app: ${result}`);
          }
          return;
        }

        // A linked repository is context for a general session, not permission
        // to place the agent in a writable checkout. General sessions always
        // start in their disposable scratch directory and convert before coding.
        if (options.sessionGroupKind === "general") {
          const runtimeId = expectedHomeRuntimeId ?? this.sessionRuntime.get(options.sessionId);
          const resolution = runtimeId
            ? await this.resolveRuntime(runtimeId, options.organizationId)
            : { state: "unreachable" as const };
          if (resolution.state === "unreachable") {
            options.onFailed("prepare_general: delivery_failed");
            return;
          }
          const runtime = resolution.state === "local" ? resolution.runtime : resolution.descriptor;
          if ((runtime?.protocolVersion ?? 1) < GENERAL_WORKSPACE_PROTOCOL_VERSION) {
            options.onFailed(
              "This Trace runtime is too old to create an isolated workspace. Upgrade it before retrying this session.",
            );
            return;
          }
          const result = await this.sendAsync(
            options.sessionId,
            {
              type: "prepare_general",
              sessionId: options.sessionId,
              sessionGroupId: options.sessionGroupId,
            },
            {
              expectedHomeRuntimeId,
              organizationId: options.organizationId,
            },
          );
          if (result !== "delivered") options.onFailed(`prepare_general: ${result}`);
          return;
        }

        if (options.repo) {
          const result = await this.sendAsync(
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
              baseCommitSha: options.baseCommitSha,
              readOnly: options.readOnly,
              adoptWorktreePath: options.adoptWorktreePath,
            },
            { expectedHomeRuntimeId, organizationId: options.organizationId },
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
        if (adapterType === "provisioned") {
          await options.onLifecycle?.("session_runtime_start_failed", {
            error: message,
            ...(err instanceof ActionRequiredError ? { artifact: err.artifact } : {}),
          });
        }
        options.onFailed(`${adapterType} runtime failed: ${message}`);
      }
    })();
  }

  private async cleanupFailedProvisionedStart(
    adapter: RuntimeAdapter,
    input: {
      sessionId: string;
      organizationId: string;
      environment: RuntimeEnvironment | null;
      lifecycleUpdate: RuntimeLifecycleUpdate;
      onLifecycle?: (
        eventType: RuntimeLifecycleEventType,
        update?: RuntimeLifecycleUpdate,
      ) => Promise<void> | void;
    },
  ): Promise<void> {
    if (adapter.type !== "provisioned") return;
    if (!input.lifecycleUpdate.providerRuntimeId) return;
    if (shouldSkipProvisionedStopForPolicy(adapter, input.environment, "startup_timeout")) return;

    await input.onLifecycle?.("session_runtime_stopping", input.lifecycleUpdate);
    try {
      const stopResult = await this.attemptStopSession(
        adapter,
        {
          sessionId: input.sessionId,
          organizationId: input.organizationId,
          environment: input.environment,
          connection: input.lifecycleUpdate as Record<string, unknown>,
          reason: "startup_timeout",
        },
        1,
      );
      if (stopResult.status === "stopped" || stopResult.status === "not_found") {
        await input.onLifecycle?.("session_runtime_stopped", {
          ...input.lifecycleUpdate,
          providerStatus: stopResult.status,
        });
      } else if (stopResult.status === "unsupported") {
        await input.onLifecycle?.("session_runtime_deprovision_failed", {
          ...input.lifecycleUpdate,
          error: stopResult.message ?? "Runtime adapter cannot stop timed-out startup",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await input.onLifecycle?.("session_runtime_deprovision_failed", {
        ...input.lifecycleUpdate,
        error: message,
      });
    }
  }

  /**
   * Destroy a session's runtime. Delegates to the correct adapter.
   *
   * Lifecycle (provisioned): stopping → deprovisioned (or deprovision_failed).
   * Lifecycle (local): stopping → stopped. Local stop cleans only
   * Trace-created session resources and never deprovisions the desktop
   * bridge.
   *
   * If the launcher returns `status: "stopping"` (async cleanup pending), the
   * connection stays in `stopping` and the reconciler retries via the
   * idempotent stopUrl call.
   */
  async destroyRuntime(
    sessionId: string,
    session: {
      hosting: string;
      organizationId?: string;
      sessionGroupId?: string | null;
      workdir?: string | null;
      repoId?: string | null;
      connection?: unknown;
    },
    options?: {
      reason?: string;
      onLifecycle?: (
        eventType: RuntimeLifecycleEventType,
        update?: RuntimeLifecycleUpdate,
      ) => Promise<void> | void;
      maxStopAttempts?: number;
      skipBridgeDelete?: boolean;
      skipUnbind?: boolean;
    },
  ): Promise<void> {
    const adapterType =
      typeof connectionRecord(session.connection)?.adapterType === "string"
        ? (connectionRecord(session.connection)?.adapterType as string)
        : adapterTypeFromHosting(session.hosting, this.runtimeAdapters);
    const adapter = this.runtimeAdapters.get(adapterType);
    const connection = connectionRecord(session.connection);
    const environment = await this.resolveRuntimeEnvironment(connection);
    const reason = options?.reason ?? "session_deleted";
    const lifecycleSnapshot = lifecycleSnapshotFromConnection(connection);
    const skipProviderStop = shouldSkipProvisionedStopForPolicy(adapter, environment, reason);

    if (options?.skipBridgeDelete !== true) {
      const expectedHomeRuntimeId = optionalConnectionString(connection, "runtimeInstanceId");
      const deliveryResult = await this.sendAsync(
        sessionId,
        {
          type: "delete",
          sessionId,
          workdir: session.workdir,
          repoId: session.repoId,
          sessionGroupId: session.sessionGroupId ?? undefined,
        },
        { expectedHomeRuntimeId, organizationId: session.organizationId },
      );
      if (deliveryResult !== "delivered" && adapter.type === "local") {
        console.warn(
          `[local-adapter] bridge did not receive delete for ${sessionId}: ${deliveryResult}`,
        );
      }
    }

    if (skipProviderStop) {
      if (options?.skipUnbind !== true) {
        this.unbindSession(sessionId);
      }
      runtimeDebug("skipped provisioned runtime stop due to manual deprovision policy", {
        sessionId,
        reason,
        environmentId: environment?.id ?? null,
      });
      return;
    }

    await options?.onLifecycle?.("session_runtime_stopping", lifecycleSnapshot);

    try {
      const stopResult = await this.attemptStopSession(
        adapter,
        {
          sessionId,
          organizationId: session.organizationId,
          environment,
          connection,
          reason,
        },
        options?.maxStopAttempts ?? 3,
      );
      // status=stopping means the launcher kicked off async cleanup; the
      // compute is not yet gone. Leave the connection in `stopping` so the
      // reconciler picks it up and re-checks via the idempotent stopUrl.
      // Only emit `stopped` when compute is actually gone (or never existed).
      if (stopResult.status === "stopped" || stopResult.status === "not_found") {
        await options?.onLifecycle?.("session_runtime_stopped", {
          ...lifecycleSnapshot,
          providerStatus: stopResult.status,
        });
      } else if (stopResult.status === "unsupported") {
        // Adapter cannot stop (e.g., environment metadata missing). Treat as a
        // deprovision failure so it surfaces to the operator instead of silently
        // looping.
        await options?.onLifecycle?.("session_runtime_deprovision_failed", {
          ...lifecycleSnapshot,
          error: stopResult.message ?? "Runtime adapter cannot stop this session",
        });
      }
      // status=stopping → leave in stopping; reconciler retries.
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[runtime-adapter] stop failed for ${sessionId}: ${message}`);
      await options?.onLifecycle?.("session_runtime_deprovision_failed", {
        ...lifecycleSnapshot,
        error: message,
      });
    } finally {
      if (options?.skipUnbind !== true) {
        this.unbindSession(sessionId);
      }
    }
  }

  private async attemptStopSession(
    adapter: { stopSession: RuntimeAdapter["stopSession"] },
    input: Parameters<RuntimeAdapter["stopSession"]>[0],
    maxAttempts: number,
  ): Promise<Awaited<ReturnType<RuntimeAdapter["stopSession"]>>> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await adapter.stopSession(input);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Permanent failures (4xx auth/validation, malformed config) won't be
        // fixed by retrying — short-circuit to surface them immediately.
        if (err instanceof ProvisionedLauncherError && !err.retryable) {
          throw lastError;
        }
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        }
      }
    }
    throw lastError ?? new Error("stopSession failed");
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
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        connection: true,
        createdById: true,
        organizationId: true,
        tool: true,
        model: true,
        reasoningEffort: true,
        repo: { select: { setupConfig: true } },
      },
    });
    const conn = connectionRecord(session.connection);
    let runtimeId = optionalConnectionString(conn, "runtimeInstanceId");

    if (command === "resume" && adapter.type === "provisioned") {
      const environment = await this.resolveRuntimeEnvironment(conn);
      const userRuntimeTokens = await resolveUserRuntimeTokens(session.createdById, {
        includeCodexAccessToken: session.tool === "codex",
      });
      const startResult = await adapter.startSession({
        sessionId,
        organizationId: session.organizationId,
        actorId: session.createdById,
        environment,
        tool: session.tool,
        model: session.model ?? undefined,
        reasoningEffort: session.reasoningEffort ?? undefined,
        runtimeProfile: runtimeProfileFromSetupConfig(session.repo?.setupConfig),
        userGithubToken: userRuntimeTokens.userGithubToken,
        userCodexAccessToken: userRuntimeTokens.userCodexAccessToken,
        userCodexAuthMethod: userRuntimeTokens.userCodexAuthMethod,
        userCodexCredential: userRuntimeTokens.userCodexCredential,
      });
      runtimeId =
        startResult.runtimeInstanceId ??
        (typeof conn?.runtimeInstanceId === "string" ? conn.runtimeInstanceId : undefined);
      await this.waitForBridge(sessionId, 120_000, runtimeId, session.organizationId);
    }

    return this.sendAsync(
      sessionId,
      { type: command, sessionId },
      {
        expectedHomeRuntimeId: runtimeId,
        organizationId: session.organizationId,
      },
    );
  }
}

function runtimeProfileFromSetupConfig(setupConfig: unknown): string | undefined {
  if (!setupConfig || typeof setupConfig !== "object" || Array.isArray(setupConfig)) {
    return undefined;
  }
  const profile = (setupConfig as Record<string, unknown>).runtimeProfile;
  return typeof profile === "string" && profile ? profile : undefined;
}

export const sessionRouter = new SessionRouter();
