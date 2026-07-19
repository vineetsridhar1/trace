import type { StartSessionInput, UpdateSessionDefaultsInput, ActorType } from "@trace/gql";
import type { AgentStatus, SessionStatus, CodingTool, SessionGroupKind } from "@prisma/client";
import type { EventType } from "@trace/gql";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import {
  getDefaultModel,
  getDefaultReasoningEffort,
  hasQuestionBlock,
  hasPlanBlock,
  isSupportedModel,
  isSupportedReasoningEffort,
  MAX_WORKSPACE_NAME_LENGTH,
  type GitCheckpointBridgePayload,
  type GitCheckpointContext,
  type BridgeSessionGitSyncStatus,
  type BridgeWorkspaceWarning,
  type BridgeRepoWorktree,
} from "@trace/shared";
import { generateAnimalSlug } from "@trace/shared/animal-names";
import { prisma } from "../lib/db.js";
import {
  AuthenticationError,
  AuthorizationError,
  ToolNotInstalledError,
  ValidationError,
} from "../lib/errors.js";
import { eventService } from "./event.js";
import { sessionApplicationService } from "./session-applications.js";
import {
  sessionRouter,
  type DeliveryResult,
  type RuntimeInstance,
  type RuntimeLifecycleEventType,
  type RuntimeLifecycleUpdate,
} from "../lib/session-router.js";
import type { RuntimeAdapterType } from "../lib/runtime-adapter-registry.js";
import { inboxService } from "./inbox.js";
import { runtimeDebug } from "../lib/runtime-debug.js";
import { terminalRelay } from "../lib/terminal-relay.js";
import { storage } from "../lib/storage/index.js";
import {
  runtimeAccessService,
  setBridgeAccessApprovedHandler,
  type BridgeAccessApprovedHandlerInput,
} from "./runtime-access.js";
import { agentEnvironmentService } from "./agent-environment.js";
import {
  alertAgentEnvironmentOperator,
  logAgentEnvironmentTelemetry,
} from "../lib/agent-environment-telemetry.js";
import {
  deriveSessionGroupStatus,
  type SessionGroupStatus as DerivedSessionGroupStatus,
  type SessionGroupStatusSource,
} from "../lib/session-group-status.js";
import { isLocalMode } from "../lib/mode.js";
import {
  assertSessionGroupAccess,
  canViewSessionGroup,
  visibleSessionGroupWhere,
  visibleSessionWhere,
} from "./access.js";
import { apiTokenService } from "./api-token.js";
import {
  GitHubApiError,
  githubRepoService,
  parseGitHubRepo,
  type GitHubDirectoryEntry,
  type GitHubFileTree,
  type GitHubRepoRef,
} from "./github-repo.js";
import { orgSecretService } from "./org-secret.js";
import { managedGitService } from "./managed-git.js";
import { appCheckpointCaptureService } from "./app-checkpoint-capture.js";
import { designCheckpointPreviewService } from "./design-checkpoint-preview.js";
import { isGeneratedProjectKind } from "../lib/generated-project.js";

export type StartSessionServiceInput = Omit<StartSessionInput, "tool"> & {
  tool?: CodingTool | null;
  kind?: SessionGroupKind | null;
  sessionGroupId?: string | null;
  sourceSessionId?: string | null;
  imageKeys?: string[] | null;
  deferInitialRun?: boolean | null;
  organizationId: string;
  createdById: string;
  actorType?: ActorType;
  clientSource?: string | null;
  forceNewGroup?: boolean;
  forkedFromSessionGroupId?: string | null;
  checkpointSha?: string | null;
  provisionWithoutPrompt?: boolean;
  name?: string | null;
  allowVisibleSourceSession?: boolean;
  startEventId?: string;
  buildStartEvent?: (input: StartSessionBuildStartEventInput) => StartSessionEventOverride;
  afterCreate?: (input: StartSessionAfterCreateInput) => Promise<void>;
};

type SessionStartMetadata = {
  prompt: string | null;
  promptEventId: string | null;
  checkpointContextId: string | null;
  sourceSessionId: string | null;
  restoreCheckpointId: string | null;
  restoreCheckpointSha: string | null;
};

type PendingInputInfo = {
  kind: "question" | "plan";
  toolUseId: string | null;
};

type UserSessionDefaults = {
  defaultSessionTool: CodingTool | null;
  defaultSessionModel: string | null;
  defaultSessionReasoningEffort: string | null;
};

const SESSION_MOVE_GIT_SYNC_STATUS_TIMEOUT_MS = 5_000;
const LINKED_CHECKOUT_BRANCH_REFRESH_TIMEOUT_MS = 1_500;
const FALLBACK_SESSION_TOOL: CodingTool = "claude_code";
const LOCAL_TOOL_FALLBACK_ORDER: readonly CodingTool[] = [
  FALLBACK_SESSION_TOOL,
  "codex",
  "pi",
  "custom",
];
const PI_INSTALL_COMMAND = "npm install -g @earendil-works/pi-coding-agent";
const PI_INSTALL_DOCS_URL = "https://pi.dev/docs/latest/quickstart";
const ORG_GITHUB_TOKEN_SECRET_NAME = "GITHUB_TOKEN";

function normalizeClientSource(source: string | null | undefined): string | null {
  const trimmed = source?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Normalize an adopted worktree path for dedup and storage: trim and strip any
 * trailing path separators so `/wt` and `/wt/` map to the same key. Mirrors the
 * bridge's `path.resolve` normalization closely enough for absolute paths, so the
 * "one active group per worktree" check stays consistent with the stored workdir.
 */
function normalizeWorktreePath(input: string | null | undefined): string | null {
  const trimmed = input?.trim();
  if (!trimmed) return null;
  const stripped = trimmed.replace(/[/\\]+$/, "");
  return stripped.length > 0 ? stripped : trimmed;
}

function assertCloudRepoRemoteAvailable(
  hosting: string | null | undefined,
  repo: { remoteUrl: string | null } | null | undefined,
): void {
  if (hosting === "cloud" && repo && !repo.remoteUrl) {
    throw new ValidationError("Cloud sessions require the repo to have a remote URL.");
  }
}

function getAssistantBlocks(data: Record<string, unknown>): Record<string, unknown>[] | null {
  if (data.type !== "assistant") return null;
  const message = data.message;
  if (!message || typeof message !== "object" || Array.isArray(message)) return null;
  const content = (message as Record<string, unknown>).content;
  if (!Array.isArray(content)) return null;

  return content.filter((block): block is Record<string, unknown> => {
    return block != null && typeof block === "object" && !Array.isArray(block);
  });
}

function extractPendingInputInfo(data: Record<string, unknown>): PendingInputInfo | null {
  const blocks = getAssistantBlocks(data);
  if (!blocks) return null;

  const questionBlock = blocks.find((block) => block.type === "question");
  if (questionBlock) {
    return {
      kind: "question",
      toolUseId:
        typeof questionBlock.toolUseId === "string" && questionBlock.toolUseId.trim()
          ? questionBlock.toolUseId
          : null,
    };
  }

  const planBlock = blocks.find((block) => block.type === "plan");
  if (!planBlock) return null;

  return {
    kind: "plan",
    toolUseId:
      typeof planBlock.toolUseId === "string" && planBlock.toolUseId.trim()
        ? planBlock.toolUseId
        : null,
  };
}

/** Shape of Session.connection JSON stored in the DB */
export type SessionConnectionData = {
  state:
    | "pending"
    | "requested"
    | "provisioning"
    | "booting"
    | "connecting"
    | "connected"
    | "degraded"
    | "disconnected"
    | "failed"
    | "timed_out"
    | "stopping"
    | "stopped"
    | "deprovisioned"
    | "deprovision_failed";
  environmentId?: string;
  adapterType?: "local" | "provisioned";
  toolSource?: "default" | "explicit";
  runtimeInstanceId?: string;
  runtimeLabel?: string;
  providerRuntimeId?: string;
  providerRuntimeUrl?: string;
  providerStatus?: string;
  requestedAt?: string;
  provisioningAt?: string;
  connectingAt?: string;
  connectedAt?: string;
  failedAt?: string;
  timedOutAt?: string;
  stoppingAt?: string;
  stoppedAt?: string;
  deprovisionedAt?: string;
  deprovisionFailedAt?: string;
  deprovisionAttempts?: number;
  disconnectOnDeprovision?: boolean;
  disconnectReason?: string;
  /**
   * Total times the background reconciler has picked this session up. Capped
   * at `MAX_RECONCILE_ATTEMPTS`; once reached the runtime is marked abandoned
   * and the reconciler stops touching it.
   */
  reconcileAttempts?: number;
  abandonedAt?: string;
  /**
   * Optimistic-concurrency token bumped by `updateConnectionConditional` on
   * every successful write. Treat missing/undefined as 0. Only writers that
   * use the helper participate; legacy writers (markConnectionLost, etc.)
   * leave it unchanged, which is acceptable because they don't intersect
   * with the deprovision lifecycle paths.
   */
  version?: number;
  disconnectedAt?: string;
  reconnectedAt?: string;
  lastSeen?: string;
  lastError?: string;
  lastDeliveryFailureAt?: string;
  retryCount: number;
  canRetry: boolean;
  canMove: boolean;
  /**
   * When false, the frontend should not auto-retry — only manual Retry/Move
   * can unblock. Used for non-transient failures (e.g. home bridge offline)
   * where repeated background retries produce noise without progress.
   */
  autoRetryable?: boolean;
  [key: string]: unknown;
};

const RUNTIME_IDENTITY_FIELDS = [
  "environmentId",
  "adapterType",
  "runtimeInstanceId",
  "providerRuntimeId",
] as const satisfies ReadonlyArray<keyof SessionConnectionData>;

function hasRuntimeBindingChanged(
  current: SessionConnectionData,
  next: SessionConnectionData,
): boolean {
  return RUNTIME_IDENTITY_FIELDS.some((field) => current[field] !== next[field]);
}

// Whether a session group is already pinned to a bridge/runtime. Keep this in
// lockstep with `hasSelectedSessionGroupRuntime` in
// packages/client-core/src/lib/session-group.ts — the client hides the bridge
// selector on exactly the groups this server-side guard rejects a re-selection
// for, so the two field sets must stay identical.
function hasRuntimeBinding(connection: SessionConnectionData, workdir?: string | null): boolean {
  return Boolean(
    workdir ||
    connection.runtimeInstanceId ||
    connection.environmentId ||
    connection.providerRuntimeId ||
    connection.adapterType === "provisioned",
  );
}

function mergeRuntimeBinding(
  current: SessionConnectionData,
  source: SessionConnectionData,
): SessionConnectionData {
  const {
    environmentId: _environmentId,
    adapterType: _adapterType,
    runtimeInstanceId: _runtimeInstanceId,
    runtimeLabel: _runtimeLabel,
    providerRuntimeId: _providerRuntimeId,
    providerRuntimeUrl: _providerRuntimeUrl,
    ...lifecycle
  } = current;
  return {
    ...lifecycle,
    ...(source.environmentId !== undefined && { environmentId: source.environmentId }),
    ...(source.adapterType !== undefined && { adapterType: source.adapterType }),
    ...(source.runtimeInstanceId !== undefined && {
      runtimeInstanceId: source.runtimeInstanceId,
    }),
    ...(source.runtimeLabel !== undefined && { runtimeLabel: source.runtimeLabel }),
    ...(source.providerRuntimeId !== undefined && {
      providerRuntimeId: source.providerRuntimeId,
    }),
    ...(source.providerRuntimeUrl !== undefined && {
      providerRuntimeUrl: source.providerRuntimeUrl,
    }),
  };
}

type PendingSessionCommand =
  | {
      type: "run";
      prompt?: string | null;
      interactionMode?: string | null;
      clientSource?: string | null;
      checkpointContext?: GitCheckpointContext | null;
      imageKeys?: string[] | null;
      workspaceUpgrade?: boolean;
    }
  | {
      type: "send";
      prompt: string;
      interactionMode?: string | null;
      clientSource?: string | null;
      checkpointContext?: GitCheckpointContext | null;
      imageKeys?: string[] | null;
      workspaceUpgrade?: boolean;
    };

type PendingSessionCommandQueue = {
  type: "queue";
  commands: PendingSessionCommand[];
};

type LinkedCheckoutRuntimeGroup = {
  id: string;
  repoId: string | null;
  branch: string | null;
  workdir: string | null;
  connection: unknown;
  visibility: string | null;
  ownerUserId: string | null;
  sessions: Array<{
    id: string;
    repoId: string | null;
    branch?: string | null;
    workdir?: string | null;
  }>;
};

type GroupWorkspaceStatePatch = {
  workdir?: string | null;
  connection?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | null;
  prUrl?: string | null;
  worktreeDeleted?: boolean;
  worktreeAdopted?: boolean;
  repoId?: string | null;
  branch?: string | null;
  slug?: string | null;
  setupStatus?: "idle" | "running" | "completed" | "failed";
  setupError?: string | null;
};

type IdleCloudSessionGroupCandidate = {
  id: string;
  organizationId: string;
  updatedAt: Date;
  workdir: string | null;
  connection: Prisma.JsonValue | null;
  sessions: {
    id: string;
    hosting: string;
    agentStatus: AgentStatus;
    sessionStatus: SessionStatus;
    createdAt: Date;
    lastUserMessageAt: Date | null;
    lastMessageAt: Date | null;
    updatedAt: Date;
    connection?: Prisma.JsonValue | null;
  }[];
};

function defaultConnection(overrides?: Partial<SessionConnectionData>): SessionConnectionData {
  return {
    state: "connected",
    retryCount: 0,
    canRetry: true,
    canMove: true,
    // New sessions start at version 0 so the first conditional write through
    // updateConnectionConditional has a key to compare against. The
    // 20260429170000_session_deprovision_index migration backfills the same
    // baseline on rows that predate this field.
    version: 0,
    ...overrides,
  };
}

function pendingRunValue(
  commands: PendingSessionCommand[],
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (commands.length === 0) return Prisma.DbNull;
  if (commands.length === 1) return commands[0] as unknown as Prisma.InputJsonValue;
  return {
    type: "queue",
    commands,
  } satisfies PendingSessionCommandQueue as unknown as Prisma.InputJsonValue;
}

function validateUploadKeysForOrganization(
  imageKeys: string[] | null | undefined,
  organizationId: string,
): void {
  if (!imageKeys?.length) return;
  for (const key of imageKeys) {
    if (typeof key !== "string" || !key.startsWith("uploads/") || key.includes("..")) {
      throw new Error("Invalid upload key");
    }
    const orgSegment = key.split("/")[1];
    if (orgSegment !== organizationId) {
      throw new Error("Attachment key does not belong to this organization");
    }
  }
}

/**
 * Cap on background reconciler retries per session. Once exceeded the runtime
 * is marked abandoned and skipped so the launcher operator can investigate.
 */
const MAX_RECONCILE_ATTEMPTS = 10;

// Upper bound on the org-wide app-session listing so it can't grow unbounded.
const GENERATED_PROJECT_GROUP_LIST_LIMIT = 200;

/** Maximum optimistic-concurrency retries for `updateConnectionConditional`. */
const MAX_CONNECTION_UPDATE_ATTEMPTS = 5;

/**
 * WHERE clause that matches a session only if its `connection.version` is
 * the expected value. Migration `20260429170000_session_deprovision_index`
 * backfills `version: 0` on existing rows, so we don't need to special-case
 * a missing key here.
 */
function connectionVersionWhere(
  sessionId: string,
  expectedVersion: number,
): Prisma.SessionWhereInput {
  return {
    id: sessionId,
    connection: { path: ["version"], equals: expectedVersion },
  };
}

function isRuntimeStartupState(state: SessionConnectionData["state"]): boolean {
  return (
    state === "requested" ||
    state === "provisioning" ||
    state === "booting" ||
    state === "connecting"
  );
}

function isRuntimeTerminalState(state: SessionConnectionData["state"]): boolean {
  return (
    state === "failed" || state === "timed_out" || state === "stopped" || state === "deprovisioned"
  );
}

/**
 * True when a runtime's provider compute is already torn down, so an idle
 * cleanup stop would do nothing but re-emit stopping/stopped lifecycle events.
 *
 * A provisioned runtime stopped by a prior idle sweep lands in
 * `state: "disconnected"` with `deprovisionedAt` set but keeps its runtime
 * binding ids. The group still looks idle, so without this guard the next sweep
 * re-stops the already-gone runtime — an infinite loop, since stopping an idle
 * group never changes the selection criteria. A `disconnected` runtime with no
 * recorded deprovision (e.g. a dropped bridge whose provider compute may still
 * be alive) is intentionally NOT treated as gone — that compute is still worth
 * reclaiming. Likewise `failed`/`timed_out` are deliberately excluded: a start
 * that failed may have leaked provider compute that idle cleanup should still
 * reap, and `stopping`/`deprovision_failed` are owned by the deprovision
 * reconciler, not this sweep.
 */
function isRuntimeComputeGone(conn: SessionConnectionData): boolean {
  if (conn.state === "stopped" || conn.state === "deprovisioned") return true;
  return conn.state === "disconnected" && conn.deprovisionedAt != null;
}

/**
 * Grace window during which a starting-up runtime is shielded from the idle
 * sweep. Comfortably above the default 180s startup timeout so a healthy
 * cold-boot (image pull + connect) is always protected.
 */
const RUNTIME_STARTUP_GRACE_MS = 5 * 60 * 1000;

/**
 * True when a runtime is actively starting up and that startup is still recent.
 *
 * Reviving an idle session provisions fresh compute without posting a new
 * message, so the group still matches the idle query while its runtime is
 * mid-boot. Without this guard the idle sweep reaps the just-provisioned runtime
 * seconds into its image pull (stoppedReason `idle_session_group_cleanup`,
 * `startedAt: null`), so an idle group can never be revived. A runtime stuck in
 * a startup state past the grace window (well beyond the startup timeout, which
 * the provision path settles on its own) is intentionally left reclaimable so
 * leaked compute can't linger forever.
 */
function isRuntimeStartingWithinGrace(conn: SessionConnectionData, now: number): boolean {
  if (!isRuntimeStartupState(conn.state)) return false;
  const startedAt = conn.requestedAt ?? conn.provisioningAt ?? conn.connectingAt ?? null;
  if (!startedAt) return true;
  const startedMs = Date.parse(startedAt);
  if (Number.isNaN(startedMs)) return true;
  return now - startedMs < RUNTIME_STARTUP_GRACE_MS;
}

function getIdleSessionStatus(sessionStatus?: SessionStatus | null): SessionStatus {
  if (sessionStatus === "merged") return "merged";
  return sessionStatus === "in_review" ? "in_review" : "in_progress";
}

function getRunningSessionStatus(sessionStatus?: SessionStatus | null): SessionStatus {
  return sessionStatus === "merged" ? "merged" : "in_progress";
}

function getIdleAgentStatus(agentStatus?: AgentStatus | null): AgentStatus {
  return agentStatus === "not_started" ? "not_started" : "done";
}

/** Cast connection data to Prisma-compatible JSON */
function connJson(data: SessionConnectionData): Prisma.InputJsonValue {
  return data as unknown as Prisma.InputJsonValue;
}

function elapsedMs(start: string | undefined, end: string | undefined): number | undefined {
  if (!start || !end) return undefined;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return undefined;
  return Math.max(0, endMs - startMs);
}

function configRecord(config: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  return config as Record<string, unknown>;
}

function localEnvironmentRuntimeInstanceId(
  environment?: {
    adapterType: RuntimeAdapterType;
    config: Prisma.JsonValue;
  } | null,
): string | null {
  if (environment?.adapterType !== "local") return null;
  const runtimeInstanceId = configRecord(environment.config).runtimeInstanceId;
  return typeof runtimeInstanceId === "string" && runtimeInstanceId.trim()
    ? runtimeInstanceId
    : null;
}

function shortCommitSha(commitSha: string): string {
  return commitSha.slice(0, 7);
}

function parseCheckpointContext(raw: unknown): GitCheckpointContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const context = raw as Record<string, unknown>;
  if (
    typeof context.checkpointContextId !== "string" ||
    typeof context.sessionId !== "string" ||
    typeof context.sessionGroupId !== "string" ||
    typeof context.repoId !== "string" ||
    typeof context.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    checkpointContextId: context.checkpointContextId,
    promptEventId: typeof context.promptEventId === "string" ? context.promptEventId : null,
    sessionId: context.sessionId,
    sessionGroupId: context.sessionGroupId,
    repoId: context.repoId,
    updatedAt: context.updatedAt,
  };
}

function createCheckpointContext({
  checkpointContextId,
  promptEventId,
  sessionId,
  sessionGroupId,
  repoId,
}: {
  checkpointContextId: string;
  promptEventId?: string | null;
  sessionId: string;
  sessionGroupId: string;
  repoId: string;
}): GitCheckpointContext {
  return {
    checkpointContextId,
    promptEventId: promptEventId ?? null,
    sessionId,
    sessionGroupId,
    repoId,
    updatedAt: new Date().toISOString(),
  };
}

function buildCheckpointContextFromStartMeta({
  sessionId,
  sessionGroupId,
  repoId,
  startMeta,
}: {
  sessionId: string;
  sessionGroupId?: string | null;
  repoId?: string | null;
  startMeta?: Pick<SessionStartMetadata, "checkpointContextId" | "promptEventId"> | null;
}): GitCheckpointContext | null {
  if (!sessionGroupId || !repoId || !startMeta?.checkpointContextId) {
    return null;
  }

  return createCheckpointContext({
    checkpointContextId: startMeta.checkpointContextId,
    promptEventId: startMeta.promptEventId,
    sessionId,
    sessionGroupId,
    repoId,
  });
}

const SESSION_GROUP_SUMMARY_SELECT = {
  id: true,
  name: true,
  kind: true,
  slug: true,
  ownerUserId: true,
  ownerUser: true,
  visibility: true,
  channelId: true,
  channel: true,
  repoId: true,
  repo: true,
  branch: true,
  workdir: true,
  connection: true,
  prUrl: true,
  worktreeDeleted: true,
  worktreeAdopted: true,
  archivedAt: true,
  setupStatus: true,
  setupError: true,
  forkedFromSessionGroupId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const SESSION_INCLUDE = {
  createdBy: true,
  repo: true,
  channel: true,
  sessionGroup: { select: SESSION_GROUP_SUMMARY_SELECT },
} as const;

const SESSION_GROUP_INCLUDE = {
  ownerUser: true,
  channel: true,
  repo: true,
  sessions: {
    orderBy: [
      { updatedAt: "desc" },
      { createdAt: "desc" },
    ] as Prisma.SessionOrderByWithRelationInput[],
    include: SESSION_INCLUDE,
  },
} satisfies Prisma.SessionGroupInclude;

type SessionGroupSummary = Prisma.SessionGroupGetPayload<{
  select: typeof SESSION_GROUP_SUMMARY_SELECT;
}>;

type SessionGroupSnapshot = Omit<SessionGroupSummary, "ownerUser"> & {
  owner: SessionGroupSummary["ownerUser"];
  status: DerivedSessionGroupStatus;
};

/** A session row with the fields needed by both SessionGroupStatusSource and sortSessionsByRecency. */
type SessionWithTimestamps = SessionGroupStatusSource & {
  updatedAt: Date;
  createdAt: Date;
  lastMessageAt?: Date | null;
};

type SessionWithInclude = Prisma.SessionGetPayload<{
  include: typeof SESSION_INCLUDE;
}>;

type ForkSourceEvent = Prisma.EventGetPayload<Prisma.EventDefaultArgs>;

type StartSessionBuildStartEventInput = {
  session: SessionWithInclude;
  sessionGroup: SessionGroupSummary;
  sessionGroupSnapshot: SessionGroupSnapshot;
  startEventId: string;
  defaultPayload: Prisma.InputJsonValue;
  defaultMetadata: Prisma.InputJsonValue | undefined;
};

type StartSessionEventOverride = {
  payload: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  actorType?: ActorType;
  actorId?: string;
  timestamp?: Date;
};

type StartSessionAfterCreateInput = {
  tx: Prisma.TransactionClient;
  session: SessionWithInclude;
  sessionGroup: SessionGroupSummary;
  startEventId: string;
  startEventPayload: Prisma.InputJsonValue;
};

type GitHubSessionGroupFileSource = {
  repo: GitHubRepoRef;
  token: string;
  branch: string;
  defaultBranch: string;
  workdir: string | null;
};

type SessionGroupFileContentResult = {
  content: string;
  ref: string;
  requestedRef: string;
  usedFallback: boolean;
};

const INVALID_FILE_PATH_ERROR = "Invalid file path";
const LOCAL_FILE_ACCESS_DENIED_ERROR =
  "Access denied: you do not have permission to access files on this local bridge";

function numberFromBigInt(value: bigint | number | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  return typeof value === "number" ? value : 0;
}

function serializeSession(session: {
  id: string;
  name: string;
  agentStatus: AgentStatus;
  sessionStatus: SessionStatus;
  tool: string;
  model: string | null;
  reasoningEffort: string | null;
  hosting: string;
  createdBy: unknown;
  repo: unknown;
  repoId?: string | null;
  branch: string | null;
  workdir?: string | null;
  channel: unknown;
  channelId?: string | null;
  sessionGroup: unknown;
  connection: Prisma.JsonValue | null;
  worktreeDeleted?: boolean;
  lastUserMessageAt?: Date | null;
  lastMessageAt?: Date | null;
  inputTokens?: bigint | number | null;
  outputTokens?: bigint | number | null;
  cacheReadTokens?: bigint | number | null;
  cacheCreationTokens?: bigint | number | null;
  costUsd?: number | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: session.id,
    name: session.name,
    agentStatus: session.agentStatus,
    sessionStatus: session.sessionStatus,
    tool: session.tool,
    model: session.model,
    reasoningEffort: session.reasoningEffort,
    hosting: session.hosting,
    createdBy: session.createdBy,
    repo: session.repo ?? null,
    repoId: session.repoId ?? null,
    branch: session.branch ?? null,
    workdir: session.workdir ?? null,
    channel: session.channel ?? null,
    channelId: session.channelId ?? null,
    sessionGroupId:
      session.sessionGroup &&
      typeof session.sessionGroup === "object" &&
      "id" in session.sessionGroup
        ? (session.sessionGroup as { id: string }).id
        : null,
    sessionGroup: session.sessionGroup ?? null,
    connection: session.connection,
    worktreeDeleted: session.worktreeDeleted ?? false,
    lastUserMessageAt: session.lastUserMessageAt ?? null,
    lastMessageAt: session.lastMessageAt ?? session.lastUserMessageAt ?? null,
    inputTokens: numberFromBigInt(session.inputTokens),
    outputTokens: numberFromBigInt(session.outputTokens),
    cacheReadTokens: numberFromBigInt(session.cacheReadTokens),
    cacheCreationTokens: numberFromBigInt(session.cacheCreationTokens),
    costUsd: session.costUsd ?? 0,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function serializeGitCheckpoint(checkpoint: {
  id: string;
  sessionId: string;
  sessionGroupId: string;
  repoId: string;
  promptEventId: string;
  commitSha: string;
  parentShas: string[];
  treeSha: string;
  subject: string;
  author: string;
  committedAt: Date;
  filesChanged: number;
  captureStatus?: string | null;
  captureKey?: string | null;
  captureUrl?: string | null;
  captureContentType?: string | null;
  capturedAt?: Date | null;
  previewStatus?: string | null;
  previewKey?: string | null;
  previewUrl?: string | null;
  previewContentType?: string | null;
  previewCapturedAt?: Date | null;
  createdAt: Date;
}) {
  return {
    id: checkpoint.id,
    sessionId: checkpoint.sessionId,
    sessionGroupId: checkpoint.sessionGroupId,
    repoId: checkpoint.repoId,
    promptEventId: checkpoint.promptEventId,
    commitSha: checkpoint.commitSha,
    parentShas: checkpoint.parentShas,
    treeSha: checkpoint.treeSha,
    subject: checkpoint.subject,
    author: checkpoint.author,
    committedAt: checkpoint.committedAt.toISOString(),
    filesChanged: checkpoint.filesChanged,
    captureStatus: checkpoint.captureStatus ?? null,
    captureKey: checkpoint.captureKey ?? null,
    captureUrl: checkpoint.captureUrl ?? null,
    captureContentType: checkpoint.captureContentType ?? null,
    capturedAt: checkpoint.capturedAt?.toISOString() ?? null,
    previewStatus: checkpoint.previewStatus ?? null,
    previewKey: checkpoint.previewKey ?? null,
    previewUrl: checkpoint.previewUrl ?? null,
    previewContentType: checkpoint.previewContentType ?? null,
    previewCapturedAt: checkpoint.previewCapturedAt?.toISOString() ?? null,
    createdAt: checkpoint.createdAt.toISOString(),
  };
}

function sortSessionsByRecency<
  T extends {
    updatedAt: Date;
    createdAt: Date;
    lastMessageAt?: Date | null;
  },
>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => {
    if (a.lastMessageAt && b.lastMessageAt) {
      const recencyDiff = b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
      if (recencyDiff !== 0) return recencyDiff;
    } else if (a.lastMessageAt) {
      return -1;
    } else if (b.lastMessageAt) {
      return 1;
    }

    const updatedDiff = b.updatedAt.getTime() - a.updatedAt.getTime();
    if (updatedDiff !== 0) return updatedDiff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

function buildSessionGroupSnapshot(
  group: SessionGroupSummary,
  sessions: SessionGroupStatusSource[] | undefined,
): SessionGroupSnapshot {
  return {
    ...group,
    owner: group.ownerUser,
    status: deriveSessionGroupStatus(sessions ?? [], group.prUrl ?? null, group.archivedAt ?? null),
  };
}

function rewriteForkPayloadReferences(
  value: unknown,
  replacements: ReadonlyMap<string, string>,
): unknown {
  if (typeof value === "string") return replacements.get(value) ?? value;
  if (Array.isArray(value)) {
    return value.map((item) => rewriteForkPayloadReferences(item, replacements));
  }
  if (!value || typeof value !== "object") return value;
  const rewritten: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    rewritten[key] = rewriteForkPayloadReferences(child, replacements);
  }
  return rewritten;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function gitCheckpointIdFromPayload(value: unknown): string | null {
  const payload = jsonRecord(value);
  if (payload.type !== "git_checkpoint" && payload.type !== "git_checkpoint_rewrite") return null;
  const checkpoint = jsonRecord(payload.checkpoint);
  return typeof checkpoint.id === "string" ? checkpoint.id : null;
}

/** Maximum length for session names (prompt-derived or title-tag-extracted). */
const MAX_SESSION_NAME_LENGTH = 80;
const MAX_CONVERSATION_CONTEXT_CHARS = 96 * 1024;
const MAX_CONVERSATION_CONTEXT_ENTRY_CHARS = 12 * 1024;
const CONVERSATION_CONTEXT_EVENT_PAGE_SIZE = 100;
const MAX_CONVERSATION_CONTEXT_EVENTS_SCANNED = 500;

type ConversationContextEvent = {
  id: string;
  eventType: string;
  payload: Prisma.JsonValue;
};

type ConversationLineSource = {
  role: "User" | "Assistant";
  text: string;
};

/** Instruction appended to every session prompt so the AI can set or update the title at any time. */
const TITLE_INSTRUCTION = `\n\n<system-instruction>
You may set or update the session title by outputting a short title (5-8 words) wrapped in XML tags: <trace-title>Your title here</trace-title>.
Do this ONCE at the start of your very first response to capture the overall goal of the session. After that, do NOT update the title unless the user explicitly asks you to rename/retitle it. Debugging, iterating, or continuing work on the same goal is not a reason to change the title. The tag will be stripped and not shown to the user.
</system-instruction>`;

/** Instruction appended to repo-based sessions so the AI reports branch name changes. */
const BRANCH_INSTRUCTION = `\n\n<system-instruction>
On the first response in a repo-based session, if the current git branch is still the default trace-<slug> branch, rename it to trace-<slug>-<descriptive-name>. Keep the descriptive name short, lowercase, hyphenated, and slash-free. Do not use "/" in AI-generated branch names. If the branch is already descriptive or differs from trace-<slug>, do not rename it.
When you create or rename a git branch, output the full branch name wrapped in XML tags: <trace-branch>branch-name</trace-branch>.
This lets the system track which branch this session is working on. The tag will be stripped and not shown to the user.
</system-instruction>`;

/** Instruction appended to every session prompt so the AI waits for background work it started. */
const BACKGROUND_WORK_INSTRUCTION = `\n\n<system-instruction>
If you start anything in the background, including long-running shell commands, dev servers, watchers, or subagents, keep the main agent process alive until that work is complete or intentionally stopped. Do not send a final response while background work you started is still running unless the user explicitly asks you to leave it running; in that case, report what is running and how it is being kept alive.
</system-instruction>`;

/** Instruction appended to every prompt for repo-based sessions so the AI auto-saves each response. */
const AUTO_SAVE_INSTRUCTION = `\n\n<system-instruction>
Before completing every response that changes the workspace, silently save your work to the remote:
1. Stage all changes: git add -A
2. Commit with a short, descriptive message summarizing what changed (skip if nothing staged)
3. Push: git push -u origin HEAD
Do this silently — do not mention it to the user unless they ask or it fails.
If the user asks you to stop auto-saving or disable auto-save, stop doing this for the rest of the session.
</system-instruction>`;

const APP_SESSION_INSTRUCTION = `\n\n<system-instruction>
This is a Trace app session in its own isolated cloud runtime. When present, read and follow docs/ai-guidance.md and docs/trace-apps.md before changing the app. Build a full-stack app, not a static artifact or patch to an existing user repo. Use the provided Vite/React/Node/Tailwind/shadcn-compatible starter as the source of truth. Work visibly and incrementally: make a small, valid first UI change quickly, then build in coherent runnable batches so the user can watch each meaningful step through Vite HMR. Keep the app working between edits; do not prepare the entire replacement offscreen and swap it in only at the end. Build frontend UI in src and add API routes or other server behavior in server.ts and related Node modules. Keep browser requests to your own API same-origin. Call third-party APIs from Node routes when browser CORS would block them. Only when an external browser origin must call this app directly, add its exact origin to the comma-separated APP_CORS_ALLOWED_ORIGINS environment variable; never use a wildcard for credentialed requests. You may install npm packages (pnpm is available) and use sudo to install any other OS packages you need. Redis and PostgreSQL are already running and ready to use — do NOT install, initialize, or reconfigure them, create roles, or edit pg_hba/auth. The \`pg\` client and its TypeScript types are already installed. For Postgres, import \`Pool\` from \`pg\`, read the DATABASE_URL environment variable, and pass it straight to \`new Pool({ connectionString: process.env.DATABASE_URL })\`; it is a complete, credentialed TCP URL (\`postgresql://user:pass@localhost:5432/app\`) for a ready database named \`app\` — do not parse it, override the user, or switch to a Unix socket. Redis is at REDIS_URL / redis://localhost:6379. Keep credentials out of git. Preserve data-trace-source attributes when adding inspectable UI elements. IMPORTANT: the dev server is already started and managed for you on port 3000 (host 0.0.0.0) and hot-reloads your file changes — do NOT run \`pnpm dev\` or otherwise start your own server, the port is already taken and a second one will crash. Just edit files; if you need to verify, curl http://localhost:3000. Before every response that changes the app, commit and push the changes to the configured managed origin. Sharing the live app is a valid final outcome.
</system-instruction>`;

const DESIGN_SESSION_INSTRUCTION = `\n\n<system-instruction>
This is a Trace Design session, not an App or Coding session. Act as a product and interface designer producing reviewable screen artifacts on the existing canvas. React is only the rendering medium; when the user asks to build or create a product, design its screens, flows, variants, and states instead of implementing a production application. Before editing, read and follow AGENTS.md or CLAUDE.md plus docs/ai-guidance.md, resolve design.brief.json, and read the relevant docs/playbooks guidance. Follow the workspace guide's design loop: understand the brief, ground supplied references in observable evidence, map the experience, commit to executable tokens, compose a representative screen and then the coherent screen set, and critique it before delivery. Work visibly and incrementally: render a rough but valid representative screen early, then add and refine screens in coherent runnable batches so the user can watch the canvas evolve through Vite HMR. Keep the manifest and canvas valid between edits; do not assemble the whole design offscreen and reveal it only at the end. Build and refine the artifact through design.brief.json, design.canvas.json, trace.tokens.json, and focused components under src/design, with one component per logical screen and stable screen ids. Prefer the token-driven primitives already under src/design/primitives. Local component state is allowed for prototype interactions, but do not build APIs, databases, authentication, persistence, real integrations, or production business logic. Do not replace src/App.tsx, the stable canvas or review runtime, server.ts, scripts, or the Vite/export configuration, and do not add routing that bypasses the canvas. Use local or embeddable assets only so Export HTML remains self-contained and works offline. The managed Vite server already runs on port 3000 and hot-reloads changes; do not start another server. Before delivery run pnpm design:check, pnpm design:review, and pnpm test; inspect every generated review screenshot, repair failures, and rerun the checks. Ask only blocking product questions through Trace's normal question mechanism; otherwise make explicit, reasonable assumptions and proceed. Before every response that changes the design, commit and push the changes to the configured managed origin. A successful push saves the durable Design preview.
</system-instruction>`;

const PDF_SESSION_INSTRUCTION = `\n\n<system-instruction>
This is a Trace PDF session. Build a print-ready document in the provided Vite/React starter, not a full-stack application. Before changing the document, read AGENTS.md and docs/ai-guidance.md, then use the relevant guidance under docs/playbooks/. The editable document lives in src/App.tsx and is rendered live by the managed server on port 3000; do not start another server. Keep the output self-contained: use local CSS and assets, semantic HTML, and explicit print styles with stable page breaks. Do not add a backend, database, Redis, authentication, external integrations, or in-document download controls. Trace renders and stores the PDF after each managed Git push; preserve the print stylesheet while adapting the document. Work visibly in small valid changes, check the print layout at A4 and Letter sizes, and run pnpm test before delivery. Before every response that changes the document, commit and push the changes to the configured managed origin.
</system-instruction>`;

function generatedProjectInstruction(
  kind: SessionGroupKind | string | null | undefined,
): string | undefined {
  if (kind === "app") return APP_SESSION_INSTRUCTION;
  if (kind === "design") return DESIGN_SESSION_INSTRUCTION;
  if (kind === "pdf") return PDF_SESSION_INSTRUCTION;
  return undefined;
}

function appendAutoSave(prompt: string, hasRepo: boolean): string {
  return hasRepo ? prompt + AUTO_SAVE_INSTRUCTION : prompt;
}

/** Append all system instructions (title, background work, branch, auto-save) to a prompt in the correct order. */
function appendPromptInstructions(
  prompt: string,
  { hasRepo, sessionGroupKind }: { hasRepo: boolean; sessionGroupKind?: SessionGroupKind | null },
): string {
  let result = prompt + TITLE_INSTRUCTION;
  result += BACKGROUND_WORK_INSTRUCTION;
  if (hasRepo && !isGeneratedProjectKind(sessionGroupKind)) result += BRANCH_INSTRUCTION;
  result = appendAutoSave(result, hasRepo);
  return result;
}

function buildBaseBranchInstruction(baseBranch: string): string {
  return `\n\n<system-instruction>
This session is working off the base branch "${baseBranch}". All work should be branched from this base branch, and when merging, merge into "${baseBranch}" (not main/master). When pushing, ensure your branch is based on origin/${baseBranch}.
</system-instruction>`;
}

function shouldPreserveWorkspaceBranchName({
  slug,
  branch,
  channelBaseBranch,
}: {
  slug?: string | null;
  branch?: string | null;
  channelBaseBranch?: string | null;
}): boolean {
  if (slug) return true;
  return !channelBaseBranch || branch !== channelBaseBranch;
}

/** Regex to extract <trace-title>…</trace-title> from assistant output. */
const TITLE_TAG_RE = /<trace-title>([\s\S]*?)<\/trace-title>/;

/** Regex to extract <trace-branch>…</trace-branch> from assistant output. */
const BRANCH_TAG_RE = /<trace-branch>([\s\S]*?)<\/trace-branch>/;

/**
 * Build a conversation transcript from session events.
 * Includes user messages and assistant text (no tool calls).
 * Used to give a new coding tool context when switching mid-session.
 */
async function buildConversationContext(sessionId: string): Promise<string | null> {
  const firstEntry = await findFirstConversationContextEntry(sessionId);
  if (!firstEntry) return null;

  const selectedTail: string[] = [];
  const maxBodyChars = conversationHistoryBodyBudget();
  let bodyChars = firstEntry.lines.join("\n\n").length;
  let omitted = false;
  let cursorId: string | undefined;
  let scanned = 0;
  let reachedFirstEntry = false;

  while (scanned < MAX_CONVERSATION_CONTEXT_EVENTS_SCANNED && !reachedFirstEntry) {
    const events = await fetchConversationContextEvents(sessionId, "desc", cursorId);
    if (events.length === 0) break;

    for (const evt of events) {
      scanned += 1;
      if (evt.id === firstEntry.eventId) {
        reachedFirstEntry = true;
        continue;
      }

      const lines = conversationLineSourcesFromEvent(evt).map((line) =>
        formatConversationLine(line.role, line.text),
      );
      for (const line of [...lines].reverse()) {
        const separatorChars = bodyChars > 0 ? 2 : 0;
        if (bodyChars + separatorChars + line.length > maxBodyChars) {
          omitted = true;
          reachedFirstEntry = true;
          break;
        }
        selectedTail.unshift(line);
        bodyChars += separatorChars + line.length;
      }

      if (reachedFirstEntry || scanned >= MAX_CONVERSATION_CONTEXT_EVENTS_SCANNED) break;
    }

    cursorId = events.at(-1)?.id;
  }

  if (!reachedFirstEntry) {
    omitted = true;
  }

  return buildBoundedConversationHistory(firstEntry.lines, selectedTail, omitted);
}

async function fetchConversationContextEvents(
  sessionId: string,
  direction: "asc" | "desc",
  cursorId?: string,
): Promise<ConversationContextEvent[]> {
  return prisma.event.findMany({
    where: {
      scopeId: sessionId,
      scopeType: "session",
      eventType: { in: ["session_started", "message_sent", "session_output"] },
    },
    orderBy: [{ timestamp: direction }, { id: direction }],
    take: CONVERSATION_CONTEXT_EVENT_PAGE_SIZE,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    select: { id: true, eventType: true, payload: true },
  });
}

async function findFirstConversationContextEntry(
  sessionId: string,
): Promise<{ eventId: string; lines: string[] } | null> {
  let cursorId: string | undefined;
  let scanned = 0;

  while (scanned < MAX_CONVERSATION_CONTEXT_EVENTS_SCANNED) {
    const events = await fetchConversationContextEvents(sessionId, "asc", cursorId);
    if (events.length === 0) break;

    for (const evt of events) {
      scanned += 1;
      const sources = conversationLineSourcesFromEvent(evt);
      if (sources.length > 0) {
        return {
          eventId: evt.id,
          lines: sources.map((line, index) =>
            formatConversationLine(line.role, line.text, { preserveStart: index === 0 }),
          ),
        };
      }
      if (scanned >= MAX_CONVERSATION_CONTEXT_EVENTS_SCANNED) break;
    }

    cursorId = events.at(-1)?.id;
  }

  return null;
}

function conversationLineSourcesFromEvent(evt: ConversationContextEvent): ConversationLineSource[] {
  const payload = evt.payload as Record<string, unknown>;

  if (evt.eventType === "session_started") {
    return typeof payload.prompt === "string" ? [{ role: "User", text: payload.prompt }] : [];
  }

  if (evt.eventType === "message_sent") {
    return typeof payload.text === "string" ? [{ role: "User", text: payload.text }] : [];
  }

  if (payload.type !== "assistant") return [];

  const message = payload.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (!Array.isArray(content)) return [];

  const lines: ConversationLineSource[] = [];
  for (const block of content) {
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string") {
      lines.push({ role: "Assistant", text: b.text });
    }
  }
  return lines;
}

function formatConversationLine(
  role: "User" | "Assistant",
  text: string,
  options?: { preserveStart?: boolean },
): string {
  return clipConversationText(`[${role}]: ${text}`, MAX_CONVERSATION_CONTEXT_ENTRY_CHARS, options);
}

function clipConversationText(
  text: string,
  maxChars: number,
  options?: { preserveStart?: boolean },
): string {
  if (text.length <= maxChars) return text;

  const marker = options?.preserveStart
    ? `\n\n[Trace clipped later content from this transcript entry.]\n\n`
    : `\n\n[Trace clipped earlier content from this transcript entry.]\n\n`;
  const available = Math.max(0, maxChars - marker.length);
  if (options?.preserveStart) {
    return `${text.slice(0, available)}${marker}`;
  }
  return `${marker}${text.slice(text.length - available)}`;
}

function conversationHistoryBodyBudget(): number {
  const header =
    "<conversation-history>\nThe following is the conversation history from a previous coding tool in this session. Use it as context.\n\n";
  const footer = "\n</conversation-history>";
  return Math.max(0, MAX_CONVERSATION_CONTEXT_CHARS - header.length - footer.length);
}

function buildBoundedConversationHistory(
  firstLines: string[],
  selectedTail: string[],
  omitted: boolean,
): string {
  const header =
    "<conversation-history>\nThe following is the conversation history from a previous coding tool in this session. Use it as context.\n\n";
  const footer = "\n</conversation-history>";
  const bodyParts = [...firstLines];
  if (omitted) {
    bodyParts.push(
      "[Trace omitted middle conversation entries to keep this resume prompt bounded.]",
    );
  }
  bodyParts.push(...selectedTail);
  return `${header}${bodyParts.join("\n\n")}${footer}`;
}

function buildMigrationPrompt(sourceGitStatusVerified: boolean): string {
  if (sourceGitStatusVerified) return "Continue this session on the new runtime.";
  return "Continue this session on the new runtime. Source git sync was not verified during the move; inspect the repository state before making changes.";
}

function buildToolSessionRecoveryPrompt(context: string | null): string {
  if (!context) {
    return "Continue this session. The previous local tool session was unavailable.";
  }
  return `${context}\n\nContinue this session using the latest user message in the conversation history above.`;
}

async function getSessionStartMetadata(sessionId: string): Promise<SessionStartMetadata> {
  const startEvent = await prisma.event.findFirst({
    where: { scopeId: sessionId, scopeType: "session", eventType: "session_started" },
    orderBy: { timestamp: "asc" },
  });

  if (!startEvent) {
    return {
      prompt: null,
      promptEventId: null,
      checkpointContextId: null,
      sourceSessionId: null,
      restoreCheckpointId: null,
      restoreCheckpointSha: null,
    };
  }

  const payload = startEvent.payload as Record<string, unknown>;
  const metadata = startEvent.metadata as Record<string, unknown> | null;
  return {
    prompt: typeof payload.prompt === "string" ? payload.prompt : null,
    promptEventId: startEvent.id,
    checkpointContextId:
      typeof metadata?.checkpointContextId === "string" ? metadata.checkpointContextId : null,
    sourceSessionId: typeof payload.sourceSessionId === "string" ? payload.sourceSessionId : null,
    restoreCheckpointId:
      typeof payload.restoreCheckpointId === "string" ? payload.restoreCheckpointId : null,
    restoreCheckpointSha:
      typeof payload.restoreCheckpointSha === "string" ? payload.restoreCheckpointSha : null,
  };
}

async function prependSourceSessionContext(
  sourceSessionId: string | null,
  prompt: string,
): Promise<string> {
  if (!sourceSessionId) return prompt;
  const context = await buildConversationContext(sourceSessionId);
  if (!context) return prompt;
  return `${context}\n\n${prompt}`;
}

function validateModelForTool(tool: string, model: string): string {
  const trimmed = model.trim();
  if (!trimmed) {
    throw new Error("Model cannot be empty");
  }
  if (!isSupportedModel(tool, trimmed)) {
    throw new Error(`Unsupported model "${trimmed}" for tool "${tool}"`);
  }
  return trimmed;
}

function validateReasoningEffortForTool(tool: string, effort: string): string {
  const trimmed = effort.trim();
  if (!trimmed) {
    throw new Error("Reasoning effort cannot be empty");
  }
  if (!isSupportedReasoningEffort(tool, trimmed)) {
    throw new Error(`Unsupported reasoning effort "${trimmed}" for tool "${tool}"`);
  }
  return trimmed;
}

function resolveStoredModelForTool(tool: CodingTool, model: string | null | undefined) {
  const trimmed = model?.trim();
  return trimmed && isSupportedModel(tool, trimmed) ? trimmed : undefined;
}

function resolveStoredReasoningEffortForTool(tool: CodingTool, effort: string | null | undefined) {
  const trimmed = effort?.trim();
  return trimmed && isSupportedReasoningEffort(tool, trimmed) ? trimmed : undefined;
}

function selectRuntimeSupportedTool(
  runtime: Pick<RuntimeInstance, "supportedTools">,
  preferredTool: CodingTool,
): CodingTool | null {
  if (runtime.supportedTools.includes(preferredTool)) return preferredTool;
  return LOCAL_TOOL_FALLBACK_ORDER.find((tool) => runtime.supportedTools.includes(tool)) ?? null;
}

const FULLY_UNLOADED_AGENT_STATUSES: readonly AgentStatus[] = ["failed", "stopped"];

export function isFullyUnloadedSession(
  agentStatus: AgentStatus,
  sessionStatus: SessionStatus,
  worktreeDeleted?: boolean | null,
): boolean {
  return (
    FULLY_UNLOADED_AGENT_STATUSES.includes(agentStatus) ||
    (sessionStatus === "merged" && worktreeDeleted !== false)
  );
}

export class SessionService {
  private async createGeneratedProjectGitCredential(input: {
    organizationId: string;
    sessionId: string;
    runtimeInstanceId: string;
    repo: { id: string; remoteUrl: string | null; defaultBranch: string };
    actorType: ActorType;
    actorId: string;
  }): Promise<{ repoId: string; repoRemoteUrl: string; defaultBranch: string }> {
    if (!input.repo.remoteUrl) {
      throw new ValidationError("Generated project managed git remote is unavailable");
    }
    const access = await managedGitService.mintAccessToken({
      organizationId: input.organizationId,
      repoId: input.repo.id,
      scope: "runtime",
      sessionId: input.sessionId,
      subject: input.runtimeInstanceId,
      capabilities: ["read", "write"],
      actorType: input.actorType,
      actorId: input.actorId,
    });
    const authenticatedUrl = new URL(input.repo.remoteUrl);
    authenticatedUrl.username = "trace";
    authenticatedUrl.password = access.token;
    return {
      repoId: input.repo.id,
      repoRemoteUrl: authenticatedUrl.toString(),
      defaultBranch: input.repo.defaultBranch,
    };
  }

  /**
   * Encapsulates the common createRuntime call used by startSession, run, and sendMessage.
   * Resolves repo/branch/hosting and delegates to the session router.
   */
  private provisionRuntime(params: {
    sessionId: string;
    sessionGroupId?: string | null;
    sessionGroupKind?: SessionGroupKind | null;
    slug?: string | null;
    preserveBranchName?: boolean;
    hosting: string;
    tool: string;
    model?: string | null;
    reasoningEffort?: string | null;
    repo?: { id: string; name: string; remoteUrl: string | null; defaultBranch: string } | null;
    branch?: string | null;
    checkpointSha?: string | null;
    createdById: string;
    organizationId: string;
    /** Actor that initiated provisioning; defaults to a user actor. Agents are
     * first-class, so the managed-git runtime token must be minted for them. */
    actorType?: ActorType;
    readOnly?: boolean;
    /** Adopt an existing local worktree at this path instead of creating one. */
    adoptWorktreePath?: string | null;
    adapterType?: RuntimeAdapterType;
    environment?: {
      id: string;
      name: string;
      adapterType: RuntimeAdapterType;
      config: Prisma.JsonValue;
    } | null;
  }): void {
    assertCloudRepoRemoteAvailable(params.hosting, params.repo);

    void (async () => {
      const environment = params.environment ?? (await this.resolveProvisioningEnvironment(params));
      // Resolve adoption: an explicit path (initial import) wins; otherwise a
      // previously-adopted group re-adopts its persisted worktree so re-provisioning
      // never creates a fresh Trace worktree. Adopted workspaces preserve their
      // branch name across provisions.
      let adoptWorktreePath = params.adoptWorktreePath ?? undefined;
      let preserveBranchName = params.preserveBranchName;
      if (!adoptWorktreePath && params.hosting === "local" && params.sessionGroupId) {
        const group = await prisma.sessionGroup.findUnique({
          where: { id: params.sessionGroupId },
          select: { worktreeAdopted: true, workdir: true },
        });
        if (group?.worktreeAdopted && group.workdir) {
          adoptWorktreePath = group.workdir;
        }
      }
      if (adoptWorktreePath) {
        preserveBranchName = true;
      }
      let slug = params.slug ?? undefined;
      if (!slug && params.sessionGroupId && params.repo?.id) {
        const runtimeUsedSlugs = await this.loadRuntimeWorkspaceSlugs({
          sessionId: params.sessionId,
          organizationId: params.organizationId,
          hosting: params.hosting,
          repoId: params.repo.id,
        });
        slug = await this.allocateSessionGroupSlug(
          params.sessionGroupId,
          params.repo.id,
          runtimeUsedSlugs,
        );
      }

      sessionRouter.createRuntime({
        sessionId: params.sessionId,
        sessionGroupId: params.sessionGroupId ?? undefined,
        sessionGroupKind: params.sessionGroupKind ?? undefined,
        prepareAppGit:
          isGeneratedProjectKind(params.sessionGroupKind) && params.repo?.remoteUrl
            ? (runtimeInstanceId) =>
                this.createGeneratedProjectGitCredential({
                  organizationId: params.organizationId,
                  sessionId: params.sessionId,
                  runtimeInstanceId,
                  repo: params.repo!,
                  actorType: params.actorType ?? "user",
                  actorId: params.createdById,
                })
            : undefined,
        slug: slug ?? undefined,
        preserveBranchName,
        hosting: params.hosting as "cloud" | "local",
        adapterType: params.adapterType,
        environment,
        tool: params.tool,
        model: params.model ?? undefined,
        reasoningEffort: params.reasoningEffort ?? undefined,
        repo: isGeneratedProjectKind(params.sessionGroupKind)
          ? null
          : params.repo
            ? {
                id: params.repo.id,
                name: params.repo.name,
                remoteUrl: params.repo.remoteUrl,
                defaultBranch: params.repo.defaultBranch,
              }
            : null,
        branch: params.branch ?? undefined,
        checkpointSha: params.checkpointSha ?? undefined,
        createdById: params.createdById,
        organizationId: params.organizationId,
        readOnly: params.readOnly,
        adoptWorktreePath,
        onLifecycle: (eventType, update) =>
          this.recordRuntimeLifecycle(params.sessionId, eventType, update),
        onFailed: (error) => this.workspaceFailed(params.sessionId, error),
        onWorkspaceReady: (workdir) => this.workspaceReady(params.sessionId, workdir),
      });
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      void this.workspaceFailed(params.sessionId, message);
    });
  }

  private async loadRuntimeWorkspaceSlugs(params: {
    sessionId: string;
    organizationId: string;
    hosting: string;
    repoId: string;
  }): Promise<string[]> {
    if (params.hosting !== "local") return [];
    const runtime = sessionRouter.getRuntimeForSession(params.sessionId);
    if (!runtime) {
      throw new Error("Cannot allocate a local workspace slug before selecting a runtime");
    }
    return sessionRouter.listWorkspaceSlugs(runtime.id, params.repoId, params.organizationId);
  }

  /**
   * Allocate a workspace slug for a session group, persisting it before the bridge
   * sees it. Used slugs are tracked across both the SessionGroup table
   * (scoped by repo) and the selected local runtime so a slug is not recycled
   * while a branch or worktree still exists on the user's bridge.
   */
  private async allocateSessionGroupSlug(
    sessionGroupId: string,
    repoId: string,
    runtimeUsedSlugs: Iterable<string> = [],
  ): Promise<string> {
    const MAX_ATTEMPTS = 10;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const existing = await prisma.sessionGroup.findUnique({
        where: { id: sessionGroupId },
        select: { slug: true },
      });
      if (existing?.slug) return existing.slug;

      const used = await prisma.sessionGroup.findMany({
        where: { repoId, slug: { not: null } },
        select: { slug: true },
      });
      const usedNames = new Set(
        (used ?? []).map((row) => row.slug).filter((s): s is string => !!s),
      );
      for (const slug of runtimeUsedSlugs) {
        if (slug) usedNames.add(slug);
      }
      const candidate = generateAnimalSlug(usedNames);

      try {
        await prisma.sessionGroup.update({
          where: { id: sessionGroupId },
          data: { slug: candidate },
        });
        return candidate;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          continue;
        }
        throw error;
      }
    }
    throw new Error(
      `Unable to allocate a unique workspace slug for session group ${sessionGroupId}`,
    );
  }

  private async resolveProvisioningEnvironment(params: {
    sessionId: string;
    organizationId: string;
    adapterType?: RuntimeAdapterType;
  }): Promise<{
    id: string;
    name: string;
    adapterType: RuntimeAdapterType;
    config: Prisma.JsonValue;
  } | null> {
    if (params.adapterType !== "provisioned") return null;
    const session = await prisma.session.findUnique({
      where: { id: params.sessionId },
      select: { connection: true },
    });
    const environmentId = this.parseConnection(session?.connection ?? null).environmentId;
    const environment = environmentId
      ? await prisma.agentEnvironment.findFirst({
          where: { id: environmentId, organizationId: params.organizationId },
          select: { id: true, name: true, adapterType: true, config: true },
        })
      : await prisma.agentEnvironment.findFirst({
          where: {
            organizationId: params.organizationId,
            adapterType: "provisioned",
            enabled: true,
            isDefault: true,
          },
          select: { id: true, name: true, adapterType: true, config: true },
        });
    const fallbackEnvironment =
      environment ??
      (environmentId
        ? null
        : await prisma.agentEnvironment.findFirst({
            where: {
              organizationId: params.organizationId,
              adapterType: "provisioned",
              enabled: true,
            },
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, adapterType: true, config: true },
          }));
    if (!fallbackEnvironment) return null;
    if (
      fallbackEnvironment.adapterType !== "local" &&
      fallbackEnvironment.adapterType !== "provisioned"
    ) {
      return null;
    }
    return {
      id: fallbackEnvironment.id,
      name: fallbackEnvironment.name,
      adapterType: fallbackEnvironment.adapterType,
      config: fallbackEnvironment.config,
    };
  }

  private async recordRuntimeLifecycle(
    sessionId: string,
    eventType: RuntimeLifecycleEventType,
    update: RuntimeLifecycleUpdate = {},
  ): Promise<void> {
    // Pull the immutable session metadata once for the event payload. The
    // connection itself is read inside `updateConnectionConditional` so we
    // re-read on retry and the write sees a consistent baseline.
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        organizationId: true,
        sessionGroupId: true,
        agentStatus: true,
        sessionStatus: true,
      },
    });
    if (!session) return;

    const result = await this.updateConnectionConditional(sessionId, (conn) => {
      if (update.runtimeInstanceId) {
        const isNewRuntimeRequest = eventType === "session_runtime_start_requested";
        // A new launch may claim an unbound session, but every subsequent
        // lifecycle event must belong to the runtime generation that is
        // currently persisted. In particular, an old stop event must not
        // apply after another path has cleared the binding while a new
        // runtime is starting.
        //
        // A new launch may ALSO claim a connection whose previous runtime ended
        // in a terminal state (failed/timed_out/stopped/deprovisioned): that
        // runtime is dead, so a fresh provision must be able to take over. Without
        // this, a startup timeout left the connection pinned to the dead runtime's
        // id, and every re-provision (a different id) was fenced out here — the
        // session could never recover.
        const canClaimStaleConnection =
          isNewRuntimeRequest &&
          (!conn.runtimeInstanceId || isRuntimeTerminalState(conn.state));
        if (conn.runtimeInstanceId !== update.runtimeInstanceId && !canClaimStaleConnection) {
          return null;
        }
      }

      if (
        isRuntimeTerminalState(conn.state) &&
        eventType !== "session_runtime_start_requested" &&
        eventType !== "session_runtime_start_failed" &&
        eventType !== "session_runtime_start_timed_out" &&
        eventType !== "session_runtime_stopping" &&
        eventType !== "session_runtime_stopped" &&
        eventType !== "session_runtime_deprovision_failed"
      ) {
        return null;
      }

      const adapterType = this.lifecycleAdapterType(conn, update);
      const nextState = this.lifecycleConnectionState(eventType, adapterType);
      if (
        conn.state === "connected" &&
        isRuntimeStartupState(nextState) &&
        (conn.runtimeInstanceId || conn.providerRuntimeId || conn.connectedAt)
      ) {
        return null;
      }

      return { ...conn, ...this.lifecycleConnectionPatch(eventType, conn, update, adapterType) };
    });

    if (!result) return;

    const adapterType = this.lifecycleAdapterType(result.updated, update);
    const lifecycleState = this.lifecycleConnectionState(eventType, adapterType);
    const sessionGroup = await this.syncGroupWorkspaceState(result.sessionGroupId, {
      connection: connJson(result.updated),
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType,
      payload: {
        type: "runtime_lifecycle",
        sessionId,
        lifecycleState,
        connection: connJson(result.updated),
        agentStatus: session.agentStatus,
        sessionStatus: session.sessionStatus,
        ...(update.runtimeInstanceId && { runtimeInstanceId: update.runtimeInstanceId }),
        ...(update.runtimeLabel && { runtimeLabel: update.runtimeLabel }),
        ...(update.providerRuntimeId && { providerRuntimeId: update.providerRuntimeId }),
        ...(update.providerRuntimeUrl && { providerRuntimeUrl: update.providerRuntimeUrl }),
        ...(update.providerStatus && { providerStatus: update.providerStatus }),
        ...(update.error && { error: update.error }),
        ...(update.abandoned && { abandoned: true }),
        ...(update.reconcileAttempts !== undefined && {
          reconcileAttempts: update.reconcileAttempts,
        }),
        ...(sessionGroup ? { sessionGroup } : {}),
      } as Prisma.InputJsonValue,
      actorType: "system",
      actorId: "system",
    });

    if (eventType === "session_runtime_stopped" && adapterType === "provisioned") {
      logAgentEnvironmentTelemetry("deprovision.completed", {
        organizationId: session.organizationId,
        sessionId,
        providerRuntimeId: result.updated.providerRuntimeId,
        timeToDeprovisionedMs: elapsedMs(result.updated.stoppingAt, result.updated.deprovisionedAt),
      });
    }

    if (eventType === "session_runtime_start_failed") {
      logAgentEnvironmentTelemetry("provisioned.start_failed", {
        organizationId: session.organizationId,
        sessionId,
        providerRuntimeId: update.providerRuntimeId,
        error: update.error,
      });
    }

    if (eventType === "session_runtime_deprovision_failed") {
      logAgentEnvironmentTelemetry("deprovision.failed", {
        organizationId: session.organizationId,
        sessionId,
        providerRuntimeId: update.providerRuntimeId ?? result.updated.providerRuntimeId,
        abandoned: update.abandoned === true,
        reconcileAttempts: update.reconcileAttempts,
        error: update.error,
      });
      if (update.abandoned === true) {
        alertAgentEnvironmentOperator("deprovision.abandoned_runtime", {
          organizationId: session.organizationId,
          sessionId,
          providerRuntimeId: update.providerRuntimeId ?? result.updated.providerRuntimeId,
          reconcileAttempts: update.reconcileAttempts,
        });
      }
    }
  }

  /**
   * Build the connection patch for a lifecycle event. Pure: takes the current
   * connection plus the event/update and returns the per-event field changes.
   * Caller composes via `{ ...conn, ...patch }`.
   */
  private lifecycleConnectionPatch(
    eventType: RuntimeLifecycleEventType,
    conn: SessionConnectionData,
    update: RuntimeLifecycleUpdate,
    adapterType: RuntimeAdapterType | null,
  ): Partial<SessionConnectionData> {
    const now = new Date().toISOString();
    const runtimePatch: Partial<SessionConnectionData> = {
      ...(update.runtimeInstanceId && { runtimeInstanceId: update.runtimeInstanceId }),
      ...(update.runtimeLabel && { runtimeLabel: update.runtimeLabel }),
      ...(update.providerRuntimeId && { providerRuntimeId: update.providerRuntimeId }),
      ...(update.providerRuntimeUrl && { providerRuntimeUrl: update.providerRuntimeUrl }),
      ...(update.providerStatus && { providerStatus: update.providerStatus }),
    };

    switch (eventType) {
      case "session_runtime_start_requested":
        return {
          ...runtimePatch,
          state: "requested",
          requestedAt: now,
          lastError: undefined,
          canRetry: true,
          canMove: true,
          autoRetryable: true,
        };
      case "session_runtime_provisioning":
        return {
          ...runtimePatch,
          state: "provisioning",
          provisioningAt: now,
          lastError: undefined,
          canRetry: true,
          canMove: true,
          autoRetryable: true,
        };
      case "session_runtime_connecting":
        return {
          ...runtimePatch,
          state: "connecting",
          connectingAt: now,
          lastError: undefined,
          canRetry: true,
          canMove: true,
          autoRetryable: true,
        };
      case "session_runtime_connected":
        return {
          ...runtimePatch,
          state: "connected",
          connectedAt: now,
          lastSeen: now,
          lastError: undefined,
          retryCount: 0,
          canRetry: true,
          canMove: true,
          autoRetryable: true,
        };
      case "session_runtime_start_failed":
        return {
          ...runtimePatch,
          state: "failed",
          failedAt: now,
          lastError: update.error ?? "Runtime failed to start",
          canRetry: true,
          canMove: true,
          autoRetryable: false,
        };
      case "session_runtime_start_timed_out":
        return {
          ...runtimePatch,
          state: "timed_out",
          timedOutAt: now,
          lastError: update.error ?? "Runtime startup timed out",
          canRetry: true,
          canMove: true,
          autoRetryable: false,
        };
      case "session_runtime_stopping":
        return {
          ...runtimePatch,
          state: "stopping",
          stoppingAt: now,
          lastError: undefined,
          canRetry: false,
          canMove: false,
          autoRetryable: false,
        };
      case "session_runtime_stopped":
        if (adapterType === "provisioned" && conn.disconnectOnDeprovision === true) {
          return {
            ...runtimePatch,
            state: "disconnected",
            stoppedAt: now,
            deprovisionedAt: now,
            disconnectedAt: now,
            lastError:
              typeof conn.disconnectReason === "string"
                ? conn.disconnectReason
                : "runtime_disconnected",
            canRetry: true,
            canMove: true,
            autoRetryable: false,
            disconnectOnDeprovision: false,
          };
        }
        return {
          ...runtimePatch,
          state: this.lifecycleConnectionState(eventType, adapterType),
          stoppedAt: now,
          ...(adapterType === "provisioned" && { deprovisionedAt: now }),
          lastError: undefined,
          canRetry: false,
          canMove: false,
          autoRetryable: false,
        };
      case "session_runtime_deprovision_failed": {
        const abandoned = update.abandoned === true;
        return {
          ...runtimePatch,
          state: "deprovision_failed",
          deprovisionFailedAt: now,
          deprovisionAttempts: (conn.deprovisionAttempts ?? 0) + 1,
          lastError: update.error ?? "Runtime deprovisioning failed",
          canRetry: !abandoned,
          canMove: false,
          autoRetryable: false,
          ...(abandoned && { abandonedAt: now }),
        };
      }
    }
    // Every RuntimeLifecycleEventType has a switch case above. If we land
    // here, a new event type was added to the union without updating this
    // method — fail loudly so the gap is caught in tests rather than
    // silently corrupting connection state.
    throw new Error(`Unhandled runtime lifecycle event type: ${eventType}`);
  }

  private lifecycleConnectionState(
    eventType: RuntimeLifecycleEventType,
    adapterType?: RuntimeAdapterType | null,
  ): SessionConnectionData["state"] {
    switch (eventType) {
      case "session_runtime_start_requested":
        return "requested";
      case "session_runtime_provisioning":
        return "provisioning";
      case "session_runtime_connecting":
        return "connecting";
      case "session_runtime_connected":
        return "connected";
      case "session_runtime_start_failed":
        return "failed";
      case "session_runtime_start_timed_out":
        return "timed_out";
      case "session_runtime_stopping":
        return "stopping";
      case "session_runtime_stopped":
        return adapterType === "provisioned" ? "deprovisioned" : "stopped";
      case "session_runtime_deprovision_failed":
        return "deprovision_failed";
    }
    return "failed";
  }

  private lifecycleAdapterType(
    conn: SessionConnectionData,
    update: RuntimeLifecycleUpdate,
  ): RuntimeAdapterType | null {
    if (conn.adapterType === "local" || conn.adapterType === "provisioned") {
      return conn.adapterType;
    }
    if (update.providerRuntimeId) return "provisioned";
    return null;
  }

  private destroyRuntimeOptions(sessionId: string, reason: string) {
    return {
      reason,
      onLifecycle: (eventType: RuntimeLifecycleEventType, update?: RuntimeLifecycleUpdate) =>
        this.recordRuntimeLifecycle(sessionId, eventType, update),
    };
  }

  /**
   * Optimistic-locking primitive for `Session.connection` writes.
   *
   * Reads connection, calls `mutator(current)` to compute the next value,
   * then `updateMany` with `WHERE connection.version = current.version`. If
   * the update affects 0 rows the row was changed under us — re-read and
   * retry. Returns the persisted next value, or `null` if the mutator
   * declined (returned `null`) or the session no longer exists.
   *
   * Each successful write bumps `connection.version`. Only writers that go
   * through this helper participate in the lock, but it is enough to make
   * reconciler/abandon/reset paths safe against each other and against
   * lifecycle events that route through `recordRuntimeLifecycle` (which
   * uses the helper for new write paths).
   */
  private async updateConnectionConditional(
    sessionId: string,
    mutator: (current: SessionConnectionData) => SessionConnectionData | null,
    options?: { maxAttempts?: number },
  ): Promise<{ updated: SessionConnectionData; sessionGroupId: string | null } | null> {
    const maxAttempts = options?.maxAttempts ?? MAX_CONNECTION_UPDATE_ATTEMPTS;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        select: { connection: true, sessionGroupId: true },
      });
      if (!session) return null;
      const current = this.parseConnection(session.connection);
      const next = mutator(current);
      if (!next) return null;

      const expectedVersion = current.version ?? 0;
      const nextWithVersion: SessionConnectionData = {
        ...next,
        version: expectedVersion + 1,
      };

      const result = await prisma.session.updateMany({
        where: connectionVersionWhere(sessionId, expectedVersion),
        data: { connection: connJson(nextWithVersion) },
      });
      if (result.count === 1) {
        const runtimeBindingChanged = hasRuntimeBindingChanged(current, nextWithVersion);
        await this.syncGroupWorkspaceState(
          session.sessionGroupId,
          { connection: connJson(nextWithVersion) },
          {
            rebindSessionsToConnection: runtimeBindingChanged,
            destroyGroupTerminals: runtimeBindingChanged,
          },
        );
        return { updated: nextWithVersion, sessionGroupId: session.sessionGroupId };
      }
      // Version mismatch — another writer landed first. Loop and retry.
    }
    throw new Error(
      `Failed to update session connection for ${sessionId} after ${maxAttempts} attempts`,
    );
  }

  /**
   * Clear reconciler bookkeeping so a user-initiated retry gets a fresh
   * MAX_RECONCILE_ATTEMPTS budget. No-op if no prior reconciler activity.
   * Conditional on the connection still having reconciler state so we don't
   * race with concurrent writes that have already advanced the state.
   */
  private async resetReconcileState(sessionId: string): Promise<void> {
    await this.updateConnectionConditional(sessionId, (conn) => {
      if (!conn.abandonedAt && (conn.reconcileAttempts ?? 0) === 0) return null;
      return { ...conn, reconcileAttempts: 0, abandonedAt: undefined };
    });
  }

  /**
   * Find sessions whose provisioned runtime is stuck in stopping or
   * deprovision_failed and retry the adapter stop.
   *
   * Bridge disconnection is only a signal; provider compute can outlive a
   * dropped bridge. The reconciler is what eventually drives the launcher
   * back to a stopped state without depending on the original delete request
   * still being in flight.
   *
   * Each pickup increments `connection.reconcileAttempts`. After
   * `MAX_RECONCILE_ATTEMPTS` the runtime is marked abandoned
   * (`autoRetryable: false`, `abandonedAt` set, terminal `deprovision_failed`
   * event emitted) and skipped on future ticks. Recovery requires operator
   * intervention.
   */
  async reconcileStuckDeprovisions(options?: {
    now?: number;
    stuckAfterMs?: number;
    limit?: number;
  }): Promise<{ reconciled: string[]; abandoned: string[] }> {
    const now = options?.now ?? Date.now();
    const stuckAfterMs = options?.stuckAfterMs ?? 60_000;
    const limit = options?.limit ?? 25;
    const cutoff = new Date(now - stuckAfterMs);

    const candidates = await prisma.session.findMany({
      where: {
        connection: {
          path: ["adapterType"],
          equals: "provisioned",
        },
        AND: [
          {
            OR: [
              { connection: { path: ["state"], equals: "stopping" } },
              { connection: { path: ["state"], equals: "deprovision_failed" } },
            ],
          },
        ],
      },
      orderBy: { updatedAt: "asc" },
      select: {
        id: true,
        hosting: true,
        organizationId: true,
        workdir: true,
        repoId: true,
        connection: true,
      },
      take: limit,
    });

    const reconciled: string[] = [];
    const abandoned: string[] = [];
    for (const candidate of candidates) {
      const conn = this.parseConnection(candidate.connection);

      // Skip already-abandoned sessions (autoRetryable was flipped off on a
      // prior tick). Operator must reset the connection to retry.
      if (conn.autoRetryable === false && conn.abandonedAt) continue;

      const lastTouchedAt = this.lastDeprovisionTouchAt(conn);
      if (lastTouchedAt && lastTouchedAt > cutoff) continue;

      const attemptsSoFar = conn.reconcileAttempts ?? 0;
      if (attemptsSoFar >= MAX_RECONCILE_ATTEMPTS) {
        await this.markRuntimeAbandoned(candidate.id, attemptsSoFar);
        abandoned.push(candidate.id);
        continue;
      }

      try {
        // Bump conditionally — if the state moved between findMany and now
        // (e.g., user delete just landed), skip this candidate rather than
        // step on the concurrent change. A throw from the optimistic-
        // locking helper (concurrent writers won every retry) is treated
        // the same: skip this tick, try again next interval.
        const bumped = await this.bumpReconcileAttempts(candidate.id, attemptsSoFar + 1);
        if (!bumped) continue;

        await sessionRouter.destroyRuntime(
          candidate.id,
          candidate,
          this.destroyRuntimeOptions(candidate.id, "deprovision_reconciliation"),
        );
        reconciled.push(candidate.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[session-service] reconcile stuck deprovision failed for ${candidate.id}: ${message}`,
        );
      }
    }
    return { reconciled, abandoned };
  }

  private async bumpReconcileAttempts(sessionId: string, nextValue: number): Promise<boolean> {
    const result = await this.updateConnectionConditional(sessionId, (conn) => {
      // Only bump while the runtime is still in a deprovision-pending state.
      // If state has moved (user retried, manual reset), abandon the bump.
      if (conn.state !== "stopping" && conn.state !== "deprovision_failed") {
        return null;
      }
      return { ...conn, reconcileAttempts: nextValue };
    });
    return result !== null;
  }

  private async markRuntimeAbandoned(sessionId: string, attempts: number): Promise<void> {
    // Route through the lifecycle event path so the abandoned variant of
    // session_runtime_deprovision_failed is the single emitter for that
    // event type. recordRuntimeLifecycle handles state precondition logic
    // (terminal-state guard) and event payload construction in one place.
    await this.recordRuntimeLifecycle(sessionId, "session_runtime_deprovision_failed", {
      abandoned: true,
      reconcileAttempts: attempts,
      error: `Runtime deprovision abandoned after ${attempts} reconcile attempts`,
    });
    console.warn(
      `[session-service] runtime deprovision abandoned after ${attempts} reconcile attempts for ${sessionId}`,
    );
  }

  private lastDeprovisionTouchAt(conn: SessionConnectionData): Date | null {
    const candidates = [conn.deprovisionFailedAt, conn.stoppingAt].filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    if (candidates.length === 0) return null;
    let latest: Date | null = null;
    for (const value of candidates) {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) continue;
      if (!latest || parsed > latest) latest = parsed;
    }
    return latest;
  }

  private async assertRuntimeAccess(params: {
    userId: string;
    organizationId: string;
    runtimeInstanceId?: string | null;
    sessionGroupId?: string | null;
    capability?: "session" | "terminal";
    failureMessage?: string;
  }): Promise<void> {
    try {
      await runtimeAccessService.assertAccess({
        userId: params.userId,
        organizationId: params.organizationId,
        runtimeInstanceId: params.runtimeInstanceId,
        sessionGroupId: params.sessionGroupId,
        capability: params.capability,
      });
    } catch (error) {
      if (params.failureMessage && error instanceof Error) {
        throw new Error(params.failureMessage, { cause: error });
      }
      throw error;
    }
  }

  private async assertPrivateRuntimeOwner(params: {
    visibility?: string | null;
    ownerUserId?: string | null;
    organizationId: string;
    hosting?: string | null;
    runtimeInstanceId?: string | null;
  }): Promise<void> {
    if (params.visibility !== "private") return;
    if (params.hosting === "cloud") {
      throw new ValidationError("Private sessions can only run on the owner's local bridge");
    }
    if (!params.runtimeInstanceId) return;
    if (!params.ownerUserId) {
      throw new ValidationError("Private session groups require an owner");
    }

    const liveRuntime = sessionRouter.getRuntime(params.runtimeInstanceId, params.organizationId);
    if (liveRuntime) {
      if (liveRuntime.hostingMode !== "local" || liveRuntime.ownerUserId !== params.ownerUserId) {
        throw new ValidationError("Private sessions can only run on the owner's local bridge");
      }
      return;
    }

    const persistedRuntime = await prisma.bridgeRuntime.findFirst({
      where: { instanceId: params.runtimeInstanceId, organizationId: params.organizationId },
      select: { ownerUserId: true },
    });
    if (!persistedRuntime || persistedRuntime.ownerUserId !== params.ownerUserId) {
      throw new ValidationError("Private sessions can only run on the owner's local bridge");
    }
  }

  private assertPrivateGroupOwner(
    group: { visibility: string; ownerUserId: string },
    userId: string,
  ) {
    if (group.visibility === "private" && group.ownerUserId !== userId) {
      throw new AuthorizationError("Private session groups can only be used by their owner");
    }
  }

  private async resolveDefaultAccessibleLocalRuntime(params: {
    userId: string;
    organizationId: string;
    tool?: string;
    repoId?: string | null;
    sessionGroupId?: string | null;
  }): Promise<RuntimeInstance | undefined> {
    const accessibleRuntimeIds = await runtimeAccessService.listAccessibleRuntimeInstanceIds({
      userId: params.userId,
      organizationId: params.organizationId,
      sessionGroupId: params.sessionGroupId,
    });

    for (const runtime of sessionRouter.listRuntimes({ hostingMode: "local" })) {
      if (runtime.organizationId !== params.organizationId) continue;
      if (!accessibleRuntimeIds.has(runtime.id)) continue;
      if (params.tool && !runtime.supportedTools.includes(params.tool)) continue;
      if (params.repoId && !runtime.registeredRepoIds.includes(params.repoId)) continue;
      return runtime;
    }

    return undefined;
  }

  private async resolveAccessibleLocalRuntimeBinding(params: {
    sessionId: string;
    sessionGroupId?: string | null;
    organizationId: string;
    userId: string;
    hosting: string | null;
    tool: CodingTool;
    allowToolFallback?: boolean;
    repoId?: string | null;
    connection: unknown;
    failureMessage?: string;
  }): Promise<{
    runtimeId: string | null;
    runtimeLabel: string | null;
    fallbackTool?: CodingTool;
  }> {
    const conn = this.parseConnection(params.connection);
    if (params.hosting !== "local") {
      return {
        runtimeId: conn.runtimeInstanceId ?? null,
        runtimeLabel: conn.runtimeLabel ?? null,
      };
    }

    if (conn.runtimeInstanceId) {
      await this.assertRuntimeAccess({
        userId: params.userId,
        organizationId: params.organizationId,
        runtimeInstanceId: conn.runtimeInstanceId,
        sessionGroupId: params.sessionGroupId,
        failureMessage: params.failureMessage,
      });
      const runtime = sessionRouter.getRuntime(conn.runtimeInstanceId, params.organizationId);
      if (runtime) {
        const supportsTool = runtime.supportedTools?.includes(params.tool) ?? true;
        if (!supportsTool) {
          if (!params.allowToolFallback) {
            throw new ToolNotInstalledError(
              params.tool,
              runtime.label ?? conn.runtimeLabel ?? null,
            );
          }
          const fallbackTool = selectRuntimeSupportedTool(runtime, params.tool);
          if (!fallbackTool) {
            throw new Error("Selected runtime does not support any known coding tool");
          }
          sessionRouter.bindSession(params.sessionId, runtime.key);
          return {
            runtimeId: conn.runtimeInstanceId,
            runtimeLabel: runtime.label ?? conn.runtimeLabel ?? null,
            fallbackTool,
          };
        }
        sessionRouter.bindSession(params.sessionId, runtime.key);
      }
      return {
        runtimeId: conn.runtimeInstanceId,
        runtimeLabel: runtime?.label ?? conn.runtimeLabel ?? null,
      };
    }

    let runtime = await this.resolveDefaultAccessibleLocalRuntime({
      userId: params.userId,
      organizationId: params.organizationId,
      tool: params.tool,
      repoId: params.repoId,
      sessionGroupId: params.sessionGroupId,
    });
    let fallbackTool: CodingTool | undefined;
    if (!runtime && params.allowToolFallback) {
      runtime = await this.resolveDefaultAccessibleLocalRuntime({
        userId: params.userId,
        organizationId: params.organizationId,
        repoId: params.repoId,
        sessionGroupId: params.sessionGroupId,
      });
      fallbackTool = runtime
        ? (selectRuntimeSupportedTool(runtime, params.tool) ?? undefined)
        : undefined;
      if (runtime && !fallbackTool) {
        throw new Error("Selected runtime does not support any known coding tool");
      }
    }
    if (!runtime) {
      throw new Error("No accessible local runtime available");
    }

    sessionRouter.bindSession(params.sessionId, runtime.key);
    return {
      runtimeId: runtime.id,
      runtimeLabel: runtime.label,
      ...(fallbackTool && { fallbackTool }),
    };
  }

  private normalizeFilePath(filePath: string): string {
    if (!filePath) {
      throw new Error(INVALID_FILE_PATH_ERROR);
    }
    // Allow absolute paths through — the bridge validates they're inside the workdir.
    // Just block path traversal segments for relative paths.
    if (!filePath.startsWith("/")) {
      const parts = filePath.split("/");
      if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
        throw new Error(INVALID_FILE_PATH_ERROR);
      }
    }
    return filePath;
  }

  private normalizeDirectoryPath(directoryPath: string): string {
    if (directoryPath === "") return "";
    if (directoryPath.startsWith("/")) {
      throw new Error(INVALID_FILE_PATH_ERROR);
    }
    const parts = directoryPath.split("/");
    if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
      throw new Error(INVALID_FILE_PATH_ERROR);
    }
    return directoryPath;
  }

  private async resolveAccessibleSessionGroupRuntime(
    sessionGroupId: string,
    organizationId: string,
    userId: string,
    options: { requireWrite?: boolean } = {},
  ): Promise<{ runtimeId: string; sessionId: string; workdirHint?: string }> {
    const group = await prisma.sessionGroup.findFirst({
      where: { id: sessionGroupId, organizationId },
      select: {
        id: true,
        workdir: true,
        worktreeDeleted: true,
        connection: true,
        visibility: true,
        ownerUserId: true,
      },
    });
    if (!group) throw new Error("Session group not found");
    if (!canViewSessionGroup(group, userId)) {
      throw new AuthorizationError("Not authorized for this session group");
    }
    if (group.worktreeDeleted) {
      throw new Error("Cannot access files: session worktree has been deleted");
    }

    const sessions = await prisma.session.findMany({
      where: { sessionGroupId, organizationId },
      select: { id: true, workdir: true, connection: true },
    });

    const resolveSessionRuntimeId = (session: { id: string; connection: unknown }): string | null =>
      this.getConnectionRuntimeInstanceId(session.connection) ??
      sessionRouter.getRuntimeForSession(session.id)?.id ??
      null;

    const groupRuntimeId = this.getConnectionRuntimeInstanceId(group.connection);
    if (groupRuntimeId) {
      const runtime = sessionRouter.getRuntime(groupRuntimeId, organizationId);
      if (!runtime) {
        throw new Error("No connected runtime available for this session group");
      }
      if (options.requireWrite) {
        this.assertSessionGroupFileWriteAccess(group, runtime, userId);
      }
      await this.assertRuntimeAccess({
        userId,
        organizationId,
        runtimeInstanceId: groupRuntimeId,
        sessionGroupId,
        capability: "session",
        failureMessage: LOCAL_FILE_ACCESS_DENIED_ERROR,
      });

      const sessionOnGroupRuntime = sessions.find(
        (session: { id: string; workdir: string | null; connection: unknown }) =>
          resolveSessionRuntimeId(session) === groupRuntimeId,
      );
      if (!sessionOnGroupRuntime) {
        throw new Error("No session is bound to the current session group runtime");
      }

      return {
        runtimeId: runtime.key,
        sessionId: sessionOnGroupRuntime.id,
        workdirHint: sessionOnGroupRuntime.workdir ?? group.workdir ?? undefined,
      };
    }

    let accessDenied = false;
    for (const session of sessions) {
      const runtimeId = resolveSessionRuntimeId(session);
      if (!runtimeId) continue;
      const runtime = sessionRouter.getRuntime(runtimeId, organizationId);
      if (!runtime) continue;
      try {
        if (options.requireWrite) {
          this.assertSessionGroupFileWriteAccess(group, runtime, userId);
        }
        await this.assertRuntimeAccess({
          userId,
          organizationId,
          runtimeInstanceId: runtimeId,
          sessionGroupId,
          capability: "session",
          failureMessage: LOCAL_FILE_ACCESS_DENIED_ERROR,
        });
      } catch (error) {
        if (error instanceof Error && error.message === LOCAL_FILE_ACCESS_DENIED_ERROR) {
          accessDenied = true;
          continue;
        }
        throw error;
      }
      return {
        runtimeId: runtime.key,
        sessionId: session.id,
        workdirHint: session.workdir ?? group.workdir ?? undefined,
      };
    }

    if (accessDenied) {
      throw new Error(LOCAL_FILE_ACCESS_DENIED_ERROR);
    }
    throw new Error("No connected runtime available for this session group");
  }

  private assertSessionGroupFileWriteAccess(
    group: { ownerUserId: string | null },
    runtime: RuntimeInstance,
    userId: string,
  ): void {
    if (group.ownerUserId === userId) return;
    if (runtime.hostingMode === "cloud") {
      throw new AuthorizationError("Not authorized to edit this session group");
    }
  }

  private getConnectionRuntimeInstanceId(connection: unknown): string | null {
    if (!connection || typeof connection !== "object" || Array.isArray(connection)) {
      return null;
    }

    const runtimeInstanceId = (connection as { runtimeInstanceId?: unknown }).runtimeInstanceId;
    return typeof runtimeInstanceId === "string" && runtimeInstanceId.trim()
      ? runtimeInstanceId
      : null;
  }

  private async resolveLinkedCheckoutRuntimeContext(
    sessionGroupId: string,
    repoId: string,
    organizationId: string,
    userId: string,
    options: { runtimeInstanceId?: string; requireRegisteredRepo?: boolean } = {},
  ): Promise<{
    runtimeId: string;
    runtimeInstanceId: string;
    group: LinkedCheckoutRuntimeGroup;
  }> {
    const group = await prisma.sessionGroup.findFirst({
      where: { id: sessionGroupId, organizationId },
      select: {
        id: true,
        repoId: true,
        branch: true,
        workdir: true,
        connection: true,
        visibility: true,
        ownerUserId: true,
        sessions: {
          select: {
            id: true,
            repoId: true,
            branch: true,
            workdir: true,
          },
        },
      },
    });
    if (!group) throw new Error("Session group not found");
    if (!canViewSessionGroup(group, userId)) {
      throw new AuthorizationError("Not authorized for this session group");
    }

    const repoMatchesGroup =
      group.repoId === repoId ||
      group.sessions.some((session: { repoId: string | null }) => session.repoId === repoId);
    if (!repoMatchesGroup) {
      throw new Error("Session group is not associated with this repo");
    }

    const groupRuntimeId = this.getConnectionRuntimeInstanceId(group.connection);
    const ownedRuntimesForRepo = sessionRouter
      .listRuntimes({ hostingMode: "local" })
      .filter((candidate) => {
        if (candidate.organizationId !== organizationId) return false;
        if (candidate.ownerUserId !== userId) return false;
        if (options.requireRegisteredRepo && !candidate.registeredRepoIds.includes(repoId)) {
          return false;
        }
        if (candidate.ws.readyState !== candidate.ws.OPEN) return false;

        return true;
      });
    const runtime = options.runtimeInstanceId
      ? ownedRuntimesForRepo.find((candidate) => candidate.id === options.runtimeInstanceId)
      : (ownedRuntimesForRepo.find((candidate) => candidate.id === groupRuntimeId) ??
        ownedRuntimesForRepo.find((candidate) => candidate.registeredRepoIds.includes(repoId)) ??
        ownedRuntimesForRepo[0]);

    if (!runtime) {
      throw new Error(
        options.runtimeInstanceId
          ? "Requested local runtime is not connected or not available for this repo"
          : options.requireRegisteredRepo
            ? "No connected local runtime with this repo linked"
            : "No connected local runtime available",
      );
    }

    return { runtimeId: runtime.key, runtimeInstanceId: runtime.id, group };
  }

  private async resolveLinkedCheckoutRuntime(
    sessionGroupId: string,
    repoId: string,
    organizationId: string,
    userId: string,
    options: { runtimeInstanceId?: string; requireRegisteredRepo?: boolean } = {},
  ): Promise<string> {
    const { runtimeId } = await this.resolveLinkedCheckoutRuntimeContext(
      sessionGroupId,
      repoId,
      organizationId,
      userId,
      options,
    );
    return runtimeId;
  }

  private async refreshLinkedCheckoutBranchFromBridge(params: {
    organizationId: string;
    repoId: string;
    group: LinkedCheckoutRuntimeGroup;
  }): Promise<string | null> {
    const sessionsForRepo = params.group.sessions.filter(
      (session) => params.group.repoId === params.repoId || session.repoId === params.repoId,
    );
    const candidateSessions = sessionsForRepo.length > 0 ? sessionsForRepo : params.group.sessions;
    const session =
      candidateSessions.find(
        (candidate) => candidate.workdir && candidate.workdir === params.group.workdir,
      ) ??
      candidateSessions.find((candidate) => candidate.workdir) ??
      candidateSessions[0] ??
      null;
    const workdirHint = session?.workdir ?? params.group.workdir ?? undefined;

    if (!session) return null;

    const ownerRuntimeInstanceId = this.getConnectionRuntimeInstanceId(params.group.connection);
    if (!ownerRuntimeInstanceId) return null;

    const ownerRuntime = sessionRouter
      .listRuntimes()
      .find(
        (candidate) =>
          candidate.organizationId === params.organizationId &&
          candidate.id === ownerRuntimeInstanceId &&
          candidate.ws.readyState === candidate.ws.OPEN,
      );
    if (!ownerRuntime) return null;

    let branch: string | null;
    try {
      branch = await sessionRouter.inspectSessionCurrentBranch(
        ownerRuntime.key,
        { sessionId: session.id, workdirHint },
        LINKED_CHECKOUT_BRANCH_REFRESH_TIMEOUT_MS,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[session-service] failed to refresh branch before linked checkout sync for ${params.group.id}: ${message}`,
      );
      return null;
    }

    const currentBranch = branch?.trim();
    if (!currentBranch) return null;

    const trackedGroupBranch = params.group.branch ?? null;
    const trackedSessionBranch = session.branch ?? trackedGroupBranch;
    if (currentBranch !== trackedGroupBranch || currentBranch !== trackedSessionBranch) {
      await this.updateBranch(session.id, currentBranch);
    }

    return currentBranch;
  }

  private async assertRepoExists(repoId: string, organizationId: string): Promise<void> {
    const repo = await prisma.repo.findFirst({
      where: { id: repoId, organizationId },
      select: { id: true },
    });
    if (!repo) throw new Error("Repo not found");
  }

  /** Channel-less generated project groups for the Apps and Designs sidebar sections. */
  async listAppGroups(organizationId: string, userId: string) {
    return this.listGeneratedProjectGroups("app", organizationId, userId);
  }

  async listDesignGroups(organizationId: string, userId: string) {
    return this.listGeneratedProjectGroups("design", organizationId, userId);
  }

  async listPdfGroups(organizationId: string, userId: string) {
    return this.listGeneratedProjectGroups("pdf", organizationId, userId);
  }

  private async listGeneratedProjectGroups(
    kind: "app" | "design" | "pdf",
    organizationId: string,
    userId: string,
  ) {
    const groups = await prisma.sessionGroup.findMany({
      where: {
        organizationId,
        kind,
        archivedAt: null,
        AND: [visibleSessionGroupWhere(userId)],
      },
      include: SESSION_GROUP_INCLUDE,
      // Bound this org-wide listing so it can't grow without limit as an org
      // accumulates apps. The sidebar shows the most recent apps; the tail is
      // reachable via search/dedicated views when those land.
      orderBy: { updatedAt: "desc" },
      take: GENERATED_PROJECT_GROUP_LIST_LIMIT,
    });

    type SessionGroupWithSessions = SessionGroupSummary & {
      sessions: SessionWithTimestamps[];
    };

    return (groups as SessionGroupWithSessions[])
      .map((group) => {
        const sessions = sortSessionsByRecency<SessionWithTimestamps>(group.sessions);
        return {
          ...buildSessionGroupSnapshot(group, sessions),
          sessions,
        };
      })
      .sort((a, b) => {
        const aLatest = a.sessions[0];
        const bLatest = b.sessions[0];
        const aTs = aLatest?.lastMessageAt ?? aLatest?.updatedAt ?? a.updatedAt;
        const bTs = bLatest?.lastMessageAt ?? bLatest?.updatedAt ?? b.updatedAt;
        return bTs.getTime() - aTs.getTime();
      });
  }

  async listGroups(
    channelId: string,
    organizationId: string,
    userId: string,
    options?: { archived?: boolean; status?: string; includeActiveMerged?: boolean },
  ) {
    const where: Prisma.SessionGroupWhereInput = {
      channelId,
      organizationId,
      AND: [visibleSessionGroupWhere(userId)],
    };

    const shouldIncludeArchived = options?.archived === true || options?.status === "archived";
    if (shouldIncludeArchived) {
      where.archivedAt = { not: null };
    } else {
      // Default: only non-archived groups (covers false, undefined, omitted)
      where.archivedAt = null;
    }

    const groups = await prisma.sessionGroup.findMany({
      where,
      include: SESSION_GROUP_INCLUDE,
    });

    type SessionGroupWithSessions = SessionGroupSummary & {
      sessions: SessionWithTimestamps[];
    };

    const mapped = (groups as SessionGroupWithSessions[]).map((group) => {
      const sessions = sortSessionsByRecency<SessionWithTimestamps>(group.sessions);
      return {
        ...buildSessionGroupSnapshot(group, sessions),
        sessions,
      };
    });

    type MappedGroup = (typeof mapped)[number];

    // Post-query filter for derived status (computed from child sessions)
    let filtered = mapped;
    if (options?.status) {
      filtered = mapped.filter((g: MappedGroup) => g.status === options.status);
    } else if (!shouldIncludeArchived) {
      // Default main table: exclude merged groups, except merged groups whose worktree
      // is still retained when the caller opts in via includeActiveMerged.
      filtered = mapped.filter((g: MappedGroup) => {
        if (g.status !== "merged") return true;
        return options?.includeActiveMerged === true && g.worktreeDeleted === false;
      });
    }

    return filtered.sort((a: MappedGroup, b: MappedGroup) => {
      const aLatest = a.sessions[0];
      const bLatest = b.sessions[0];
      const aTs = aLatest?.lastMessageAt ?? aLatest?.updatedAt ?? a.updatedAt;
      const bTs = bLatest?.lastMessageAt ?? bLatest?.updatedAt ?? b.updatedAt;
      return bTs.getTime() - aTs.getTime();
    });
  }

  async getGroup(id: string, organizationId: string, userId: string) {
    const group = await prisma.sessionGroup.findFirst({
      where: { id, organizationId, AND: [visibleSessionGroupWhere(userId)] },
      include: SESSION_GROUP_INCLUDE,
    });

    if (!group) return null;
    const typedGroup = group as SessionGroupSummary & {
      sessions: SessionWithTimestamps[];
    };
    const sessions = sortSessionsByRecency<SessionWithTimestamps>(typedGroup.sessions);
    return {
      ...buildSessionGroupSnapshot(typedGroup, sessions),
      sessions,
    };
  }

  async renameGroup(
    groupId: string,
    organizationId: string,
    name: string,
    actorType: ActorType = "system",
    actorId: string = "system",
  ) {
    if (actorId !== "system") {
      await assertSessionGroupAccess(groupId, actorId, organizationId);
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new ValidationError("Workspace name cannot be empty");
    }
    if (trimmedName.length > MAX_WORKSPACE_NAME_LENGTH) {
      throw new ValidationError(
        `Workspace name cannot exceed ${MAX_WORKSPACE_NAME_LENGTH} characters`,
      );
    }

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const group = await tx.sessionGroup.findFirst({
        where: { id: groupId, organizationId },
        select: {
          id: true,
          name: true,
          sessions: {
            select: { id: true },
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            take: 1,
          },
        },
      });
      if (!group) throw new Error("Session group not found");

      if (group.name !== trimmedName) {
        await tx.sessionGroup.update({
          where: { id: groupId },
          data: { name: trimmedName },
        });
      }

      const sessionGroup = await this.loadSessionGroupSnapshot(groupId, tx);
      if (!sessionGroup) throw new Error("Session group not found");

      if (group.name !== trimmedName) {
        const event = await eventService.create(
          {
            organizationId,
            scopeType: "session",
            scopeId: group.sessions[0]?.id ?? groupId,
            eventType: "session_group_renamed",
            payload: {
              sessionGroupId: groupId,
              name: trimmedName,
              sessionGroup,
            },
            actorType,
            actorId,
            deferPublish: true,
          },
          tx,
        );
        return { sessionGroup, event };
      }

      return { sessionGroup, event: null };
    });

    if (result.event) {
      eventService.publishCreated(result.event);
    }

    return result.sessionGroup;
  }

  async getGroupStatusSources(sessionGroupId: string) {
    return prisma.session.findMany({
      where: { sessionGroupId },
      select: { agentStatus: true, sessionStatus: true },
    });
  }

  async getGroupSessions(sessionGroupId: string) {
    return prisma.session.findMany({
      where: { sessionGroupId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: SESSION_INCLUDE,
    });
  }

  async updateGroupVisibility(
    groupId: string,
    organizationId: string,
    visibility: "public" | "private",
    actorType: ActorType = "system",
    actorId: string = "system",
  ) {
    const current = await prisma.sessionGroup.findFirst({
      where: { id: groupId, organizationId },
      select: {
        id: true,
        visibility: true,
        ownerUserId: true,
        channelId: true,
        connection: true,
        sessions: {
          select: { id: true },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          take: 1,
        },
      },
    });
    if (!current) throw new Error("Session group not found");
    if (current.ownerUserId !== actorId) {
      throw new AuthorizationError("Only the session group owner can change visibility");
    }

    if (visibility === "private") {
      await this.assertPrivateRuntimeOwner({
        visibility,
        ownerUserId: current.ownerUserId,
        organizationId,
        hosting: null,
        runtimeInstanceId: this.getConnectionRuntimeInstanceId(current.connection),
      });
    }

    if (current.visibility === visibility) {
      const sessionGroup = await this.loadSessionGroupSnapshot(groupId);
      if (!sessionGroup) throw new Error("Session group not found");
      return sessionGroup;
    }

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.sessionGroup.update({
        where: { id: groupId },
        data: { visibility },
        select: {
          id: true,
          visibility: true,
          ownerUserId: true,
          channelId: true,
          connection: true,
          sessions: {
            select: { id: true },
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            take: 1,
          },
        },
      });

      const sessionGroup = await this.loadSessionGroupSnapshot(groupId, tx);
      if (!sessionGroup) throw new Error("Session group not found");
      const scopeId = updated.sessions[0]?.id ?? groupId;
      const events = [
        await eventService.create(
          {
            organizationId,
            scopeType: "session",
            scopeId,
            eventType: "session_group_visibility_updated",
            payload: {
              sessionGroupId: groupId,
              channelId: updated.channelId,
              visibility,
              ownerUserId: updated.ownerUserId,
              sessionGroup,
            },
            actorType,
            actorId,
            deferPublish: true,
          },
          tx,
        ),
      ];

      if (current.visibility === "public" && visibility === "private") {
        events.push(
          await eventService.create(
            {
              organizationId,
              scopeType: "session",
              scopeId,
              eventType: "session_group_visibility_updated",
              payload: {
                sessionGroupId: groupId,
                channelId: updated.channelId,
                visibility,
                ownerUserId: updated.ownerUserId,
                removed: true,
              },
              actorType,
              actorId,
              deferPublish: true,
            },
            tx,
          ),
        );
      }

      return { sessionGroup, events };
    });

    for (const event of result.events) {
      eventService.publishCreated(event);
    }

    return result.sessionGroup;
  }

  async list(
    organizationId: string,
    userId: string,
    filters?: {
      agentStatus?: AgentStatus | null;
      tool?: CodingTool | null;
      repoId?: string | null;
      channelId?: string | null;
      includeArchived?: boolean | null;
      includeMerged?: boolean | null;
      limit?: number | null;
    },
  ) {
    const where: Prisma.SessionWhereInput = {
      organizationId,
      AND: [visibleSessionWhere(userId)],
    };
    if (filters?.agentStatus) where.agentStatus = filters.agentStatus;
    if (filters?.tool) where.tool = filters.tool;
    if (filters?.repoId) where.repoId = filters.repoId;
    if (filters?.channelId) where.channelId = filters.channelId;
    if (filters?.includeMerged === false) where.sessionStatus = { not: "merged" };
    if (filters?.includeArchived === false) {
      where.OR = [{ sessionGroupId: null }, { sessionGroup: { archivedAt: null } }];
    }
    const limit =
      typeof filters?.limit === "number" && Number.isFinite(filters.limit)
        ? Math.max(1, Math.min(Math.trunc(filters.limit), 500))
        : undefined;
    return prisma.session.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      ...(limit ? { take: limit } : {}),
      include: SESSION_INCLUDE,
    });
  }

  async get(id: string, organizationId: string, userId: string) {
    return prisma.session.findFirst({
      where: {
        id,
        organizationId,
        AND: [visibleSessionWhere(userId)],
      },
      include: SESSION_INCLUDE,
    });
  }

  async listByUser(
    organizationId: string,
    userId: string,
    options?: {
      agentStatus?: string | null;
      includeMerged?: boolean;
      includeArchived?: boolean;
    },
  ) {
    const where: Prisma.SessionWhereInput = {
      organizationId,
      createdById: userId,
      AND: [visibleSessionWhere(userId)],
    };
    if (options?.agentStatus) where.agentStatus = options.agentStatus as AgentStatus;
    if (options?.includeMerged === false) where.sessionStatus = { not: "merged" };

    const groupFilter: Prisma.SessionGroupWhereInput = {};
    if (options?.includeArchived === false) groupFilter.archivedAt = null;
    if (options?.includeMerged === false) {
      groupFilter.sessions = { none: { sessionStatus: "merged" } };
    }
    if (Object.keys(groupFilter).length > 0) {
      where.OR = [{ sessionGroupId: null }, { sessionGroup: { is: groupFilter } }];
    }

    return prisma.session.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: SESSION_INCLUDE,
    });
  }

  async search(organizationId: string, userId: string, query: string, channelId?: string | null) {
    const trimmed = query.trim().slice(0, 200);
    if (trimmed.length < 2) return { sessions: [], sessionGroups: [] };

    const sessionWhere: Prisma.SessionWhereInput = {
      organizationId,
      name: { contains: trimmed, mode: "insensitive" },
      AND: [visibleSessionWhere(userId)],
    };
    if (channelId) sessionWhere.channelId = channelId;

    // Intentionally includes archived groups so users can find past work.
    const groupWhere: Prisma.SessionGroupWhereInput = {
      organizationId,
      AND: [
        visibleSessionGroupWhere(userId),
        {
          OR: [
            { name: { contains: trimmed, mode: "insensitive" } },
            { slug: { contains: trimmed, mode: "insensitive" } },
          ],
        },
      ],
    };
    if (channelId) groupWhere.channelId = channelId;

    const [sessions, groups] = await Promise.all([
      prisma.session.findMany({
        where: sessionWhere,
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: SESSION_INCLUDE,
      }),
      prisma.sessionGroup.findMany({
        where: groupWhere,
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: SESSION_GROUP_INCLUDE,
      }),
    ]);

    type SessionGroupWithSessions = SessionGroupSummary & {
      sessions: SessionWithTimestamps[];
    };

    const sessionGroups = (groups as SessionGroupWithSessions[]).map((group) => {
      const groupSessions = sortSessionsByRecency<SessionWithTimestamps>(group.sessions);
      return {
        ...buildSessionGroupSnapshot(group, groupSessions),
        sessions: groupSessions,
      };
    });

    return { sessions, sessionGroups };
  }

  async listGitCheckpointsForSession(sessionId: string) {
    return prisma.gitCheckpoint.findMany({
      where: { sessionId },
      orderBy: [{ committedAt: "asc" }, { createdAt: "asc" }],
    });
  }

  async listGitCheckpointsForGroup(sessionGroupId: string) {
    return prisma.gitCheckpoint.findMany({
      where: { sessionGroupId },
      orderBy: [{ committedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async start(input: StartSessionServiceInput) {
    validateUploadKeysForOrganization(input.imageKeys, input.organizationId);

    if (input.restoreCheckpointId && input.sessionGroupId) {
      throw new Error("restoreCheckpointId cannot reuse an existing session group");
    }
    if (input.restoreCheckpointId && input.sourceSessionId) {
      throw new Error("restoreCheckpointId cannot be combined with sourceSessionId");
    }

    const restoreCheckpoint = input.restoreCheckpointId
      ? await prisma.gitCheckpoint.findUnique({
          where: { id: input.restoreCheckpointId },
          select: {
            id: true,
            sessionId: true,
            sessionGroupId: true,
            repoId: true,
            commitSha: true,
            subject: true,
          },
        })
      : null;

    if (input.restoreCheckpointId && !restoreCheckpoint) {
      throw new Error("Git checkpoint not found");
    }

    const userDefaults: UserSessionDefaults | null = input.tool
      ? null
      : await prisma.user.findUnique({
          where: { id: input.createdById },
          select: {
            defaultSessionTool: true,
            defaultSessionModel: true,
            defaultSessionReasoningEffort: true,
          },
        });
    const hasExplicitTool = !!input.tool;
    let tool = input.tool ?? userDefaults?.defaultSessionTool ?? FALLBACK_SESSION_TOOL;

    const restoreGroup = restoreCheckpoint
      ? await prisma.sessionGroup.findFirst({
          where: {
            id: restoreCheckpoint.sessionGroupId,
            organizationId: input.organizationId,
          },
          select: SESSION_GROUP_SUMMARY_SELECT,
        })
      : null;

    if (restoreCheckpoint && !restoreGroup) {
      throw new Error("Checkpoint session group not found");
    }

    const sourceSessionId = input.sourceSessionId ?? restoreCheckpoint?.sessionId ?? null;

    const sourceSession = sourceSessionId
      ? await prisma.session.findUnique({
          where: { id: sourceSessionId },
          select: {
            id: true,
            organizationId: true,
            sessionGroupId: true,
            repoId: true,
            branch: true,
            hosting: true,
            channelId: true,
            projects: {
              select: { projectId: true },
            },
            sessionGroup: {
              select: SESSION_GROUP_SUMMARY_SELECT,
            },
          },
        })
      : null;

    if (input.sourceSessionId && !sourceSession) {
      throw new Error("Source session not found");
    }
    if (sourceSession && sourceSession.organizationId !== input.organizationId) {
      throw new Error("Source session does not belong to this organization");
    }
    if (
      !input.restoreCheckpointId &&
      input.sessionGroupId &&
      sourceSession?.sessionGroupId &&
      input.sessionGroupId !== sourceSession.sessionGroupId
    ) {
      throw new Error("sourceSessionId must belong to the requested sessionGroupId");
    }

    const existingGroupId = input.forceNewGroup
      ? null
      : input.restoreCheckpointId
        ? null
        : (input.sessionGroupId ?? sourceSession?.sessionGroupId ?? null);
    const existingGroup = existingGroupId
      ? await prisma.sessionGroup.findFirst({
          where: { id: existingGroupId, organizationId: input.organizationId },
          select: SESSION_GROUP_SUMMARY_SELECT,
        })
      : null;

    if (existingGroupId && !existingGroup) {
      throw new Error("Session group not found");
    }
    if (existingGroup) {
      this.assertPrivateGroupOwner(existingGroup, input.createdById);
    }

    const resolvedGroup = existingGroup ?? sourceSession?.sessionGroup ?? null;
    if (resolvedGroup && input.allowVisibleSourceSession) {
      if (!canViewSessionGroup(resolvedGroup, input.createdById)) {
        throw new AuthorizationError("Not authorized for this session group");
      }
    } else if (resolvedGroup) {
      this.assertPrivateGroupOwner(resolvedGroup, input.createdById);
    }
    const seedGroup = input.restoreCheckpointId ? restoreGroup : resolvedGroup;
    const resolvedKind = input.kind ?? seedGroup?.kind ?? "coding";
    if (existingGroup && input.kind && input.kind !== existingGroup.kind) {
      throw new ValidationError("Session kind cannot change within an existing session group");
    }
    if (isGeneratedProjectKind(resolvedKind)) {
      const label = resolvedKind === "design" ? "Design" : resolvedKind === "pdf" ? "PDF" : "App";
      if (input.sourceSessionId && !input.restoreCheckpointId) {
        throw new ValidationError(`${label} sessions cannot start from a source session`);
      }
      if (!existingGroup && !input.restoreCheckpointId && input.repoId) {
        throw new ValidationError(`${label} sessions cannot start from a linked repo`);
      }
      if (input.hosting === "local") {
        throw new ValidationError(`${label} sessions require cloud hosting`);
      }
    }
    const requestedVisibility = input.visibility ?? "public";
    const newGroupVisibility = requestedVisibility === "private" ? "private" : "public";
    const effectiveGroupVisibility = existingGroup?.visibility ?? newGroupVisibility;
    const effectiveGroupOwnerUserId = existingGroup?.ownerUserId ?? input.createdById;
    const resolvedChannelId =
      input.channelId ?? seedGroup?.channelId ?? sourceSession?.channelId ?? undefined;
    const resolvedChannel = resolvedChannelId
      ? await prisma.channel.findUnique({
          where: { id: resolvedChannelId },
          select: { id: true, organizationId: true, type: true, repoId: true, baseBranch: true },
        })
      : null;

    if (resolvedChannelId && !resolvedChannel) {
      throw new Error("Channel not found");
    }
    if (resolvedChannel && resolvedChannel.organizationId !== input.organizationId) {
      throw new Error("Channel does not belong to this organization");
    }

    const authoritativeChannelRepoId =
      resolvedChannel?.type === "coding" ? (resolvedChannel.repoId ?? null) : null;
    if (isGeneratedProjectKind(resolvedKind) && authoritativeChannelRepoId && !existingGroup) {
      const label = resolvedKind === "design" ? "Design" : "App";
      throw new ValidationError(`${label} sessions cannot start in a repo-linked coding channel`);
    }

    if (authoritativeChannelRepoId && input.repoId && input.repoId !== authoritativeChannelRepoId) {
      throw new Error("Coding channel sessions must use the channel's linked repo");
    }
    if (
      authoritativeChannelRepoId &&
      seedGroup?.repoId &&
      seedGroup.repoId !== authoritativeChannelRepoId
    ) {
      throw new Error("Session group repo does not match the channel's linked repo");
    }
    if (
      authoritativeChannelRepoId &&
      sourceSession?.repoId &&
      sourceSession.repoId !== authoritativeChannelRepoId
    ) {
      throw new Error("Source session repo does not match the channel's linked repo");
    }
    // A restore must stay on the checkpoint's repo. Allowing an explicit
    // input.repoId to override it produces a group whose provisioning fails at
    // token mint (e.g. attaching a GitHub repoId to a managed-repo checkpoint).
    if (restoreCheckpoint?.repoId && input.repoId && input.repoId !== restoreCheckpoint.repoId) {
      throw new Error("Restored session must use the checkpoint's repo");
    }

    let resolvedRepoId =
      authoritativeChannelRepoId ??
      input.repoId ??
      seedGroup?.repoId ??
      sourceSession?.repoId ??
      restoreCheckpoint?.repoId ??
      undefined;
    let resolvedRepo = resolvedRepoId
      ? await prisma.repo.findFirst({
          where: { id: resolvedRepoId, organizationId: input.organizationId },
          select: { id: true, remoteUrl: true },
        })
      : null;
    if (resolvedRepoId && !resolvedRepo) {
      throw new Error("Repo not found");
    }
    let resolvedBranch =
      input.branch ??
      seedGroup?.branch ??
      sourceSession?.branch ??
      resolvedChannel?.baseBranch ??
      undefined;
    const sharedWorkdir =
      input.restoreCheckpointId || input.forceNewGroup ? null : (resolvedGroup?.workdir ?? null);
    const sharedConnection =
      input.restoreCheckpointId || input.forceNewGroup ? null : (resolvedGroup?.connection ?? null);
    const sharedRuntimeInstanceId =
      sharedConnection &&
      typeof sharedConnection === "object" &&
      "runtimeInstanceId" in sharedConnection
        ? ((sharedConnection as { runtimeInstanceId?: string | null }).runtimeInstanceId ?? null)
        : null;

    // For checkpoint restores, inherit the runtime from the source group so the
    // restored session is prepared on the same machine that owns the repo.
    const restoreGroupRuntimeInstanceId = (() => {
      if (!input.restoreCheckpointId || !restoreGroup) return null;
      const conn = restoreGroup.connection;
      if (conn && typeof conn === "object" && "runtimeInstanceId" in conn) {
        return (conn as { runtimeInstanceId?: string | null }).runtimeInstanceId ?? null;
      }
      return null;
    })();
    const sourceProjectIds =
      sourceSession?.projects.map((project: { projectId: string }) => project.projectId) ?? [];
    const sourceTicketLinks = sourceSessionId
      ? await prisma.ticketLink.findMany({
          where: { entityType: "session", entityId: sourceSessionId },
          select: { ticketId: true },
        })
      : [];

    if (input.restoreCheckpointId && !resolvedRepoId) {
      throw new Error("Checkpoint is not associated with a repo");
    }

    if (sharedRuntimeInstanceId) {
      await this.assertRuntimeAccess({
        userId: input.createdById,
        organizationId: input.organizationId,
        runtimeInstanceId: sharedRuntimeInstanceId,
        sessionGroupId: existingGroup?.id ?? resolvedGroup?.id ?? null,
      });
    }

    if (restoreGroupRuntimeInstanceId) {
      await this.assertRuntimeAccess({
        userId: input.createdById,
        organizationId: input.organizationId,
        runtimeInstanceId: restoreGroupRuntimeInstanceId,
        sessionGroupId: restoreGroup?.id ?? null,
      });
    }

    const name = input.name
      ? input.name.slice(0, MAX_SESSION_NAME_LENGTH)
      : input.prompt
        ? input.prompt.slice(0, MAX_SESSION_NAME_LENGTH)
        : isGeneratedProjectKind(resolvedKind)
          ? resolvedKind === "design"
            ? "Untitled Design"
            : "Untitled App"
          : restoreCheckpoint
            ? `Restore ${shortCommitSha(restoreCheckpoint.commitSha)} ${restoreCheckpoint.subject}`
                .trim()
                .slice(0, MAX_SESSION_NAME_LENGTH)
            : `Session ${new Date().toLocaleString()}`;

    // Resolve hosting mode: if a runtime is specified, derive from it; otherwise
    // default to local in TRACE_LOCAL_MODE and cloud everywhere else.
    if (isLocalMode() && input.hosting === "cloud") {
      throw new Error("Cloud sessions are disabled in local mode");
    }

    const requestedRuntimeSelection =
      !!input.environmentId || !!input.hosting || !!input.runtimeInstanceId;
    const existingGroupHasRuntimeSelection = hasRuntimeBinding(
      this.parseConnection(sharedConnection),
      sharedWorkdir,
    );
    // Joining an established group never accepts a runtime choice, even when
    // the requested value happens to match. New sessions inherit the group's
    // bridge; changing it is exclusively a group Move operation.
    if (existingGroup?.id && existingGroupHasRuntimeSelection && requestedRuntimeSelection) {
      throw new ValidationError(
        "New sessions inherit the session group's bridge. Move the session group to change bridges.",
      );
    }
    const reuseExistingGroupRuntimeSelection =
      !input.environmentId && !!existingGroup?.id && existingGroupHasRuntimeSelection;
    const deferRuntimeSelection =
      (input.deferRuntimeSelection === true && resolvedKind !== "app") ||
      (resolvedKind !== "app" &&
        !input.restoreCheckpointId &&
        !requestedRuntimeSelection &&
        !sharedRuntimeInstanceId &&
        !restoreGroupRuntimeInstanceId);
    if (
      input.deferRuntimeSelection === true &&
      (input.environmentId || input.hosting || input.runtimeInstanceId)
    ) {
      throw new ValidationError(
        "deferRuntimeSelection cannot be combined with an explicit environment or runtime",
      );
    }

    if (!hasExplicitTool) {
      const requestedRuntime = input.runtimeInstanceId
        ? sessionRouter.getRuntime(input.runtimeInstanceId, input.organizationId)
        : undefined;
      const localFallbackRuntime =
        requestedRuntime?.hostingMode === "local"
          ? requestedRuntime
          : deferRuntimeSelection || input.hosting === "local"
            ? ((await this.resolveDefaultAccessibleLocalRuntime({
                userId: input.createdById,
                organizationId: input.organizationId,
                tool,
                repoId: resolvedRepoId ?? null,
                sessionGroupId: existingGroup?.id ?? null,
              })) ??
              (await this.resolveDefaultAccessibleLocalRuntime({
                userId: input.createdById,
                organizationId: input.organizationId,
                repoId: resolvedRepoId ?? null,
                sessionGroupId: existingGroup?.id ?? null,
              })))
            : undefined;
      const fallbackTool = localFallbackRuntime
        ? selectRuntimeSupportedTool(localFallbackRuntime, tool)
        : null;
      if (fallbackTool) {
        tool = fallbackTool;
      }
    }

    const requestedEnvironment = deferRuntimeSelection
      ? null
      : reuseExistingGroupRuntimeSelection
        ? null
        : await agentEnvironmentService.resolveForSessionRequest({
            organizationId: input.organizationId,
            environmentId: input.environmentId ?? null,
            adapterType:
              resolvedKind === "app" || input.hosting === "cloud"
                ? "provisioned"
                : input.hosting === "local"
                  ? "local"
                  : null,
            tool,
            validateTool: !!input.prompt,
            actorType: input.actorType ?? "user",
            actorId: input.createdById,
          });
    const hasCompatibilityRuntimeFallback =
      deferRuntimeSelection ||
      !!input.hosting ||
      !!input.runtimeInstanceId ||
      !!sharedRuntimeInstanceId ||
      !!restoreGroupRuntimeInstanceId ||
      !!sourceSession?.hosting;
    if (!requestedEnvironment && !hasCompatibilityRuntimeFallback) {
      throw new ValidationError(
        "No default agent environment is configured. Choose an environment or set an org default in Agent Environments.",
      );
    }
    const environmentRuntimeInstanceId = localEnvironmentRuntimeInstanceId(requestedEnvironment);
    if (!hasExplicitTool && environmentRuntimeInstanceId) {
      const runtime = sessionRouter.getRuntime(environmentRuntimeInstanceId, input.organizationId);
      const fallbackTool = runtime ? selectRuntimeSupportedTool(runtime, tool) : null;
      if (fallbackTool) {
        tool = fallbackTool;
      }
    }

    const environmentHosting =
      requestedEnvironment?.adapterType === "local"
        ? "local"
        : requestedEnvironment?.adapterType === "provisioned"
          ? "cloud"
          : null;

    let hosting =
      (resolvedKind === "app" ? "cloud" : input.hosting) ??
      (deferRuntimeSelection ? "local" : environmentHosting) ??
      sourceSession?.hosting ??
      (isLocalMode() ? "local" : "cloud");
    if (isLocalMode() && hosting === "cloud") {
      hosting = "local";
    }
    if (hosting === "cloud" && !requestedEnvironment && !reuseExistingGroupRuntimeSelection) {
      throw new Error("No enabled cloud agent environment is configured");
    }

    // Importing an existing on-disk worktree: adopt it as the workspace instead
    // of creating a Trace-managed one. Local hosting only, always a fresh group,
    // and at most one active group may own a given worktree.
    const adoptWorktreePath = normalizeWorktreePath(input.worktreePath);
    if (adoptWorktreePath) {
      if (hosting !== "local") {
        throw new ValidationError("Importing an existing worktree requires local hosting");
      }
      if (!resolvedRepoId) {
        throw new ValidationError("Importing an existing worktree requires a repo");
      }
      if (existingGroupId) {
        throw new ValidationError("Importing an existing worktree starts a new session group");
      }
      const conflictingGroup = await prisma.sessionGroup.findFirst({
        where: {
          organizationId: input.organizationId,
          repoId: resolvedRepoId,
          workdir: adoptWorktreePath,
          worktreeAdopted: true,
          worktreeDeleted: false,
          archivedAt: null,
        },
        select: { id: true },
      });
      if (conflictingGroup) {
        throw new ValidationError("This worktree is already imported by another session group");
      }
    }
    let runtimeLabel: string | undefined;
    if (
      input.environmentId &&
      input.runtimeInstanceId &&
      requestedEnvironment?.adapterType !== "local"
    ) {
      throw new ValidationError("runtimeInstanceId can only be combined with a local environment");
    }
    if (
      input.environmentId &&
      input.runtimeInstanceId &&
      environmentRuntimeInstanceId &&
      input.runtimeInstanceId !== environmentRuntimeInstanceId
    ) {
      throw new ValidationError("runtimeInstanceId does not match the selected local environment");
    }
    const shouldUseEnvironmentRuntime =
      !input.runtimeInstanceId &&
      !sharedRuntimeInstanceId &&
      !restoreGroupRuntimeInstanceId &&
      !!environmentRuntimeInstanceId;
    let selectedRuntimeAccessAllowed = true;
    let requestedRuntimeInstanceId: string | null | undefined =
      input.runtimeInstanceId ??
      sharedRuntimeInstanceId ??
      restoreGroupRuntimeInstanceId ??
      environmentRuntimeInstanceId;
    if (input.runtimeInstanceId || shouldUseEnvironmentRuntime) {
      const runtimeId = input.runtimeInstanceId ?? environmentRuntimeInstanceId;
      if (!runtimeId) {
        throw new Error("Requested runtime not found");
      }
      let runtime = sessionRouter.getRuntime(runtimeId, input.organizationId);
      runtimeDebug("startSession resolving requested runtime", {
        sessionId: "pending",
        runtimeInstanceId: runtimeId,
        requestedHosting: input.hosting ?? null,
        runtimeFoundInRouter: !!runtime,
      });
      if (!runtime && shouldUseEnvironmentRuntime && !input.environmentId) {
        const fallbackRuntime = await this.resolveDefaultAccessibleLocalRuntime({
          userId: input.createdById,
          organizationId: input.organizationId,
          tool,
          repoId: resolvedRepoId ?? null,
          sessionGroupId: existingGroup?.id ?? null,
        });
        if (fallbackRuntime) {
          runtimeDebug("startSession fell back from stale default local runtime", {
            sessionId: "pending",
            configuredRuntimeInstanceId: runtimeId,
            fallbackRuntimeInstanceId: fallbackRuntime.id,
            environmentId: requestedEnvironment?.id ?? null,
          });
          runtime = fallbackRuntime;
        }
      }
      if (!runtime) {
        throw new Error("Requested runtime not found");
      }
      let useRequestedRuntime = true;
      if (runtime.hostingMode === "local") {
        if (existingGroup?.id) {
          await this.assertRuntimeAccess({
            userId: input.createdById,
            organizationId: input.organizationId,
            runtimeInstanceId: runtime.id,
            sessionGroupId: existingGroup.id,
          });
        } else {
          const access = await runtimeAccessService.getAccessState({
            userId: input.createdById,
            organizationId: input.organizationId,
            runtimeInstanceId: runtime.id,
            sessionGroupId: null,
          });
          selectedRuntimeAccessAllowed = access.hostingMode !== "local" || access.allowed;
          useRequestedRuntime =
            selectedRuntimeAccessAllowed || !!input.runtimeInstanceId || !!input.environmentId;
        }
      }
      if (useRequestedRuntime) {
        if (!runtime.supportedTools.includes(tool)) {
          if (hasExplicitTool && input.prompt) {
            throw new Error("Selected runtime does not support this tool");
          }
          if (!hasExplicitTool) {
            const fallbackTool = selectRuntimeSupportedTool(runtime, tool);
            if (!fallbackTool) {
              throw new Error("Selected runtime does not support any known coding tool");
            }
            tool = fallbackTool;
          }
        }
        if (
          runtime.hostingMode === "local" &&
          resolvedRepoId &&
          !runtime.registeredRepoIds.includes(resolvedRepoId)
        ) {
          throw new Error("Selected runtime does not have this repo linked");
        }
        hosting = runtime.hostingMode;
        runtimeLabel = runtime.label;
        requestedRuntimeInstanceId = runtime.id;
      } else {
        requestedRuntimeInstanceId = undefined;
        selectedRuntimeAccessAllowed = true;
      }
    }

    if (!requestedRuntimeInstanceId && hosting === "local" && !deferRuntimeSelection) {
      let defaultLocalRuntime = await this.resolveDefaultAccessibleLocalRuntime({
        userId: input.createdById,
        organizationId: input.organizationId,
        tool,
        repoId: resolvedRepoId ?? null,
        sessionGroupId: existingGroup?.id ?? null,
      });
      if (!defaultLocalRuntime && !hasExplicitTool) {
        defaultLocalRuntime = await this.resolveDefaultAccessibleLocalRuntime({
          userId: input.createdById,
          organizationId: input.organizationId,
          repoId: resolvedRepoId ?? null,
          sessionGroupId: existingGroup?.id ?? null,
        });
        const fallbackTool = defaultLocalRuntime
          ? selectRuntimeSupportedTool(defaultLocalRuntime, tool)
          : null;
        if (fallbackTool) {
          tool = fallbackTool;
        }
      }
      if (!defaultLocalRuntime) {
        throw new Error("No accessible local runtime available");
      }
      requestedRuntimeInstanceId = defaultLocalRuntime.id;
      runtimeLabel = defaultLocalRuntime.label;
    }

    if (requestedRuntimeInstanceId && !runtimeLabel) {
      runtimeLabel =
        sessionRouter.getRuntime(requestedRuntimeInstanceId, input.organizationId)?.label ??
        this.parseConnection(sharedConnection ?? restoreGroup?.connection ?? null).runtimeLabel;
    }
    if (isGeneratedProjectKind(resolvedKind) && hosting !== "cloud") {
      const label = resolvedKind === "design" ? "Design" : "App";
      throw new ValidationError(`${label} sessions require cloud hosting`);
    }
    await this.assertPrivateRuntimeOwner({
      visibility: effectiveGroupVisibility,
      ownerUserId: effectiveGroupOwnerUserId,
      organizationId: input.organizationId,
      hosting,
      runtimeInstanceId: requestedRuntimeInstanceId,
    });

    const model = input.model
      ? validateModelForTool(tool, input.model)
      : (resolveStoredModelForTool(tool, userDefaults?.defaultSessionModel) ??
        getDefaultModel(tool));
    const reasoningEffort = input.reasoningEffort
      ? validateReasoningEffortForTool(tool, input.reasoningEffort)
      : (resolveStoredReasoningEffortForTool(tool, userDefaults?.defaultSessionReasoningEffort) ??
        getDefaultReasoningEffort(tool));

    // Tracked so we can clean up the managed repo if the session transaction
    // below rolls back (it's created before the txn because it initializes
    // filesystem-backed git storage, not just a row).
    let createdManagedRepoId: string | null = null;
    if (isGeneratedProjectKind(resolvedKind) && !resolvedRepoId) {
      const managedRepo = await managedGitService.createManagedRepo({
        organizationId: input.organizationId,
        name: `${name} source`,
        actorType: input.actorType ?? "user",
        actorId: input.createdById,
      });
      resolvedRepoId = managedRepo.id;
      resolvedRepo = managedRepo;
      resolvedBranch ??= managedRepo.defaultBranch;
      createdManagedRepoId = managedRepo.id;
    }

    assertCloudRepoRemoteAvailable(hosting, resolvedRepo);

    // Ask-mode sessions skip worktree creation (read-only against repo root).
    // Checkpoint restores always need a worktree to reset to a specific SHA.
    const readOnlyWorkspace =
      input.interactionMode === "ask" && !input.restoreCheckpointId && !adoptWorktreePath;

    const needsRuntimeProvisioning =
      !sharedRuntimeInstanceId && !sharedWorkdir && (!!resolvedRepoId || hosting === "cloud");
    // Queue the initial prompt as a pending run whenever we're provisioning a
    // fresh runtime for it; it's delivered once the workspace is ready
    // (workspaceReady → deliverPendingCommand). This must cover BOTH the
    // deferred bridge-access path AND the immediate-provision path — app
    // sessions (and explicit-runtime sessions) provision immediately, and
    // without queuing here their first prompt would never reach the agent.
    const queueInitialRun =
      input.deferInitialRun !== true && needsRuntimeProvisioning && !!input.prompt;
    const initialConnection = sharedConnection
      ? sharedConnection
      : connJson(
          defaultConnection({
            ...(deferRuntimeSelection && { state: "pending" }),
            toolSource: hasExplicitTool ? "explicit" : "default",
            ...(requestedEnvironment && {
              environmentId: requestedEnvironment.id,
              adapterType: requestedEnvironment.adapterType,
            }),
            ...(requestedRuntimeInstanceId && { runtimeInstanceId: requestedRuntimeInstanceId }),
            ...(runtimeLabel && { runtimeLabel }),
          }),
        );

    // Sessions stay idle until a command is actually delivered to the coding tool.
    const initialAgentStatus: AgentStatus = "not_started";
    const initialSessionStatus: SessionStatus = "in_progress";
    const initialCheckpointContextId = resolvedRepoId && input.prompt ? randomUUID() : null;
    const hasInitialUserContent = !!input.prompt || !!input.imageKeys?.length;

    let startEventToPublish: Awaited<ReturnType<typeof eventService.create>> | undefined;
    const session = await prisma
      .$transaction(async (tx: Prisma.TransactionClient) => {
        const sessionGroup = existingGroup
          ? await (async () => {
              const nextGroupData: Prisma.SessionGroupUncheckedUpdateInput = {};
              if (
                resolvedChannelId !== undefined &&
                existingGroup.channelId !== resolvedChannelId
              ) {
                nextGroupData.channelId = resolvedChannelId;
              }
              if (existingGroup.repoId == null && resolvedRepoId !== undefined) {
                nextGroupData.repoId = resolvedRepoId;
              }
              if (existingGroup.branch == null && resolvedBranch !== undefined) {
                nextGroupData.branch = resolvedBranch;
              }
              if (Object.keys(nextGroupData).length === 0) {
                return existingGroup;
              }
              return tx.sessionGroup.update({
                where: { id: existingGroup.id },
                data: nextGroupData,
                select: SESSION_GROUP_SUMMARY_SELECT,
              });
            })()
          : await tx.sessionGroup.create({
              data: {
                name,
                kind: resolvedKind,
                organizationId: input.organizationId,
                ownerUserId: input.createdById,
                visibility: newGroupVisibility,
                forkedFromSessionGroupId: input.forkedFromSessionGroupId ?? undefined,
                channelId: resolvedChannelId,
                repoId: resolvedRepoId ?? undefined,
                branch: resolvedBranch ?? undefined,
                connection: initialConnection,
                // Adopting an existing worktree: record the path and flag the group
                // so re-provisioning re-adopts it and teardown never removes it.
                ...(adoptWorktreePath ? { workdir: adoptWorktreePath, worktreeAdopted: true } : {}),
              },
              select: SESSION_GROUP_SUMMARY_SELECT,
            });

        const projectIds = input.projectId != null ? [input.projectId] : sourceProjectIds;

        const session = await tx.session.create({
          data: {
            name,
            agentStatus: initialAgentStatus,
            sessionStatus: initialSessionStatus,
            tool,
            model: model ?? undefined,
            reasoningEffort: reasoningEffort ?? undefined,
            hosting,
            organizationId: input.organizationId,
            createdById: input.createdById,
            repoId: resolvedRepoId ?? undefined,
            branch: resolvedBranch ?? undefined,
            workdir: sessionGroup.workdir ?? undefined,
            channelId: resolvedChannelId,
            sessionGroupId: sessionGroup.id,
            connection: sessionGroup.connection ?? initialConnection,
            pendingRun: queueInitialRun
              ? pendingRunValue([
                  {
                    type: "run",
                    prompt: input.prompt ?? null,
                    interactionMode: input.interactionMode ?? null,
                    clientSource: normalizeClientSource(input.clientSource),
                    checkpointContext: null,
                    ...(input.imageKeys?.length ? { imageKeys: input.imageKeys } : {}),
                  },
                ])
              : undefined,
            lastUserMessageAt: hasInitialUserContent ? new Date() : undefined,
            lastMessageAt: hasInitialUserContent ? new Date() : undefined,
            worktreeDeleted: sessionGroup.worktreeDeleted,
            readOnlyWorkspace,
            ...(projectIds.length > 0 && {
              projects: {
                create: projectIds.map((projectId: string) => ({ projectId })),
              },
            }),
          },
          include: SESSION_INCLUDE,
        });

        if (sourceTicketLinks.length > 0) {
          await tx.ticketLink.createMany({
            data: sourceTicketLinks.map((ticketLink: { ticketId: string }) => ({
              ticketId: ticketLink.ticketId,
              entityType: "session",
              entityId: session.id,
            })),
            skipDuplicates: true,
          });
        }

        const sessionGroupSnapshot = buildSessionGroupSnapshot(sessionGroup, [
          { agentStatus: initialAgentStatus, sessionStatus: initialSessionStatus },
        ]);

        const startEventId = input.startEventId ?? randomUUID();
        const startEventPayload = {
          session: serializeSession(session),
          sessionGroup: sessionGroupSnapshot,
          prompt: input.prompt ?? null,
          clientSource: normalizeClientSource(input.clientSource),
          sourceSessionId: input.sourceSessionId ?? null,
          restoreCheckpointId: restoreCheckpoint?.id ?? null,
          restoreCheckpointSha: restoreCheckpoint?.commitSha ?? null,
          ...(input.imageKeys?.length
            ? { attachmentKeys: input.imageKeys, imageKeys: input.imageKeys }
            : {}),
        } as Prisma.InputJsonValue;
        const startEventMetadata = initialCheckpointContextId
          ? ({ checkpointContextId: initialCheckpointContextId } as Prisma.InputJsonValue)
          : undefined;
        const startEventOverride = input.buildStartEvent?.({
          session,
          sessionGroup,
          sessionGroupSnapshot,
          startEventId,
          defaultPayload: startEventPayload,
          defaultMetadata: startEventMetadata,
        });

        startEventToPublish = await eventService.create(
          {
            id: startEventId,
            organizationId: input.organizationId,
            scopeType: "session",
            scopeId: session.id,
            eventType: "session_started",
            payload: startEventOverride?.payload ?? startEventPayload,
            metadata: startEventOverride?.metadata ?? startEventMetadata,
            actorType: startEventOverride?.actorType ?? "user",
            actorId: startEventOverride?.actorId ?? input.createdById,
            timestamp: startEventOverride?.timestamp,
            deferPublish: true,
          },
          tx,
        );

        if (input.afterCreate) {
          await input.afterCreate({
            tx,
            session,
            sessionGroup,
            startEventId,
            startEventPayload: startEventOverride?.payload ?? startEventPayload,
          });
        }

        return session;
      })
      .catch(async (error: unknown) => {
        // Don't leak the managed repo minted above if the session row never persists.
        if (createdManagedRepoId) {
          await managedGitService
            .deleteManagedRepo({
              organizationId: input.organizationId,
              repoId: createdManagedRepoId,
              actorType: input.actorType ?? "user",
              actorId: input.createdById,
            })
            .catch(() => {});
        }
        throw error;
      });

    // Publish the start event only after the transaction commits so subscribers
    // don't query for the session before its row is visible (e.g. long-running forks).
    if (startEventToPublish) {
      eventService.publishCreated(startEventToPublish);
    }

    // Reuse the group's runtime binding when a shared workspace already exists,
    // or inherit from the restore group so the session lands on the same machine.
    const runtimeToBind = requestedRuntimeInstanceId;
    if (runtimeToBind) {
      const runtimeKeyToBind =
        sessionRouter.getRuntime(runtimeToBind, input.organizationId)?.key ?? runtimeToBind;
      sessionRouter.bindSession(session.id, runtimeKeyToBind);
    }

    // Only provision the runtime immediately when a prompt is provided.
    // Sessions created without a prompt (e.g. Cmd+N) defer provisioning
    // until the user sends their first message. Checkpoint restores are the
    // exception: they carry no prompt but must provision now so the workspace
    // materializes at the pinned commit SHA — deferring to the first message
    // loses the SHA (later provisioning paths clone HEAD) and strands the
    // restored session with no runtime in the meantime.
    if (
      needsRuntimeProvisioning &&
      (input.prompt || input.provisionWithoutPrompt || input.restoreCheckpointId) &&
      selectedRuntimeAccessAllowed &&
      !deferRuntimeSelection &&
      input.deferInitialRun !== true
    ) {
      this.provisionRuntime({
        sessionId: session.id,
        sessionGroupId: session.sessionGroupId,
        sessionGroupKind: resolvedKind,
        slug: session.sessionGroup?.slug,
        preserveBranchName: false,
        hosting: session.hosting,
        tool: session.tool,
        model: session.model,
        reasoningEffort: session.reasoningEffort,
        repo: session.repo,
        branch: resolvedBranch,
        checkpointSha: input.checkpointSha ?? restoreCheckpoint?.commitSha,
        createdById: input.createdById,
        actorType: input.actorType,
        organizationId: input.organizationId,
        readOnly: readOnlyWorkspace,
        adoptWorktreePath,
        adapterType: requestedEnvironment?.adapterType,
        environment: requestedEnvironment,
      });
    }

    return session;
  }

  async forkSession(input: {
    eventId: string;
    organizationId: string;
    createdById: string;
    actorType?: ActorType;
    clientSource?: string | null;
  }) {
    const sourceForkEvent = await prisma.event.findFirst({
      where: {
        id: input.eventId,
        organizationId: input.organizationId,
        scopeType: "session",
      },
    });

    if (!sourceForkEvent) {
      throw new Error("Source event not found");
    }

    const sourceSession = await prisma.session.findFirst({
      where: {
        id: sourceForkEvent.scopeId,
        organizationId: input.organizationId,
      },
      include: SESSION_INCLUDE,
    });

    if (!sourceSession) {
      throw new Error("Source session not found");
    }
    if (!sourceSession.sessionGroupId || !sourceSession.sessionGroup) {
      throw new Error("Source session does not belong to a session group");
    }
    const sourceSessionGroupId = sourceSession.sessionGroupId;
    if (!canViewSessionGroup(sourceSession.sessionGroup, input.createdById)) {
      throw new AuthorizationError("Not authorized for this session");
    }

    const sourceEvents = await prisma.event.findMany({
      where: {
        organizationId: input.organizationId,
        scopeType: "session",
        scopeId: sourceSession.id,
        OR: [
          { timestamp: { lt: sourceForkEvent.timestamp } },
          {
            timestamp: sourceForkEvent.timestamp,
            id: { lte: sourceForkEvent.id },
          },
        ],
      },
      orderBy: [{ timestamp: "asc" }, { id: "asc" }],
    });
    const sourceCheckpointIds = sourceEvents
      .map((event) => gitCheckpointIdFromPayload(event.payload))
      .filter((id): id is string => !!id);

    const latestCheckpoint = await prisma.gitCheckpoint.findFirst({
      where: {
        sessionGroupId: sourceSessionGroupId,
        id: { in: sourceCheckpointIds },
      },
      orderBy: [{ committedAt: "desc" }, { createdAt: "desc" }],
      select: { commitSha: true },
    });

    const sourceCheckpoints =
      (await prisma.gitCheckpoint.findMany({
        where: {
          sessionGroupId: sourceSessionGroupId,
          id: { in: sourceCheckpointIds },
        },
        orderBy: [{ committedAt: "asc" }, { createdAt: "asc" }],
      })) ?? [];
    const targetStartEventId = randomUUID();
    const targetEventIds = new Map<string, string>();
    const sourceStartEvent = sourceEvents.find((event) => event.eventType === "session_started");
    if (sourceStartEvent) {
      targetEventIds.set(sourceStartEvent.id, targetStartEventId);
    }
    for (const sourceEvent of sourceEvents) {
      if (sourceEvent.eventType !== "session_started") {
        targetEventIds.set(sourceEvent.id, randomUUID());
      }
    }
    const targetCheckpointIds = new Map<string, string>();
    for (const checkpoint of sourceCheckpoints) {
      targetCheckpointIds.set(checkpoint.id, randomUUID());
    }

    const forkedSession = await this.start({
      tool: sourceSession.tool,
      model: sourceSession.model,
      reasoningEffort: sourceSession.reasoningEffort,
      hosting: sourceSession.hosting,
      repoId: sourceSession.repoId,
      branch: sourceSession.sessionGroup.branch ?? sourceSession.branch ?? undefined,
      channelId: sourceSession.channelId ?? sourceSession.sessionGroup.channelId ?? undefined,
      sourceSessionId: sourceSession.id,
      organizationId: input.organizationId,
      createdById: input.createdById,
      actorType: input.actorType,
      clientSource: input.clientSource,
      visibility: sourceSession.sessionGroup.visibility,
      forceNewGroup: true,
      allowVisibleSourceSession: true,
      forkedFromSessionGroupId: sourceSessionGroupId,
      checkpointSha: latestCheckpoint?.commitSha ?? null,
      provisionWithoutPrompt: true,
      name: sourceSession.name,
      startEventId: targetStartEventId,
      buildStartEvent: ({ session, defaultPayload }) => {
        if (!sourceStartEvent || !session.sessionGroupId) {
          return {
            payload: defaultPayload,
          };
        }
        const replacements = this.buildForkReplacementMap({
          sourceSessionId: sourceSession.id,
          sourceSessionGroupId,
          targetSessionId: session.id,
          targetSessionGroupId: session.sessionGroupId,
          targetEventIds,
          targetCheckpointIds,
        });
        const sourceStartPayload = jsonRecord(
          rewriteForkPayloadReferences(sourceStartEvent.payload, replacements),
        );
        const targetStartPayload = jsonRecord(defaultPayload);
        return {
          payload: {
            ...sourceStartPayload,
            session: targetStartPayload.session,
            sessionGroup: targetStartPayload.sessionGroup,
            clientSource: targetStartPayload.clientSource,
            sourceSessionId: sourceSession.id,
            restoreCheckpointId: targetStartPayload.restoreCheckpointId,
            restoreCheckpointSha: targetStartPayload.restoreCheckpointSha,
          } as Prisma.InputJsonValue,
          metadata: {
            forkedFromSessionId: sourceSession.id,
            forkedFromSessionGroupId: sourceSessionGroupId,
            forkedFromEventId: sourceForkEvent.id,
          } as Prisma.InputJsonValue,
          actorType: sourceStartEvent.actorType,
          actorId: sourceStartEvent.actorId,
          timestamp: sourceStartEvent.timestamp,
        };
      },
      afterCreate: async ({ tx, session, startEventId }) => {
        if (!session.sessionGroupId) {
          throw new Error("Forked session was not assigned to a session group");
        }
        await this.copyForkedSessionHistory(
          {
            sourceSessionId: sourceSession.id,
            sourceSessionGroupId: sourceSessionGroupId,
            targetSessionId: session.id,
            targetSessionGroupId: session.sessionGroupId,
            organizationId: input.organizationId,
            startEventId,
            sourceEvents,
            sourceCheckpoints,
            targetEventIds,
            targetCheckpointIds,
          },
          tx,
        );
      },
    });

    return prisma.session.findUniqueOrThrow({
      where: { id: forkedSession.id },
      include: SESSION_INCLUDE,
    });
  }

  private buildForkReplacementMap(input: {
    sourceSessionId: string;
    sourceSessionGroupId: string;
    targetSessionId: string;
    targetSessionGroupId: string;
    targetEventIds: ReadonlyMap<string, string>;
    targetCheckpointIds: ReadonlyMap<string, string>;
  }): Map<string, string> {
    const replacements = new Map<string, string>([
      [input.sourceSessionId, input.targetSessionId],
      [input.sourceSessionGroupId, input.targetSessionGroupId],
    ]);
    for (const [sourceEventId, targetEventId] of input.targetEventIds) {
      replacements.set(sourceEventId, targetEventId);
    }
    for (const [sourceCheckpointId, targetCheckpointId] of input.targetCheckpointIds) {
      replacements.set(sourceCheckpointId, targetCheckpointId);
    }
    return replacements;
  }

  private async copyForkedSessionHistory(
    input: {
      sourceSessionId: string;
      sourceSessionGroupId: string;
      targetSessionId: string;
      targetSessionGroupId: string;
      organizationId: string;
      startEventId: string;
      sourceEvents: ForkSourceEvent[];
      sourceCheckpoints: Array<{
        id: string;
        sessionId: string;
        sessionGroupId: string;
        repoId: string;
        promptEventId: string;
        commitSha: string;
        parentShas: string[];
        treeSha: string;
        subject: string;
        author: string;
        committedAt: Date;
        filesChanged: number;
      }>;
      targetEventIds: ReadonlyMap<string, string>;
      targetCheckpointIds: ReadonlyMap<string, string>;
    },
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const replacements = this.buildForkReplacementMap({
      sourceSessionId: input.sourceSessionId,
      sourceSessionGroupId: input.sourceSessionGroupId,
      targetSessionId: input.targetSessionId,
      targetSessionGroupId: input.targetSessionGroupId,
      targetEventIds: input.targetEventIds,
      targetCheckpointIds: input.targetCheckpointIds,
    });
    const checkpointsBySourcePromptEventId = new Map<string, typeof input.sourceCheckpoints>();
    for (const checkpoint of input.sourceCheckpoints) {
      const existing = checkpointsBySourcePromptEventId.get(checkpoint.promptEventId) ?? [];
      existing.push(checkpoint);
      checkpointsBySourcePromptEventId.set(checkpoint.promptEventId, existing);
    }

    const createCopiedCheckpoint = async (checkpoint: (typeof input.sourceCheckpoints)[number]) => {
      const targetCheckpointId = input.targetCheckpointIds.get(checkpoint.id);
      const targetPromptEventId = input.targetEventIds.get(checkpoint.promptEventId);
      if (!targetCheckpointId || !targetPromptEventId) return;
      await tx.gitCheckpoint.create({
        data: {
          id: targetCheckpointId,
          sessionId: input.targetSessionId,
          sessionGroupId: input.targetSessionGroupId,
          repoId: checkpoint.repoId,
          promptEventId: targetPromptEventId,
          commitSha: checkpoint.commitSha,
          parentShas: checkpoint.parentShas,
          treeSha: checkpoint.treeSha,
          subject: checkpoint.subject,
          author: checkpoint.author,
          committedAt: checkpoint.committedAt,
          filesChanged: checkpoint.filesChanged,
        },
      });
    };

    for (const sourceEvent of input.sourceEvents) {
      const sourceCheckpointsForEvent = checkpointsBySourcePromptEventId.get(sourceEvent.id) ?? [];
      if (sourceEvent.eventType === "session_started") {
        for (const checkpoint of sourceCheckpointsForEvent) {
          await createCopiedCheckpoint(checkpoint);
        }
        continue;
      }

      const targetEventId = input.targetEventIds.get(sourceEvent.id);
      if (!targetEventId) continue;
      await eventService.create(
        {
          id: targetEventId,
          organizationId: input.organizationId,
          scopeType: "session",
          scopeId: input.targetSessionId,
          eventType: sourceEvent.eventType,
          payload: rewriteForkPayloadReferences(
            sourceEvent.payload,
            replacements,
          ) as Prisma.InputJsonValue,
          metadata: {
            ...((sourceEvent.metadata && typeof sourceEvent.metadata === "object"
              ? sourceEvent.metadata
              : {}) as Record<string, unknown>),
            forkedFromSessionId: input.sourceSessionId,
            forkedFromSessionGroupId: input.sourceSessionGroupId,
            forkedFromEventId: sourceEvent.id,
          } as Prisma.InputJsonValue,
          parentId: sourceEvent.parentId
            ? input.targetEventIds.get(sourceEvent.parentId)
            : undefined,
          actorType: sourceEvent.actorType,
          actorId: sourceEvent.actorId,
          timestamp: sourceEvent.timestamp,
          deferPublish: true,
        },
        tx,
      );

      for (const checkpoint of sourceCheckpointsForEvent) {
        await createCopiedCheckpoint(checkpoint);
      }
    }
  }

  async resumePendingBridgeAccessSessions(input: BridgeAccessApprovedHandlerInput): Promise<void> {
    const where: Prisma.SessionWhereInput = {
      organizationId: input.organizationId,
      createdById: input.granteeUserId,
      hosting: "local",
      agentStatus: "not_started",
      workdir: null,
      connection: { path: ["runtimeInstanceId"], equals: input.runtimeInstanceId },
    };
    if (input.scopeType === "session_group") {
      if (!input.sessionGroupId) return;
      where.sessionGroupId = input.sessionGroupId;
    }

    const sessions = await prisma.session.findMany({
      where,
      include: SESSION_INCLUDE,
    });

    for (const session of sessions) {
      if (this.parsePendingCommands(session.pendingRun).length === 0) continue;
      const conn = this.parseConnection(session.connection);
      if (isRuntimeStartupState(conn.state)) continue;

      const updated = await prisma.session.update({
        where: { id: session.id },
        data: {
          agentStatus: "active",
          sessionStatus: "in_progress",
          connection: this.mergeConnection(session.connection, {
            state: "connecting",
            runtimeInstanceId: input.runtimeInstanceId,
            runtimeLabel:
              sessionRouter.getRuntime(input.runtimeInstanceId)?.label ?? conn.runtimeLabel,
          }),
        },
        include: SESSION_INCLUDE,
      });

      this.provisionRuntime({
        sessionId: updated.id,
        sessionGroupId: updated.sessionGroupId,
        sessionGroupKind: updated.sessionGroup?.kind,
        slug: updated.sessionGroup?.slug,
        preserveBranchName: false,
        hosting: updated.hosting,
        tool: updated.tool,
        model: updated.model,
        reasoningEffort: updated.reasoningEffort,
        repo: updated.repo,
        branch: updated.branch,
        createdById: updated.createdById,
        organizationId: updated.organizationId,
        readOnly: updated.readOnlyWorkspace,
        adapterType: conn.adapterType,
      });
    }
  }

  async run(
    id: string,
    prompt?: string | null,
    interactionMode?: string,
    access?: { userId: string; organizationId: string; clientSource?: string | null },
    imageKeys?: string[] | null,
  ) {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id },
      include: SESSION_INCLUDE,
    });
    validateUploadKeysForOrganization(imageKeys, session.organizationId);
    if (access) {
      if (session.organizationId !== access.organizationId) {
        throw new AuthorizationError("Not authorized for this session");
      }
      if (session.sessionGroup && !canViewSessionGroup(session.sessionGroup, access.userId)) {
        throw new AuthorizationError("Not authorized for this session");
      }
    }
    const conn = this.parseConnection(session.connection);

    const startMeta =
      !prompt ||
      !session.toolSessionId ||
      (session.agentStatus === "not_started" &&
        !session.workdir &&
        !!session.repoId &&
        !!session.sessionGroupId)
        ? await getSessionStartMetadata(id)
        : null;

    const runtimeBinding = access
      ? await this.resolveAccessibleLocalRuntimeBinding({
          sessionId: id,
          sessionGroupId: session.sessionGroupId,
          organizationId: access.organizationId,
          userId: access.userId,
          hosting: session.hosting,
          tool: session.tool,
          repoId: session.repoId,
          connection: session.connection,
        })
      : {
          runtimeId: conn.runtimeInstanceId ?? null,
          runtimeLabel: conn.runtimeLabel ?? null,
        };

    // If session has a read-only workspace and the mode explicitly switched away from ask,
    // upgrade to a full worktree before running
    if (session.readOnlyWorkspace && interactionMode && interactionMode !== "ask" && session.repo) {
      const pendingCommand: PendingSessionCommand = {
        type: "run",
        prompt: prompt ?? null,
        interactionMode: interactionMode ?? null,
        clientSource: normalizeClientSource(access?.clientSource),
        checkpointContext: buildCheckpointContextFromStartMeta({
          sessionId: id,
          sessionGroupId: session.sessionGroupId,
          repoId: session.repoId,
          startMeta,
        }),
        ...(imageKeys?.length ? { imageKeys } : {}),
      };
      await this.triggerWorkspaceUpgrade(id, session, pendingCommand);
      return prisma.session.findUniqueOrThrow({ where: { id }, include: SESSION_INCLUDE });
    }

    // If workspace is still being prepared, queue the run for later
    if (session.agentStatus === "not_started" && !session.workdir) {
      const pendingCommand: PendingSessionCommand = {
        type: "run",
        prompt: prompt ?? null,
        interactionMode: interactionMode ?? null,
        clientSource: normalizeClientSource(access?.clientSource),
        checkpointContext: buildCheckpointContextFromStartMeta({
          sessionId: id,
          sessionGroupId: session.sessionGroupId,
          repoId: session.repoId,
          startMeta,
        }),
        ...(imageKeys?.length ? { imageKeys } : {}),
      };
      const commands = this.parsePendingCommands(session.pendingRun);
      const needsProvisioning = !!session.repoId || session.hosting === "cloud";
      if (needsProvisioning) {
        assertCloudRepoRemoteAvailable(session.hosting, session.repo);
      }
      const markLocalPreparing = session.hosting === "local" && needsProvisioning;
      const updated = await prisma.session.update({
        where: { id },
        data: {
          pendingRun: pendingRunValue([...commands, pendingCommand]),
          agentStatus: "active",
          sessionStatus: "in_progress",
          ...(markLocalPreparing && {
            connection: this.mergeConnection(session.connection, {
              state: "connecting",
              ...(runtimeBinding.runtimeId &&
                !conn.runtimeInstanceId && {
                  runtimeInstanceId: runtimeBinding.runtimeId,
                  runtimeLabel: runtimeBinding.runtimeLabel ?? undefined,
                }),
            }),
          }),
        },
        include: SESSION_INCLUDE,
      });

      // If no workspace has been prepared yet (deferred from startSession),
      // kick it off now that the user has sent their first message.
      // A local bridge may already be bound here; only a startup connection
      // state means preparation is already in progress.
      const alreadyProvisioning = isRuntimeStartupState(conn.state);
      if (needsProvisioning && !alreadyProvisioning) {
        this.provisionRuntime({
          sessionId: id,
          sessionGroupId: session.sessionGroupId,
          sessionGroupKind: session.sessionGroup?.kind,
          slug: session.sessionGroup?.slug,
          preserveBranchName: false,
          hosting: session.hosting,
          tool: session.tool,
          model: session.model,
          reasoningEffort: session.reasoningEffort,
          repo: session.repo,
          branch: session.branch,
          createdById: session.createdById,
          organizationId: session.organizationId,
          readOnly: session.readOnlyWorkspace,
          adapterType: conn.adapterType,
        });
      }

      return updated;
    }

    // Fully unloaded sessions cannot accept follow-up work.
    if (
      isFullyUnloadedSession(session.agentStatus, session.sessionStatus, session.worktreeDeleted)
    ) {
      return session;
    }

    if (session.worktreeDeleted) {
      throw new Error("Cannot run session: worktree has been deleted");
    }

    // If no prompt provided, retrieve the original prompt from the session_started event
    let resolvedPrompt = prompt;
    if (!resolvedPrompt) {
      resolvedPrompt = startMeta?.prompt ?? null;
    }

    if (!session.toolSessionId && resolvedPrompt) {
      resolvedPrompt = await prependSourceSessionContext(
        startMeta?.sourceSessionId ?? null,
        resolvedPrompt,
      );
    }

    // If no tool session ID exists and this isn't the first run, prepend
    // conversation history so the new process has full context.
    if (!session.toolSessionId && resolvedPrompt) {
      const context = await buildConversationContext(id);
      if (context) {
        resolvedPrompt = `${context}\n\n${resolvedPrompt}`;
      }
    }

    // Append system instructions (title, auto-save) to the prompt
    const isFirstRun = !session.toolSessionId;
    if (resolvedPrompt) {
      resolvedPrompt = appendPromptInstructions(resolvedPrompt, {
        hasRepo: !!session.repo,
        sessionGroupKind: session.sessionGroup?.kind,
      });
    }

    // Append base branch instruction when the channel specifies one
    const channelBaseBranch =
      session.channel?.baseBranch ?? session.sessionGroup?.channel?.baseBranch ?? null;
    if (isFirstRun && resolvedPrompt && channelBaseBranch) {
      resolvedPrompt = resolvedPrompt + buildBaseBranchInstruction(channelBaseBranch);
    }

    const checkpointContext = buildCheckpointContextFromStartMeta({
      sessionId: id,
      sessionGroupId: session.sessionGroupId,
      repoId: session.repoId,
      startMeta,
    });

    const command = {
      type: "run" as const,
      sessionId: id,
      prompt: resolvedPrompt ?? undefined,
      appendSystemPrompt: generatedProjectInstruction(session.sessionGroup?.kind),
      tool: session.tool,
      model: session.model ?? undefined,
      reasoningEffort: session.reasoningEffort ?? undefined,
      enableClaudeInChrome: this.claudeInChromeFlag(session.tool, session.createdBy),
      interactionMode,
      cwd: session.workdir ?? undefined,
      toolSessionId: session.toolSessionId ?? undefined,
      checkpointContext,
      imageUrls: imageKeys?.length
        ? await Promise.all(imageKeys.map((key) => storage.getGetUrl(key)))
        : undefined,
    };

    const deliveryResult = sessionRouter.send(id, command, {
      expectedHomeRuntimeId: runtimeBinding.runtimeId ?? conn.runtimeInstanceId,
      organizationId: session.organizationId,
    });

    if (deliveryResult !== "delivered") {
      await this.storePendingCommand(id, {
        type: "run",
        prompt: resolvedPrompt ?? null,
        interactionMode: interactionMode ?? null,
        clientSource: normalizeClientSource(access?.clientSource),
        checkpointContext,
        ...(imageKeys?.length ? { imageKeys } : {}),
      });
      await this.persistConnectionFailure(id, session.organizationId, deliveryResult, "run");
      return prisma.session.findUniqueOrThrow({ where: { id }, include: SESSION_INCLUDE });
    }

    // Only transition to active after successful delivery
    // Persist the runtime binding so restoreSessionsForRuntime can recover it after restart
    const boundRuntime = sessionRouter.getRuntimeForSession(id);
    const updated = await prisma.session.update({
      where: { id },
      data: {
        agentStatus: "active",
        sessionStatus: getRunningSessionStatus(session.sessionStatus),
        connection: this.mergeConnection(session.connection, {
          state: "connected",
          lastSeen: new Date().toISOString(),
          autoRetryable: true,
          ...(boundRuntime && {
            runtimeInstanceId: boundRuntime.id,
            runtimeLabel: boundRuntime.label,
          }),
        }),
      },
      include: SESSION_INCLUDE,
    });
    const sessionGroup = await this.syncGroupWorkspaceState(updated.sessionGroupId, {
      connection: updated.connection as Prisma.InputJsonValue,
      worktreeDeleted: false,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: id,
      eventType: "session_resumed",
      payload: {
        sessionId: id,
        agentStatus: "active",
        sessionStatus: "in_progress",
        clientSource: normalizeClientSource(access?.clientSource),
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "user",
      actorId: session.createdById,
    });

    return updated;
  }

  async recordExternalUserMessage(input: {
    sessionId: string;
    text: string;
    imageKeys?: string[] | null;
    actorId: string;
    organizationId: string;
    clientSource?: string | null;
  }) {
    validateUploadKeysForOrganization(input.imageKeys, input.organizationId);

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const session = await tx.session.findFirst({
        where: { id: input.sessionId, organizationId: input.organizationId },
        select: { id: true, worktreeDeleted: true },
      });
      if (!session) {
        throw new Error("Session not found");
      }
      if (session.worktreeDeleted) {
        throw new Error("Cannot record message: session worktree has been deleted");
      }

      await tx.session.update({
        where: { id: input.sessionId },
        data: {
          lastMessageAt: new Date(),
          lastUserMessageAt: new Date(),
        },
      });

      return eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "session",
          scopeId: input.sessionId,
          eventType: "message_sent",
          payload: {
            text: input.text,
            clientSource: normalizeClientSource(input.clientSource),
            ...(input.imageKeys?.length
              ? { attachmentKeys: input.imageKeys, imageKeys: input.imageKeys }
              : {}),
          },
          actorType: "user",
          actorId: input.actorId,
        },
        tx,
      );
    });
  }

  async terminate(id: string, actorType: ActorType = "system", actorId: string = "system") {
    return this.terminateWithStatus(id, "stopped", "Session stopped", actorType, actorId);
  }

  async dismiss(id: string, actorType: ActorType = "system", actorId: string = "system") {
    return this.terminateWithStatus(id, "done", "Session stopped", actorType, actorId, {
      reason: "manual_stop",
    });
  }

  private async terminateWithStatus(
    id: string,
    targetAgentStatus: AgentStatus,
    resolution: string,
    actorType: ActorType,
    actorId: string,
    payloadExtras?: Record<string, unknown>,
  ) {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id },
      select: { organizationId: true },
    });
    await inboxService.resolveBySource({
      sourceType: "session",
      sourceId: id,
      orgId: session.organizationId,
      resolution,
    });
    return this.transition(
      id,
      "terminate",
      targetAgentStatus,
      "session_terminated",
      actorType,
      actorId,
      payloadExtras,
    );
  }

  async delete(
    id: string,
    actorType: ActorType = "system",
    actorId: string = "system",
    eventPayloadExtras?: Record<string, unknown>,
  ) {
    const session = await prisma.session.findUnique({
      where: { id },
      include: SESSION_INCLUDE,
    });
    if (!session) throw new Error("Session not found or already deleted");

    // Resolve any pending inbox items (plans/questions awaiting input)
    await inboxService.resolveBySource({
      sourceType: "session",
      sourceId: id,
      orgId: session.organizationId,
      resolution: "Session deleted",
    });

    const remainingCount = session.sessionGroupId
      ? await prisma.session.count({
          where: {
            sessionGroupId: session.sessionGroupId,
            id: { not: id },
          },
        })
      : 0;

    if (remainingCount === 0) {
      if (session.sessionGroupId) {
        terminalRelay.destroyAllForSessionGroup(session.sessionGroupId);
      } else {
        terminalRelay.destroyAllForSession(id);
      }
      await this.resetReconcileState(id);
      const runtimeSession = await this.withGroupRuntimeState(session);
      await sessionRouter.destroyRuntime(
        id,
        runtimeSession,
        this.destroyRuntimeOptions(id, "session_deleted"),
      );
    } else {
      terminalRelay.destroyAllForSession(id);
      try {
        await sessionRouter.transitionRuntime(id, session.hosting, "terminate");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[session-service] failed to terminate session ${id} before delete: ${message}`,
        );
      }
      sessionRouter.unbindSession(id);
    }

    let deletedSessionGroupId: string | null = null;
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.sessionProject.deleteMany({ where: { sessionId: id } });
      await tx.ticketLink.deleteMany({ where: { entityType: "session", entityId: id } });
      await tx.session.delete({ where: { id } });

      if (session.sessionGroupId && remainingCount === 0) {
        await tx.sessionGroup.delete({ where: { id: session.sessionGroupId } });
        deletedSessionGroupId = session.sessionGroupId;
      }
    });

    // Broadcast the deletion event (events are kept for audit trail)
    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: id,
      eventType: "session_deleted",
      payload: {
        sessionId: id,
        name: session.name,
        sessionGroupId: session.sessionGroupId ?? null,
        deletedSessionGroupId,
        ...(eventPayloadExtras ?? {}),
      },
      actorType,
      actorId,
    });

    return session;
  }

  async deleteGroup(
    groupId: string,
    organizationId: string,
    actorType: ActorType = "system",
    actorId: string = "system",
    eventPayloadExtras?: Record<string, unknown>,
  ) {
    const group = await prisma.sessionGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new Error("Session group not found");
    if (group.organizationId !== organizationId) throw new Error("Session group not found");
    if (actorId !== "system") {
      await assertSessionGroupAccess(groupId, actorId, organizationId);
    }

    const sessions = await prisma.session.findMany({
      where: { sessionGroupId: groupId },
      select: { id: true },
    });

    for (const session of sessions) {
      await this.delete(session.id, actorType, actorId, eventPayloadExtras);
    }

    // If no sessions existed, the group won't have been cascade-deleted, so delete it directly
    if (sessions.length === 0) {
      await prisma.sessionGroup.delete({ where: { id: groupId } });
      await eventService.create({
        organizationId: group.organizationId,
        scopeType: "session",
        scopeId: groupId,
        eventType: "session_deleted",
        payload: {
          deletedSessionGroupId: groupId,
          ...(eventPayloadExtras ?? {}),
        },
        actorType,
        actorId,
      });
    }

    if (isGeneratedProjectKind(group.kind) && group.repoId) {
      // A restored app group shares the source group's managed repo, so this
      // repo can be referenced by more than one group. Only delete the repo
      // (and its bare storage + cascaded checkpoints) when no other group
      // still points at it — otherwise deleting this group would destroy a
      // live sibling's source and history.
      const otherReferences = await prisma.sessionGroup.count({
        where: { repoId: group.repoId, id: { not: groupId } },
      });
      if (otherReferences === 0) {
        await managedGitService.deleteManagedRepo({
          organizationId,
          repoId: group.repoId,
          actorType,
          actorId,
        });
      }
    }

    return true;
  }

  private async transition(
    id: string,
    command: "terminate",
    newAgentStatus: AgentStatus,
    eventType: EventType,
    actorType: ActorType,
    actorId: string,
    payloadExtras?: Record<string, unknown>,
  ) {
    const current = await prisma.session.findUniqueOrThrow({
      where: { id },
      select: {
        hosting: true,
        organizationId: true,
        agentStatus: true,
        sessionStatus: true,
        worktreeDeleted: true,
        sessionGroupId: true,
      },
    });

    if (
      isFullyUnloadedSession(current.agentStatus, current.sessionStatus, current.worktreeDeleted)
    ) {
      return prisma.session.findUniqueOrThrow({ where: { id }, include: SESSION_INCLUDE });
    }

    // Attempt to notify the runtime; proceed regardless — we always want the session marked as terminated
    await sessionRouter.transitionRuntime(id, current.hosting, command);

    // When terminating, clear needs_input — the session is no longer waiting for user input.
    const newSessionStatus =
      current.sessionStatus === "needs_input"
        ? getIdleSessionStatus(current.sessionStatus)
        : current.sessionStatus;

    const session = await prisma.session.update({
      where: { id },
      data: {
        agentStatus: newAgentStatus,
        ...(newSessionStatus !== current.sessionStatus ? { sessionStatus: newSessionStatus } : {}),
      },
      include: SESSION_INCLUDE,
    });
    const sessionGroup = await this.loadSessionGroupSnapshot(current.sessionGroupId);

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: id,
      eventType,
      payload: {
        sessionId: id,
        agentStatus: newAgentStatus,
        sessionStatus: newSessionStatus,
        ...(sessionGroup ? { sessionGroup } : {}),
        ...(payloadExtras ?? {}),
      },
      actorType,
      actorId,
    });

    return session;
  }

  async updateConfig(
    sessionId: string,
    organizationId: string,
    config: {
      tool?: CodingTool;
      model?: string;
      reasoningEffort?: string;
      hosting?: string;
      runtimeInstanceId?: string;
    },
    actorType: ActorType,
    actorId: string,
  ) {
    const prev = await prisma.session.findFirstOrThrow({
      where: { id: sessionId, organizationId },
      select: {
        id: true,
        tool: true,
        model: true,
        reasoningEffort: true,
        agentStatus: true,
        hosting: true,
        repoId: true,
        sessionGroupId: true,
        sessionGroup: {
          select: {
            kind: true,
            slug: true,
            visibility: true,
            ownerUserId: true,
            connection: true,
            workdir: true,
            sessions: { select: { id: true, agentStatus: true } },
          },
        },
        channel: { select: { baseBranch: true } },
        connection: true,
        workdir: true,
        pendingRun: true,
        readOnlyWorkspace: true,
        branch: true,
        repo: { select: { id: true, name: true, remoteUrl: true, defaultBranch: true } },
      },
    });
    if (prev.sessionGroup && !canViewSessionGroup(prev.sessionGroup, actorId)) {
      throw new AuthorizationError("Not authorized for this session");
    }

    const toolChanged = config.tool != null && config.tool !== prev.tool;
    const nextTool = config.tool ?? prev.tool;
    const nextModel =
      config.model != null
        ? validateModelForTool(nextTool, config.model)
        : toolChanged
          ? (getDefaultModel(nextTool) ?? null)
          : undefined;
    const nextReasoningEffort =
      config.reasoningEffort != null
        ? validateReasoningEffortForTool(nextTool, config.reasoningEffort)
        : toolChanged
          ? (getDefaultReasoningEffort(nextTool) ?? null)
          : undefined;

    const data: Record<string, unknown> = {};
    if (config.tool != null) data.tool = config.tool;
    if (nextModel !== undefined) data.model = nextModel;
    if (nextReasoningEffort !== undefined) data.reasoningEffort = nextReasoningEffort;
    if (toolChanged) {
      data.toolChangedAt = new Date();
      data.toolSessionId = null;
    }

    // Allow runtime switching for not_started sessions
    const runtimeChanged =
      prev.agentStatus === "not_started" &&
      (config.hosting != null || config.runtimeInstanceId != null);
    if (runtimeChanged && isGeneratedProjectKind(prev.sessionGroup?.kind)) {
      throw new ValidationError("App and Design sessions use a fixed cloud runtime");
    }
    if (
      runtimeChanged &&
      prev.sessionGroup &&
      hasRuntimeBinding(
        this.parseConnection(prev.sessionGroup.connection),
        prev.sessionGroup.workdir,
      ) &&
      prev.sessionGroup.sessions.some(
        (session) => session.id !== prev.id && session.agentStatus !== "not_started",
      )
    ) {
      throw new ValidationError(
        "This session group already has started sessions on a bridge. Use Move to switch the entire session group.",
      );
    }
    let requestedEnvironment: Awaited<
      ReturnType<typeof agentEnvironmentService.resolveForSessionRequest>
    > | null = null;
    let shouldProvisionPendingRun = false;
    let targetRuntimeKey: string | null = null;
    if (runtimeChanged) {
      if (isLocalMode() && config.hosting === "cloud") {
        throw new Error("Cloud sessions are disabled in local mode");
      }
      let newHosting = config.hosting ?? prev.hosting;
      let runtimeInstanceId: string | undefined;
      let runtimeLabel: string | undefined;
      if (config.runtimeInstanceId) {
        await this.assertRuntimeAccess({
          userId: actorId,
          organizationId,
          runtimeInstanceId: config.runtimeInstanceId,
          sessionGroupId: prev.sessionGroupId,
        });
        const runtime = sessionRouter.getRuntime(config.runtimeInstanceId, organizationId);
        if (!runtime) throw new Error("Requested runtime not found");
        newHosting = runtime.hostingMode;
        runtimeInstanceId = runtime.id;
        runtimeLabel = runtime.label;
        targetRuntimeKey = runtime.key;
        await this.assertPrivateRuntimeOwner({
          visibility: prev.sessionGroup?.visibility,
          ownerUserId: prev.sessionGroup?.ownerUserId,
          organizationId,
          hosting: newHosting,
          runtimeInstanceId,
        });
      } else if (newHosting === "cloud") {
        await this.assertPrivateRuntimeOwner({
          visibility: prev.sessionGroup?.visibility,
          ownerUserId: prev.sessionGroup?.ownerUserId,
          organizationId,
          hosting: newHosting,
          runtimeInstanceId: null,
        });
        assertCloudRepoRemoteAvailable(newHosting, prev.repo);
        requestedEnvironment = await agentEnvironmentService.resolveForSessionRequest({
          organizationId,
          adapterType: "provisioned",
          tool: nextTool,
          actorType,
          actorId,
        });
        if (!requestedEnvironment) {
          throw new Error("No enabled cloud agent environment is configured");
        }
      } else if (newHosting === "local") {
        const runtime = await this.resolveDefaultAccessibleLocalRuntime({
          userId: actorId,
          organizationId,
          tool: nextTool,
          repoId: prev.repoId,
          sessionGroupId: prev.sessionGroupId,
        });
        if (!runtime) {
          throw new Error("No accessible local runtime available");
        }
        runtimeInstanceId = runtime.id;
        runtimeLabel = runtime.label;
        targetRuntimeKey = runtime.key;
        await this.assertPrivateRuntimeOwner({
          visibility: prev.sessionGroup?.visibility,
          ownerUserId: prev.sessionGroup?.ownerUserId,
          organizationId,
          hosting: newHosting,
          runtimeInstanceId,
        });
      }

      // A config-based runtime selection is a group move just like the
      // explicit Move mutation. Detach the selected session now; siblings are
      // terminated and rebound together after the shared connection commits.
      if (prev.sessionGroupId) {
        terminalRelay.destroyAllForSessionGroup(prev.sessionGroupId);
      } else {
        terminalRelay.destroyAllForSession(sessionId);
      }
      sessionRouter.unbindSession(sessionId);
      if (targetRuntimeKey) sessionRouter.bindSession(sessionId, targetRuntimeKey);
      shouldProvisionPendingRun =
        this.parsePendingCommands(prev.pendingRun).length > 0 &&
        !prev.workdir &&
        (!!prev.repoId || newHosting === "cloud");
      data.hosting = newHosting;
      data.connection = connJson(
        defaultConnection({
          ...(shouldProvisionPendingRun && { state: "connecting" }),
          ...(requestedEnvironment && {
            environmentId: requestedEnvironment.id,
            adapterType: requestedEnvironment.adapterType,
          }),
          ...(runtimeInstanceId && { runtimeInstanceId }),
          ...(runtimeLabel && { runtimeLabel }),
        }),
      );
      data.workdir = null;
      if (shouldProvisionPendingRun) {
        data.agentStatus = "active";
        data.sessionStatus = "in_progress";
      }
    }

    const session = await prisma.session.update({
      where: { id: prev.id },
      data,
      include: SESSION_INCLUDE,
    });

    // Sync group connection if runtime changed
    if (runtimeChanged && session.sessionGroupId) {
      await this.syncGroupWorkspaceState(
        session.sessionGroupId,
        {
          connection: session.connection as Prisma.InputJsonValue,
          worktreeDeleted: false,
        },
        {
          rebindSessionsToConnection: true,
          hosting: session.hosting as "cloud" | "local",
        },
      );
    }

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "config_changed",
        tool: config.tool ?? session.tool,
        model: nextModel !== undefined ? nextModel : session.model,
        reasoningEffort:
          nextReasoningEffort !== undefined ? nextReasoningEffort : session.reasoningEffort,
        toolChanged,
        ...(runtimeChanged && { hosting: session.hosting, connection: session.connection }),
      },
      actorType,
      actorId,
    });

    if (shouldProvisionPendingRun) {
      const conn = this.parseConnection(session.connection);
      this.provisionRuntime({
        sessionId: session.id,
        sessionGroupId: session.sessionGroupId,
        sessionGroupKind: session.sessionGroup?.kind,
        slug: session.sessionGroup?.slug,
        preserveBranchName: shouldPreserveWorkspaceBranchName({
          slug: session.sessionGroup?.slug,
          branch: session.branch,
          channelBaseBranch: session.channel?.baseBranch,
        }),
        hosting: session.hosting,
        tool: session.tool,
        model: session.model,
        reasoningEffort: session.reasoningEffort,
        repo: session.repo,
        branch: session.branch,
        createdById: session.createdById,
        organizationId: session.organizationId,
        readOnly: session.readOnlyWorkspace,
        adapterType: conn.adapterType,
        environment: requestedEnvironment,
      });
    }

    return session;
  }

  async updateDefaults(userId: string, input: UpdateSessionDefaultsInput) {
    const data: Prisma.UserUpdateInput = {};

    if (Object.prototype.hasOwnProperty.call(input, "tool")) {
      const tool = input.tool ?? null;
      const model = tool
        ? input.model
          ? validateModelForTool(tool, input.model)
          : (getDefaultModel(tool) ?? null)
        : null;
      const reasoningEffort = tool
        ? input.reasoningEffort
          ? validateReasoningEffortForTool(tool, input.reasoningEffort)
          : (getDefaultReasoningEffort(tool) ?? null)
        : null;

      data.defaultSessionTool = tool;
      data.defaultSessionModel = model;
      data.defaultSessionReasoningEffort = reasoningEffort;
    }

    if (typeof input.autoArchiveMergedSessions === "boolean") {
      data.autoArchiveMergedSessions = input.autoArchiveMergedSessions;
    }

    if (typeof input.enableClaudeInChrome === "boolean") {
      data.enableClaudeInChrome = input.enableClaudeInChrome;
    }

    return prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  /**
   * Resolve whether the "Claude in Chrome" flag should be passed for a session.
   * User-level setting on the session creator; only relevant for Claude Code.
   */
  private claudeInChromeFlag(
    tool: string | null | undefined,
    createdBy: { enableClaudeInChrome: boolean } | null | undefined,
  ): boolean {
    return tool === "claude_code" && (createdBy?.enableClaudeInChrome ?? false);
  }

  async recordOutput(sessionId: string, data: Record<string, unknown>) {
    // Extract and strip <trace-title> and <trace-branch> tags from assistant text before persisting
    const extractedTitle = this.extractAndStripTitle(data);
    const extractedBranch = this.extractAndStripBranch(data);
    const pendingInfo = extractPendingInputInfo(data);

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        organizationId: true,
        agentStatus: true,
        sessionStatus: true,
        sessionGroupId: true,
      },
    });
    if (!session) return;

    const parentToolUseId =
      typeof data.parentToolUseId === "string" ? data.parentToolUseId : undefined;

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: data as unknown as Prisma.InputJsonValue,
      actorType: "system",
      actorId: "system",
      ...(parentToolUseId ? { parentId: parentToolUseId } : {}),
    });

    if (data.type === "assistant") {
      await prisma.session.update({
        where: { id: sessionId },
        data: { lastMessageAt: new Date() },
      });
    }

    if (data.usage || typeof data.costUsd === "number") {
      await this.recordUsage(sessionId, session.organizationId, data);
    }

    // If we found a title tag, update the session name
    if (extractedTitle) {
      await this.updateName(sessionId, extractedTitle);
    }

    // If we found a branch tag, update the branch on session + session group
    if (extractedBranch) {
      await this.updateBranch(sessionId, extractedBranch);
    }

    // If this output contains a QuestionBlock or PlanBlock, transition to needs_input immediately.
    // This keeps the UI responsive even before session_complete is processed, and acts as a
    // safety net for adapters that exit or pause around pending-input tool calls.
    const needsInput = pendingInfo !== null || hasQuestionBlock(data) || hasPlanBlock(data);
    if (session.agentStatus === "active" && needsInput) {
      // Use agentStatus in the where clause to make this idempotent — if two
      // recordOutput calls race, only the first one that sees "active" wins.
      const updated = await prisma.session.updateMany({
        where: { id: sessionId, agentStatus: "active" },
        data: { sessionStatus: "needs_input" },
      });

      // Only emit the pending event if we won the race — avoids duplicate events
      if (updated.count > 0) {
        const sessionGroup = await this.loadSessionGroupSnapshot(session.sessionGroupId);

        // Emit as session_output with a status patch — matches the workspace_ready pattern.
        // The frontend's sessionPatchFromOutput picks up the sessionStatus field.
        // Questions take precedence — they need immediate user interaction
        const pendingType = pendingInfo?.kind === "plan" ? "plan_pending" : "question_pending";
        await eventService.create({
          organizationId: session.organizationId,
          scopeType: "session",
          scopeId: sessionId,
          eventType: "session_output",
          payload: {
            type: pendingType,
            sessionStatus: "needs_input",
            ...(sessionGroup ? { sessionGroup } : {}),
          },
          actorType: "system",
          actorId: "system",
        });

        // Create inbox item for the session creator
        const fullSession = await prisma.session.findUniqueOrThrow({
          where: { id: sessionId },
          select: { createdById: true, name: true },
        });

        await this.createInboxItemFromOutput({
          orgId: session.organizationId,
          userId: fullSession.createdById,
          sessionName: fullSession.name,
          sessionId,
          data,
        });
      }
    }
  }

  /**
   * Accumulate token usage and cost from a coding tool output message onto
   * the session, then emit a usage_updated patch so clients update live.
   */
  private async recordUsage(
    sessionId: string,
    organizationId: string,
    data: Record<string, unknown>,
  ) {
    const usage =
      data.usage && typeof data.usage === "object" && !Array.isArray(data.usage)
        ? (data.usage as Record<string, unknown>)
        : null;
    const num = (value: unknown): number => (typeof value === "number" ? value : 0);
    const inputTokens = num(usage?.inputTokens);
    const outputTokens = num(usage?.outputTokens);
    const cacheReadTokens = num(usage?.cacheReadTokens);
    const cacheCreationTokens = num(usage?.cacheCreationTokens);
    const costUsd = num(data.costUsd);

    if (
      inputTokens === 0 &&
      outputTokens === 0 &&
      cacheReadTokens === 0 &&
      cacheCreationTokens === 0 &&
      costUsd === 0
    ) {
      return;
    }

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: {
        inputTokens: { increment: inputTokens },
        outputTokens: { increment: outputTokens },
        cacheReadTokens: { increment: cacheReadTokens },
        cacheCreationTokens: { increment: cacheCreationTokens },
        costUsd: { increment: costUsd },
      },
      select: {
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        cacheCreationTokens: true,
        costUsd: true,
      },
    });

    // No group snapshot here: this runs on every assistant message, and the
    // group usage badge already derives its total from session entities, so the
    // per-session patch is enough. Avoids an extra query on the hot path.
    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "usage_updated",
        inputTokens: numberFromBigInt(updated.inputTokens),
        outputTokens: numberFromBigInt(updated.outputTokens),
        cacheReadTokens: numberFromBigInt(updated.cacheReadTokens),
        cacheCreationTokens: numberFromBigInt(updated.cacheCreationTokens),
        costUsd: updated.costUsd,
      },
      actorType: "system",
      actorId: "system",
    });
  }

  async updateName(sessionId: string, name: string) {
    const current = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        name: true,
        organizationId: true,
        sessionGroupId: true,
        sessionGroup: {
          select: { name: true },
        },
      },
    });

    const session = await prisma.session.update({
      where: { id: sessionId },
      data: { name },
      select: { organizationId: true },
    });

    const shouldSyncGroupName =
      current.sessionGroupId != null && current.sessionGroup?.name === current.name;
    const sessionGroup =
      shouldSyncGroupName && current.sessionGroupId
        ? await prisma.sessionGroup.update({
            where: { id: current.sessionGroupId },
            data: { name },
            select: SESSION_GROUP_SUMMARY_SELECT,
          })
        : null;

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "title_generated",
        name,
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId: "system",
    });
  }

  /**
   * Look for <session-title>…</session-title> in assistant text blocks.
   * If found, strip the tag from the text content (mutates data in place)
   * and return the extracted title. Returns null if no tag found.
   */
  private extractAndStripTitle(data: Record<string, unknown>): string | null {
    if (data.type !== "assistant") return null;

    const message = data.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (!Array.isArray(content)) return null;

    for (const block of content) {
      const b = block as Record<string, unknown>;
      if (b.type !== "text" || typeof b.text !== "string") continue;

      const match = TITLE_TAG_RE.exec(b.text);
      if (match) {
        const title = match[1].trim().slice(0, MAX_SESSION_NAME_LENGTH);
        // Strip all title tags from the text so none leak to the UI
        b.text = b.text.replace(/<trace-title>[\s\S]*?<\/trace-title>/g, "").trimStart();
        return title || null;
      }
    }

    return null;
  }

  /**
   * Look for <trace-branch>…</trace-branch> in assistant text blocks.
   * If found, strip the tag from the text content (mutates data in place)
   * and return the extracted branch name. Returns null if no tag found.
   */
  private extractAndStripBranch(data: Record<string, unknown>): string | null {
    if (data.type !== "assistant") return null;

    const message = data.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (!Array.isArray(content)) return null;

    for (const block of content) {
      const b = block as Record<string, unknown>;
      if (b.type !== "text" || typeof b.text !== "string") continue;

      const match = BRANCH_TAG_RE.exec(b.text);
      if (match) {
        const branch = match[1].trim();
        // Strip all branch tags from the text so none leak to the UI
        b.text = b.text.replace(/<trace-branch>[\s\S]*?<\/trace-branch>/g, "").trimStart();
        return branch || null;
      }
    }

    return null;
  }

  private async updateBranch(sessionId: string, branch: string) {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { organizationId: true, sessionGroupId: true },
    });

    const sessionGroup = await this.syncGroupWorkspaceState(session.sessionGroupId, { branch });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "branch_renamed",
        branch,
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId: "system",
    });
  }

  async complete(id: string) {
    // Only transition from active — don't overwrite explicit user actions
    const current = await prisma.session.findUnique({
      where: { id },
      select: { agentStatus: true, sessionStatus: true, sessionGroupId: true },
    });
    if (!current || current.agentStatus !== "active") return;

    // Find when the current run started (last session_resumed or session_started)
    const lastResume = await prisma.event.findFirst({
      where: {
        scopeId: id,
        scopeType: "session",
        eventType: { in: ["session_resumed", "session_started"] },
      },
      orderBy: { timestamp: "desc" },
    });

    // Only check session_output events from the current run
    const recentEvents = await prisma.event.findMany({
      where: {
        scopeId: id,
        scopeType: "session",
        eventType: "session_output",
        ...(lastResume && { timestamp: { gte: lastResume.timestamp } }),
      },
      orderBy: { timestamp: "desc" },
      take: 10,
    });

    const hasPendingPlan = recentEvents.some((evt: { payload: Prisma.JsonValue }) => {
      return hasPlanBlock(evt.payload as Record<string, unknown>);
    });

    // Safety net for adapters that exit cleanly after emitting a question
    // (Claude Code hangs on stdin so recordOutput handles it first, but other
    // adapters may reach complete() with a question still pending).
    const hasQuestion = recentEvents.some((evt: { payload: Prisma.JsonValue }) => {
      return hasQuestionBlock(evt.payload as Record<string, unknown>);
    });

    const newAgentStatus: AgentStatus = "done";
    // Preserve `merged` over `needs_input`: a question/plan from a follow-up run shouldn't
    // erase the fact that the PR was already merged.
    const newSessionStatus: SessionStatus =
      current.sessionStatus === "merged"
        ? "merged"
        : hasPendingPlan || hasQuestion
          ? "needs_input"
          : current.sessionStatus === "in_review"
            ? "in_review"
            : "in_progress";

    const session = await prisma.session.update({
      where: { id },
      data: { agentStatus: newAgentStatus, sessionStatus: newSessionStatus },
      select: { organizationId: true, createdById: true, name: true },
    });
    const sessionGroup = await this.loadSessionGroupSnapshot(current.sessionGroupId);

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: id,
      eventType: "session_terminated",
      payload: {
        sessionId: id,
        reason: "bridge_complete",
        agentStatus: newAgentStatus,
        sessionStatus: newSessionStatus,
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId: "system",
    });

    // Create inbox item when complete() observes a pending question/plan that hasn't been
    // surfaced yet. Gated on the question/plan flag rather than newSessionStatus so that
    // merged-but-retained sessions still raise an inbox item.
    const hasPendingInput = hasPendingPlan || hasQuestion;
    if (hasPendingInput && current.sessionStatus !== "needs_input") {
      const triggerEvent = recentEvents.find((evt: { payload: Prisma.JsonValue }) => {
        const p = evt.payload as Record<string, unknown>;
        return hasQuestionBlock(p) || hasPlanBlock(p);
      });
      const triggerPayload = triggerEvent?.payload as Record<string, unknown> | undefined;

      if (triggerPayload) {
        await this.createInboxItemFromOutput({
          orgId: session.organizationId,
          userId: session.createdById,
          sessionName: session.name,
          sessionId: id,
          data: triggerPayload,
        });
      }
    }

    if (!hasPendingInput) {
      setImmediate(() => {
        void this.drainNextPendingOrQueuedMessage(id);
      });
    }
  }

  async listIdleActiveRunSessionIds(options: {
    sessionIds: string[];
    activeSessionIds: string[];
    now?: number;
    quietAfterMs?: number;
  }): Promise<string[]> {
    const uniqueSessionIds = [...new Set(options.sessionIds)].filter((id) => id.length > 0);
    if (uniqueSessionIds.length === 0) return [];

    const activeSessionIds = new Set(options.activeSessionIds);
    const inactiveSessionIds = uniqueSessionIds.filter((id) => !activeSessionIds.has(id));
    if (inactiveSessionIds.length === 0) return [];

    const now = options.now ?? Date.now();
    const quietAfterMs = options.quietAfterMs ?? 60_000;
    const cutoff = new Date(now - quietAfterMs);
    const candidates = await prisma.session.findMany({
      where: {
        id: { in: inactiveSessionIds },
        agentStatus: "active",
        OR: [{ lastMessageAt: { lt: cutoff } }, { lastMessageAt: null, updatedAt: { lt: cutoff } }],
      },
      select: { id: true },
    });

    return candidates.map((candidate) => candidate.id);
  }

  async reconcileIdleActiveRuns(options: {
    sessionIds: string[];
    activeSessionIds: string[];
    now?: number;
    quietAfterMs?: number;
  }): Promise<string[]> {
    const candidates = await this.listIdleActiveRunSessionIds(options);
    const completed: string[] = [];
    for (const sessionId of candidates) {
      await this.complete(sessionId);
      completed.push(sessionId);
    }
    return completed;
  }

  async sendMessage({
    sessionId,
    text,
    imageKeys,
    actorType,
    actorId,
    interactionMode,
    clientMutationId,
    clientSource,
  }: {
    sessionId: string;
    text: string;
    imageKeys?: string[];
    actorType: ActorType;
    actorId: string;
    interactionMode?: string;
    clientMutationId?: string;
    clientSource?: string | null;
  }) {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        organizationId: true,
        agentStatus: true,
        sessionStatus: true,
        hosting: true,
        createdById: true,
        createdBy: { select: { enableClaudeInChrome: true } },
        tool: true,
        model: true,
        reasoningEffort: true,
        toolChangedAt: true,
        workdir: true,
        toolSessionId: true,
        repoId: true,
        sessionGroupId: true,
        sessionGroup: { select: { kind: true, slug: true } },
        channel: { select: { baseBranch: true } },
        connection: true,
        pendingRun: true,
        worktreeDeleted: true,
        readOnlyWorkspace: true,
        repo: { select: { id: true, name: true, remoteUrl: true, defaultBranch: true } },
        branch: true,
      },
    });
    validateUploadKeysForOrganization(imageKeys, session.organizationId);
    const conn = this.parseConnection(session.connection);
    const allowToolFallback =
      actorType === "user" &&
      !session.toolChangedAt &&
      conn.toolSource === "default" &&
      session.agentStatus === "not_started" &&
      !session.workdir &&
      !session.toolSessionId;
    const runtimeBinding =
      actorType === "user"
        ? await this.resolveAccessibleLocalRuntimeBinding({
            sessionId,
            sessionGroupId: session.sessionGroupId,
            organizationId: session.organizationId,
            userId: actorId,
            hosting: session.hosting,
            tool: session.tool,
            allowToolFallback,
            repoId: session.repoId,
            connection: session.connection,
          })
        : {
            runtimeId: conn.runtimeInstanceId ?? null,
            runtimeLabel: conn.runtimeLabel ?? null,
          };
    const activeTool = runtimeBinding.fallbackTool ?? session.tool;
    const activeModel =
      activeTool !== session.tool
        ? (resolveStoredModelForTool(activeTool, session.model) ??
          getDefaultModel(activeTool) ??
          null)
        : session.model;
    const activeReasoningEffort =
      activeTool !== session.tool
        ? (resolveStoredReasoningEffortForTool(activeTool, session.reasoningEffort) ??
          getDefaultReasoningEffort(activeTool) ??
          null)
        : session.reasoningEffort;
    if (activeTool !== session.tool) {
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          tool: activeTool,
          model: activeModel,
          reasoningEffort: activeReasoningEffort,
          toolSessionId: null,
        },
      });
      await eventService.create({
        organizationId: session.organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "session_output",
        payload: {
          type: "config_changed",
          tool: activeTool,
          model: activeModel,
          reasoningEffort: activeReasoningEffort,
          toolChanged: false,
        },
        actorType,
        actorId,
      });
    }

    if (session.worktreeDeleted) {
      throw new Error("Cannot send messages: session worktree has been deleted");
    }

    // If runtime was deferred (session created without a prompt), provision it
    // now and queue the message for delivery once the workspace is ready.
    if (session.agentStatus === "not_started" && !session.workdir && !session.toolSessionId) {
      const needsProvisioning = !!session.repoId || session.hosting === "cloud";
      if (needsProvisioning) {
        assertCloudRepoRemoteAvailable(session.hosting, session.repo);
        const pendingSessionStatus = getRunningSessionStatus(session.sessionStatus);
        const pendingCommand: PendingSessionCommand = {
          type: "send",
          prompt: text,
          interactionMode: interactionMode ?? null,
          clientSource: normalizeClientSource(clientSource),
          checkpointContext: null,
          ...(imageKeys?.length ? { imageKeys } : {}),
        };
        const markLocalPreparing = session.hosting === "local";
        await this.storePendingCommand(
          sessionId,
          pendingCommand,
          {
            agentStatus: "active",
            sessionStatus: pendingSessionStatus,
            lastMessageAt: new Date(),
            ...(actorType === "user" ? { lastUserMessageAt: new Date() } : {}),
            ...(markLocalPreparing && {
              connection: this.mergeConnection(session.connection, {
                state: "connecting",
                ...(runtimeBinding.runtimeId &&
                  !conn.runtimeInstanceId && {
                    runtimeInstanceId: runtimeBinding.runtimeId,
                    runtimeLabel: runtimeBinding.runtimeLabel ?? undefined,
                  }),
              }),
            }),
          },
          session.pendingRun,
        );

        const alreadyStarting = isRuntimeStartupState(conn.state);
        if (!alreadyStarting) {
          this.provisionRuntime({
            sessionId,
            sessionGroupId: session.sessionGroupId,
            sessionGroupKind: session.sessionGroup?.kind,
            slug: session.sessionGroup?.slug,
            preserveBranchName: shouldPreserveWorkspaceBranchName({
              slug: session.sessionGroup?.slug,
              branch: session.branch,
              channelBaseBranch: session.channel?.baseBranch,
            }),
            hosting: session.hosting,
            tool: activeTool,
            model: activeModel,
            reasoningEffort: activeReasoningEffort,
            repo: session.repo,
            branch: session.branch,
            createdById: session.createdById,
            organizationId: session.organizationId,
            readOnly: session.readOnlyWorkspace,
            adapterType: conn.adapterType,
          });
        }

        const event = await eventService.create({
          organizationId: session.organizationId,
          scopeType: "session",
          scopeId: sessionId,
          eventType: "message_sent",
          payload: {
            text,
            clientSource: normalizeClientSource(clientSource),
            deliveryStatus: "pending_runtime",
            agentStatus: "active",
            sessionStatus: pendingSessionStatus,
            ...(imageKeys?.length ? { attachmentKeys: imageKeys, imageKeys } : {}),
            ...(clientMutationId ? { clientMutationId } : {}),
          },
          actorType,
          actorId,
        });
        return event;
      }
    }

    // If session has a read-only workspace and user explicitly switched away from ask mode,
    // trigger a workspace upgrade to create a real worktree
    if (session.readOnlyWorkspace && interactionMode && interactionMode !== "ask" && session.repo) {
      const pendingCommand: PendingSessionCommand = {
        type: "send",
        prompt: text,
        interactionMode: interactionMode ?? null,
        clientSource: normalizeClientSource(clientSource),
        checkpointContext: null,
        ...(imageKeys?.length ? { imageKeys } : {}),
      };
      await this.triggerWorkspaceUpgrade(sessionId, session, pendingCommand, {
        lastMessageAt: new Date(),
        ...(actorType === "user" ? { lastUserMessageAt: new Date() } : {}),
      });
      // Record the message event so it appears in the UI
      const event = await eventService.create({
        organizationId: session.organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "message_sent",
        payload: {
          text,
          clientSource: normalizeClientSource(clientSource),
          ...(imageKeys?.length ? { attachmentKeys: imageKeys, imageKeys } : {}),
          ...(clientMutationId ? { clientMutationId } : {}),
        },
        actorType,
        actorId,
      });
      return event;
    }

    // If the tool was recently switched and no user message has been sent since,
    // prepend conversation history so the new coding tool has context.
    let prompt = text;
    let conversationContext: string | null | undefined;
    let hasPrependedConversationContext = false;
    if (session.toolChangedAt) {
      const msgSinceSwitch = await prisma.event.findFirst({
        where: {
          scopeId: sessionId,
          scopeType: "session",
          eventType: "message_sent",
          timestamp: { gt: session.toolChangedAt },
        },
      });
      if (!msgSinceSwitch) {
        conversationContext = await buildConversationContext(sessionId);
        const context = conversationContext;
        if (context) {
          prompt = `${context}\n\n${text}`;
          hasPrependedConversationContext = true;
        }
      }
    }

    if (!session.toolSessionId) {
      const context =
        conversationContext === undefined
          ? await buildConversationContext(sessionId)
          : conversationContext;
      if (context && !hasPrependedConversationContext) {
        prompt = `${context}\n\n${prompt}`;
      } else if (!context) {
        const startMeta = await getSessionStartMetadata(sessionId);
        prompt = await prependSourceSessionContext(startMeta.sourceSessionId, prompt);
      }
    }

    // Append system instructions (title, auto-save) to the prompt
    prompt = appendPromptInstructions(prompt, {
      hasRepo: !!session.repoId,
      sessionGroupKind: session.sessionGroup?.kind,
    });

    const checkpointContext =
      session.repoId && session.sessionGroupId
        ? createCheckpointContext({
            checkpointContextId: randomUUID(),
            sessionId,
            sessionGroupId: session.sessionGroupId,
            repoId: session.repoId,
          })
        : null;
    const checkpointMetadata = checkpointContext
      ? ({ checkpointContextId: checkpointContext.checkpointContextId } as Prisma.InputJsonValue)
      : undefined;

    // Generate presigned GET URLs for attached files
    let imageUrls: string[] | undefined;
    if (imageKeys?.length) {
      imageUrls = await Promise.all(imageKeys.map((key) => storage.getGetUrl(key)));
      runtimeDebug(`Generated ${imageUrls.length} attachment URLs for ${sessionId}`);
    }

    // Attempt delivery before marking active. Pinning to the session's home
    // runtime prevents silent bridge hijack when the home is offline and a
    // different bridge (e.g. Laptop B) is now the only connected runtime.
    const expectedRuntimeId = runtimeBinding.runtimeId ?? conn.runtimeInstanceId;
    const deliveryCommand = {
      type: "send" as const,
      sessionId,
      prompt,
      appendSystemPrompt: generatedProjectInstruction(session.sessionGroup?.kind),
      tool: activeTool,
      model: activeModel ?? undefined,
      reasoningEffort: activeReasoningEffort ?? undefined,
      enableClaudeInChrome: this.claudeInChromeFlag(activeTool, session.createdBy),
      interactionMode,
      cwd: session.workdir ?? undefined,
      toolSessionId: session.toolSessionId ?? undefined,
      checkpointContext,
      imageUrls,
    };
    const deliveryResult: DeliveryResult =
      session.hosting === "cloud" && !expectedRuntimeId
        ? "no_runtime"
        : sessionRouter.send(sessionId, deliveryCommand, {
            expectedHomeRuntimeId: expectedRuntimeId ?? undefined,
            organizationId: session.organizationId,
          });

    if (deliveryResult !== "delivered") {
      await this.storePendingCommand(
        sessionId,
        {
          type: "send",
          prompt,
          interactionMode: interactionMode ?? null,
          clientSource: normalizeClientSource(clientSource),
          checkpointContext,
          ...(imageKeys?.length ? { imageKeys } : {}),
        },
        {
          lastMessageAt: new Date(),
          ...(actorType === "user" ? { lastUserMessageAt: new Date() } : {}),
        },
        session.pendingRun,
      );
      await this.persistConnectionFailure(
        sessionId,
        session.organizationId,
        deliveryResult,
        "send",
      );
      // Still record the message event so it's not lost
      const event = await eventService.create({
        organizationId: session.organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "message_sent",
        payload: {
          text,
          clientSource: normalizeClientSource(clientSource),
          ...(imageKeys?.length ? { attachmentKeys: imageKeys, imageKeys } : {}),
          deliveryFailed: true,
          ...(clientMutationId ? { clientMutationId } : {}),
        },
        metadata: checkpointMetadata,
        actorType,
        actorId,
      });
      return event;
    }

    // Only mark active after successful delivery
    // Persist the runtime binding so restoreSessionsForRuntime can recover it after restart
    const boundRuntime = sessionRouter.getRuntimeForSession(sessionId);
    const resumedSessionStatus = getRunningSessionStatus(session.sessionStatus);
    const updatedSession = await prisma.session.update({
      where: { id: sessionId },
      data: {
        agentStatus: "active",
        sessionStatus: resumedSessionStatus,
        connection: this.mergeConnection(session.connection, {
          state: "connected",
          lastSeen: new Date().toISOString(),
          autoRetryable: true,
          ...(boundRuntime && {
            runtimeInstanceId: boundRuntime.id,
            runtimeLabel: boundRuntime.label,
          }),
        }),
        pendingRun: Prisma.DbNull,
        lastMessageAt: new Date(),
        ...(actorType === "user" ? { lastUserMessageAt: new Date() } : {}),
      },
      include: SESSION_INCLUDE,
    });
    const sessionGroup = await this.syncGroupWorkspaceState(updatedSession.sessionGroupId, {
      connection: updatedSession.connection as Prisma.InputJsonValue,
      worktreeDeleted: false,
    });

    // Resolve any inbox items for this session (leaving needs_input)
    await inboxService.resolveBySource({
      sourceType: "session",
      sourceId: sessionId,
      orgId: session.organizationId,
      resolution: text.slice(0, 200),
    });

    // Emit a resumed event so all clients see the status change
    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_resumed",
      payload: {
        sessionId,
        agentStatus: "active",
        sessionStatus: resumedSessionStatus,
        clientSource: normalizeClientSource(clientSource),
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType,
      actorId,
    });

    const event = await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "message_sent",
      payload: {
        text,
        clientSource: normalizeClientSource(clientSource),
        ...(imageKeys?.length ? { attachmentKeys: imageKeys, imageKeys } : {}),
        ...(clientMutationId ? { clientMutationId } : {}),
      },
      metadata: checkpointMetadata,
      actorType,
      actorId,
    });

    return event;
  }

  async queueMessage({
    sessionId,
    text,
    imageKeys,
    actorId,
    interactionMode,
    organizationId,
    clientSource,
  }: {
    sessionId: string;
    text: string;
    imageKeys?: string[];
    actorId: string;
    interactionMode?: string;
    organizationId: string;
    clientSource?: string | null;
  }) {
    if (imageKeys?.length) {
      for (const key of imageKeys) {
        if (typeof key !== "string" || !key.startsWith("uploads/") || key.includes("..")) {
          throw new Error("Invalid upload key");
        }
      }
    }

    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { worktreeDeleted: true, organizationId: true },
    });
    if (session.organizationId !== organizationId) {
      throw new Error("Session does not belong to this organization");
    }
    if (session.worktreeDeleted) {
      throw new Error("Cannot queue messages: session worktree has been deleted");
    }
    if (imageKeys?.length) {
      for (const key of imageKeys) {
        const orgSegment = key.split("/")[1];
        if (orgSegment !== session.organizationId) {
          throw new Error("Attachment key does not belong to this organization");
        }
      }
    }

    const orgId = session.organizationId;

    const queuedMessage = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const maxPos = await tx.queuedMessage.aggregate({
        where: { sessionId },
        _max: { position: true },
      });
      const nextPosition = (maxPos._max.position ?? -1) + 1;

      return tx.queuedMessage.create({
        data: {
          sessionId,
          text,
          imageKeys: imageKeys ?? [],
          interactionMode: interactionMode ?? null,
          position: nextPosition,
          createdById: actorId,
          organizationId: orgId,
        },
      });
    });

    await eventService.create({
      organizationId: orgId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "queued_message_added",
      payload: {
        sessionId,
        clientSource: normalizeClientSource(clientSource),
        queuedMessage: {
          id: queuedMessage.id,
          sessionId: queuedMessage.sessionId,
          text: queuedMessage.text,
          attachmentKeys: queuedMessage.imageKeys,
          imageKeys: queuedMessage.imageKeys,
          interactionMode: queuedMessage.interactionMode,
          position: queuedMessage.position,
          createdAt: queuedMessage.createdAt.toISOString(),
        },
      },
      actorType: "user",
      actorId,
    });

    return queuedMessage;
  }

  private queuedMessagePayload(message: {
    id: string;
    sessionId: string;
    text: string;
    imageKeys: string[];
    interactionMode: string | null;
    position: number;
    createdAt: Date;
  }) {
    return {
      id: message.id,
      sessionId: message.sessionId,
      text: message.text,
      attachmentKeys: message.imageKeys,
      imageKeys: message.imageKeys,
      interactionMode: message.interactionMode,
      position: message.position,
      createdAt: message.createdAt.toISOString(),
    };
  }

  async getQueuedMessageSessionId(id: string, organizationId: string): Promise<string> {
    const queuedMessage = await prisma.queuedMessage.findUniqueOrThrow({
      where: { id },
      select: { sessionId: true, organizationId: true },
    });
    if (queuedMessage.organizationId !== organizationId) {
      throw new Error("Queued message does not belong to this organization");
    }
    return queuedMessage.sessionId;
  }

  async removeQueuedMessage(id: string, actorId: string, organizationId: string) {
    const queuedMessage = await prisma.queuedMessage.findUniqueOrThrow({
      where: { id },
      select: { sessionId: true, organizationId: true },
    });
    if (queuedMessage.organizationId !== organizationId) {
      throw new Error("Queued message does not belong to this organization");
    }

    await prisma.queuedMessage.delete({ where: { id } });

    await eventService.create({
      organizationId: queuedMessage.organizationId,
      scopeType: "session",
      scopeId: queuedMessage.sessionId,
      eventType: "queued_message_removed",
      payload: { sessionId: queuedMessage.sessionId, queuedMessageId: id },
      actorType: "user",
      actorId,
    });

    return true;
  }

  async updateQueuedMessage(id: string, text: string, actorId: string, organizationId: string) {
    const queuedMessage = await prisma.queuedMessage.findUniqueOrThrow({
      where: { id },
      select: { sessionId: true, organizationId: true, imageKeys: true },
    });
    if (queuedMessage.organizationId !== organizationId) {
      throw new Error("Queued message does not belong to this organization");
    }
    if (text.trim().length === 0 && queuedMessage.imageKeys.length === 0) {
      throw new Error("Queued message text cannot be empty");
    }

    const { updated, event } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.queuedMessage.update({
        where: { id },
        data: { text },
      });

      const event = await eventService.create(
        {
          organizationId: queuedMessage.organizationId,
          scopeType: "session",
          scopeId: queuedMessage.sessionId,
          eventType: "queued_message_updated",
          payload: {
            sessionId: queuedMessage.sessionId,
            queuedMessage: this.queuedMessagePayload(updated),
          },
          actorType: "user",
          actorId,
          deferPublish: true,
        },
        tx,
      );

      return { updated, event };
    });
    eventService.publishCreated(event);

    return updated;
  }

  async steerQueuedMessage(id: string, actorId: string, organizationId: string) {
    const queuedMessage = await prisma.queuedMessage.findUniqueOrThrow({
      where: { id },
    });
    if (queuedMessage.organizationId !== organizationId) {
      throw new Error("Queued message does not belong to this organization");
    }

    const removedEvent = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.queuedMessage.delete({ where: { id } });
      return eventService.create(
        {
          organizationId: queuedMessage.organizationId,
          scopeType: "session",
          scopeId: queuedMessage.sessionId,
          eventType: "queued_message_removed",
          payload: { sessionId: queuedMessage.sessionId, queuedMessageId: id },
          actorType: "user",
          actorId,
          deferPublish: true,
        },
        tx,
      );
    });
    eventService.publishCreated(removedEvent);

    try {
      return await this.sendMessage({
        sessionId: queuedMessage.sessionId,
        text: queuedMessage.text,
        imageKeys: queuedMessage.imageKeys,
        actorType: "user",
        actorId,
        interactionMode: queuedMessage.interactionMode ?? undefined,
      });
    } catch (error) {
      const restoredEvent = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const restored = await tx.queuedMessage.create({
          data: {
            id: queuedMessage.id,
            sessionId: queuedMessage.sessionId,
            text: queuedMessage.text,
            imageKeys: queuedMessage.imageKeys,
            interactionMode: queuedMessage.interactionMode,
            position: queuedMessage.position,
            createdById: queuedMessage.createdById,
            organizationId: queuedMessage.organizationId,
            createdAt: queuedMessage.createdAt,
          },
        });
        return eventService.create(
          {
            organizationId: queuedMessage.organizationId,
            scopeType: "session",
            scopeId: queuedMessage.sessionId,
            eventType: "queued_message_added",
            payload: {
              sessionId: queuedMessage.sessionId,
              queuedMessage: this.queuedMessagePayload(restored),
            },
            actorType: "user",
            actorId,
            deferPublish: true,
          },
          tx,
        );
      });
      eventService.publishCreated(restoredEvent);
      throw error;
    }
  }

  async clearQueuedMessages(sessionId: string, actorId: string, organizationId: string) {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { organizationId: true },
    });
    if (session.organizationId !== organizationId) {
      throw new Error("Session does not belong to this organization");
    }

    await prisma.queuedMessage.deleteMany({ where: { sessionId } });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "queued_messages_cleared",
      payload: { sessionId },
      actorType: "user",
      actorId,
    });

    return true;
  }

  async reorderQueuedMessages(
    sessionId: string,
    ids: string[],
    actorId: string,
    organizationId: string,
  ) {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { organizationId: true },
    });
    if (session.organizationId !== organizationId) {
      throw new Error("Session does not belong to this organization");
    }

    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      throw new Error("Queued message ids must be unique");
    }

    const { reordered, event } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const queuedMessages = await tx.queuedMessage.findMany({
        where: { sessionId },
        orderBy: { position: "asc" },
      });

      if (queuedMessages.length !== ids.length) {
        throw new Error("Queued message order is stale");
      }

      const queuedIds = new Set(queuedMessages.map((message: { id: string }) => message.id));
      if (ids.some((id) => !queuedIds.has(id))) {
        throw new Error("Queued message order contains unknown messages");
      }

      await Promise.all(
        ids.map((id, position) =>
          tx.queuedMessage.update({
            where: { id },
            data: { position },
          }),
        ),
      );

      const byId = new Map(queuedMessages.map((message) => [message.id, message]));
      const reordered = ids.map((id, position) => ({
        ...byId.get(id)!,
        position,
      }));

      const event = await eventService.create(
        {
          organizationId: session.organizationId,
          scopeType: "session",
          scopeId: sessionId,
          eventType: "queued_messages_reordered",
          payload: {
            sessionId,
            queuedMessages: reordered.map((message) => this.queuedMessagePayload(message)),
          },
          actorType: "user",
          actorId,
          deferPublish: true,
        },
        tx,
      );

      return { reordered, event };
    });

    eventService.publishCreated(event);

    return reordered;
  }

  private async drainNextPendingOrQueuedMessage(sessionId: string) {
    const pending = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { organizationId: true, pendingRun: true },
    });
    if (!pending) return false;

    if (this.parsePendingCommands(pending.pendingRun).length > 0) {
      const replayResult = await this.deliverPendingCommand(sessionId, pending.pendingRun);
      if (replayResult && replayResult !== "delivered") {
        await this.persistConnectionFailure(
          sessionId,
          pending.organizationId,
          replayResult,
          "pending_replay",
        );
        return false;
      }
      return replayResult === "delivered";
    }

    return this.drainOneQueuedMessage(sessionId);
  }

  private async drainOneQueuedMessage(sessionId: string) {
    // Verify the session is in a drainable state before popping
    const current = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { agentStatus: true, sessionStatus: true, organizationId: true },
    });
    if (!current || current.agentStatus === "active" || current.sessionStatus === "needs_input") {
      return false;
    }

    const popped = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const first = await tx.queuedMessage.findFirst({
        where: { sessionId },
        orderBy: { position: "asc" },
      });
      if (!first) return null;
      await tx.queuedMessage.delete({ where: { id: first.id } });
      return first;
    });

    if (!popped) return false;

    try {
      const queuedMessageClientSource = await this.loadQueuedMessageClientSource(
        sessionId,
        popped.id,
      );
      await this.sendMessage({
        sessionId,
        text: popped.text,
        imageKeys: popped.imageKeys,
        actorType: "user",
        actorId: popped.createdById,
        interactionMode: popped.interactionMode ?? undefined,
        clientSource: queuedMessageClientSource,
      });
    } catch (error) {
      // Re-insert the message so it's not lost
      await prisma.queuedMessage.create({
        data: {
          id: popped.id,
          sessionId: popped.sessionId,
          text: popped.text,
          imageKeys: popped.imageKeys,
          interactionMode: popped.interactionMode,
          position: popped.position,
          createdById: popped.createdById,
          organizationId: popped.organizationId,
        },
      });
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[session:${sessionId}] Failed to drain queued message ${popped.id}:`, error);
      await eventService.create({
        organizationId: current.organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "session_output",
        payload: {
          type: "error",
          message: `Failed to send queued message: ${message}`,
        },
        actorType: "system",
        actorId: "system",
      });
      return false;
    }

    await eventService.create({
      organizationId: current.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "queued_messages_drained",
      payload: { sessionId, queuedMessageId: popped.id },
      actorType: "system",
      actorId: "system",
    });

    return true;
  }

  async workspaceReady(
    sessionId: string,
    workdir: string,
    branch?: string,
    slug?: string,
    warning?: BridgeWorkspaceWarning,
  ) {
    // Read and clear pendingRun atomically in a transaction to prevent double-delivery
    const [session, pendingRun] = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const prev = await tx.session.findUniqueOrThrow({
          where: { id: sessionId },
          select: {
            pendingRun: true,
            agentStatus: true,
            sessionStatus: true,
            readOnlyWorkspace: true,
            workdir: true,
          },
        });
        const pendingCommand = this.parsePendingCommands(prev.pendingRun)[0] ?? null;

        const updated = await tx.session.update({
          where: { id: sessionId },
          data: {
            agentStatus: getIdleAgentStatus(prev.agentStatus),
            sessionStatus: getIdleSessionStatus(prev.sessionStatus),
            workdir,
            ...(branch && { branch }),
            pendingRun: Prisma.DbNull,
            // Read-only sessions keep their repo checkout until an explicit
            // workspace upgrade creates a writable worktree.
            readOnlyWorkspace: Boolean(
              prev.readOnlyWorkspace && pendingCommand?.workspaceUpgrade !== true,
            ),
          },
          include: SESSION_INCLUDE,
        });

        return [updated, prev.pendingRun] as const;
      },
    );
    const setupScript = await this.getChannelSetupScript(session.channelId);
    const previousGroupBranch = session.sessionGroup?.branch ?? null;
    const shouldClearPrUrl =
      branch !== undefined &&
      previousGroupBranch !== branch &&
      Boolean(session.sessionGroup?.prUrl);
    // The ready workspace belongs to this session's runtime; only mirror its
    // path to siblings that share that runtime so a cloud path can never land
    // on a local session (or vice versa) and break its cwd.
    const workdirRuntimeInstanceId =
      this.parseConnection(session.connection).runtimeInstanceId ??
      sessionRouter.getRuntimeForSession(sessionId)?.id ??
      null;
    const sessionGroup = await this.syncGroupWorkspaceState(
      session.sessionGroupId,
      {
        workdir,
        connection: session.connection as Prisma.InputJsonValue,
        worktreeDeleted: false,
        repoId: session.repoId ?? null,
        ...(branch !== undefined ? { branch } : {}),
        ...(shouldClearPrUrl ? { prUrl: null } : {}),
        ...(slug !== undefined ? { slug } : {}),
        setupStatus: setupScript ? "running" : "idle",
        setupError: null,
      },
      { workdirRuntimeInstanceId },
    );
    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "workspace_ready",
        workdir,
        agentStatus: session.agentStatus,
        sessionStatus: session.sessionStatus,
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId: "system",
    });

    if (warning) {
      await eventService.create({
        organizationId: session.organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "session_output",
        payload: {
          type: "workspace_restored_from_base",
          branch: warning.branch,
          baseBranch: warning.baseBranch,
          message: warning.message,
        },
        actorType: "system",
        actorId: "system",
      });
    }

    if (setupScript) {
      const runtimeInstanceId =
        this.parseConnection(session.connection).runtimeInstanceId ??
        sessionRouter.getRuntimeForSession(sessionId)?.id ??
        null;
      if (runtimeInstanceId) {
        await this.executeSetupScript({
          sessionId,
          sessionGroupId: session.sessionGroupId ?? null,
          organizationId: session.organizationId,
          runtimeInstanceId,
          workdir,
          setupScript,
        });
      } else {
        console.warn(
          `[session] skipping setup script for ${sessionId}: no bound runtime to run it on`,
        );
      }
    }

    // Dispatch the generated-project dev server before the first agent command.
    // startApplication returns once the process-start command is sent (not when the
    // long-running server exits), so this only adds a small setup delay while
    // ensuring the live starter and HMR are coming up before edits begin.
    if (isGeneratedProjectKind(session.sessionGroup?.kind) && session.sessionGroupId) {
      const generatedProjectGroupId = session.sessionGroupId;
      await sessionApplicationService
        .startApplication(
          generatedProjectGroupId,
          "app",
          session.organizationId,
          session.createdById,
          {
            asSystem: true,
          },
        )
        .catch(async (error: unknown) => {
          await eventService.create({
            organizationId: session.organizationId,
            scopeType: "session",
            scopeId: sessionId,
            eventType: "session_output",
            payload: {
              type: "app_preview_start_failed",
              sessionGroupId: generatedProjectGroupId,
              error: error instanceof Error ? error.message : String(error),
            } as Prisma.InputJsonValue,
            actorType: "system",
            actorId: "system",
          });
        });
    }

    // Deliver the queued prompt after preview startup has been dispatched. The
    // process and agent then run concurrently, with the warmed dependency cache
    // making the starter visible early enough to watch incremental edits.
    if (pendingRun) {
      const replayResult = await this.deliverPendingCommand(sessionId, pendingRun);
      if (replayResult && replayResult !== "delivered") {
        const commands = this.parsePendingCommands(pendingRun);
        await prisma.session.update({
          where: { id: sessionId },
          data: { pendingRun: pendingRunValue(commands) },
        });
        await this.persistConnectionFailure(
          sessionId,
          session.organizationId,
          replayResult,
          "workspace_replay",
        );
      }
    }
  }

  async workspaceFailed(sessionId: string, error: string) {
    const prev = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { connection: true },
    });
    const conn = this.parseConnection(prev.connection);
    const now = new Date().toISOString();
    const failedState: SessionConnectionData["state"] =
      conn.state === "timed_out" ? "timed_out" : "failed";
    const nextConnection = connJson({
      ...conn,
      state: failedState,
      lastError: error,
      canRetry: true,
      canMove: true,
      autoRetryable: false,
      ...(failedState === "failed" ? { failedAt: conn.failedAt ?? now } : {}),
      ...(failedState === "timed_out" ? { timedOutAt: conn.timedOutAt ?? now } : {}),
    });

    const session = await prisma.session.update({
      where: { id: sessionId },
      data: {
        agentStatus: "done",
        worktreeDeleted: false,
        connection: nextConnection,
      },
      include: SESSION_INCLUDE,
    });
    const sessionGroup = await this.syncGroupWorkspaceState(session.sessionGroupId, {
      connection: session.connection as Prisma.InputJsonValue,
      worktreeDeleted: false,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "workspace_failed",
        sessionId,
        error,
        agentStatus: session.agentStatus,
        sessionStatus: session.sessionStatus,
        connection: nextConnection,
        worktreeDeleted: false,
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId: "system",
    });
  }

  async retrySessionGroupSetup(
    sessionGroupId: string,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    const group = await prisma.sessionGroup.findFirst({
      where: { id: sessionGroupId, organizationId },
      select: {
        id: true,
        workdir: true,
        worktreeDeleted: true,
        setupStatus: true,
        connection: true,
        channel: { select: { setupScript: true } },
        sessions: {
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            hosting: true,
            connection: true,
          },
        },
      },
    });
    if (!group) throw new Error("Session group not found");
    if (group.setupStatus === "running") {
      throw new Error("Setup script is already running");
    }
    const setupScript = group.channel?.setupScript?.trim();
    if (!setupScript) {
      throw new Error("No setup script configured for this session group");
    }
    if (group.worktreeDeleted || !group.workdir) {
      throw new Error("Cannot retry setup without an active workspace");
    }
    const targetSession = group.sessions[0];
    if (!targetSession) {
      throw new Error("Cannot retry setup without a session");
    }

    const runtimeInstanceId =
      this.getConnectionRuntimeInstanceId(group.connection) ??
      this.getConnectionRuntimeInstanceId(targetSession.connection);
    await this.assertRuntimeAccess({
      userId: actorId,
      organizationId,
      runtimeInstanceId,
      sessionGroupId,
    });
    if (!runtimeInstanceId) {
      throw new Error("Cannot retry setup: session has no bound runtime");
    }

    const runningGroup = await this.syncGroupWorkspaceState(sessionGroupId, {
      setupStatus: "running",
      setupError: null,
    });
    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: targetSession.id,
      eventType: "session_output",
      payload: {
        type: "setup_script_started",
        ...(runningGroup ? { sessionGroup: runningGroup } : {}),
      },
      actorType,
      actorId,
    });

    await this.executeSetupScript({
      sessionId: targetSession.id,
      sessionGroupId,
      organizationId,
      runtimeInstanceId,
      workdir: group.workdir,
      setupScript,
    });

    const updatedGroup = await this.loadSessionGroupSnapshot(sessionGroupId);
    if (!updatedGroup) {
      throw new Error("Session group not found after retrying setup");
    }
    return updatedGroup;
  }

  // ─── Connection Management ───

  async markConnectionLost(sessionId: string, reason: string, runtimeInstanceId?: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        organizationId: true,
        agentStatus: true,
        sessionStatus: true,
        worktreeDeleted: true,
        hosting: true,
        connection: true,
        sessionGroupId: true,
      },
    });
    if (!session) return;

    // Fully unloaded sessions are excluded from reconnect/disconnect handling.
    if (isFullyUnloadedSession(session.agentStatus, session.sessionStatus, session.worktreeDeleted))
      return;

    const conn = this.parseConnection(session.connection);
    const updated: SessionConnectionData = {
      ...conn,
      state: "disconnected",
      lastError: reason,
      runtimeInstanceId: runtimeInstanceId ?? conn.runtimeInstanceId,
      canRetry: true,
      canMove: true,
      autoRetryable: session.hosting !== "cloud",
    };
    const sameRuntime = runtimeInstanceId ? conn.runtimeInstanceId === runtimeInstanceId : true;
    if (
      session.hosting === "cloud" &&
      session.agentStatus === "done" &&
      conn.state === "disconnected" &&
      conn.lastError === reason &&
      sameRuntime
    ) {
      return;
    }

    // Preserve agent/session status — the session may still be running on the
    // local machine even though the bridge WebSocket dropped. Only the
    // connection state changes; the agent's actual work status is unknown.
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        connection: connJson(updated),
      },
    });
    const sessionGroup = await this.syncGroupWorkspaceState(session.sessionGroupId, {
      connection: connJson(updated),
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "connection_lost",
        reason,
        runtimeInstanceId,
        connection: connJson(updated),
        agentStatus: session.agentStatus,
        sessionStatus: session.sessionStatus,
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId: "system",
    });
  }

  async markConnectionRestored(sessionId: string, runtimeInstanceId: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        organizationId: true,
        agentStatus: true,
        sessionStatus: true,
        connection: true,
        sessionGroupId: true,
      },
    });
    if (!session) return;

    const conn = this.parseConnection(session.connection);
    const updated: SessionConnectionData = {
      ...conn,
      state: "connected",
      runtimeInstanceId,
      runtimeLabel:
        sessionRouter.getRuntime(runtimeInstanceId, session.organizationId)?.label ??
        conn.runtimeLabel,
      lastSeen: new Date().toISOString(),
      lastError: undefined,
      canRetry: true,
      canMove: true,
      autoRetryable: true,
    };

    // Preserve agent/session status — only update connection state.
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        connection: connJson(updated),
      },
    });
    const sessionGroup = await this.syncGroupWorkspaceState(session.sessionGroupId, {
      connection: connJson(updated),
      worktreeDeleted: false,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "connection_restored",
        runtimeInstanceId,
        connection: connJson(updated),
        agentStatus: session.agentStatus,
        sessionStatus: session.sessionStatus,
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId: "system",
    });
    if (session.sessionGroupId) {
      void managedGitService.retryPendingDesignCommitPreviews(session.sessionGroupId).catch(
        (error: unknown) => {
          console.error("[session] design preview retry after runtime reconnect failed", error);
        },
      );
      void managedGitService.retryPdfCommitExport(session.sessionGroupId).catch(
        (error: unknown) => {
          console.error("[session] PDF export retry after runtime reconnect failed", error);
        },
      );
    }
  }

  /**
   * When a runtime connects, restore all sessions it previously owned except fully unloaded ones.
   * The DB (connection.runtimeInstanceId) is the single source of truth for ownership.
   * Excludes fully unloaded statuses (failed, merged).
   */
  async restoreSessionsForRuntime(runtimeId: string, organizationId?: string | null) {
    const runtime = sessionRouter.getRuntime(runtimeId, organizationId);
    if (!runtime) return;
    runtimeDebug("restoreSessionsForRuntime begin", {
      runtimeId,
      organizationId: organizationId ?? null,
      runtimeLabel: runtime.label,
    });

    const sessions = await prisma.session.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        agentStatus: { notIn: [...FULLY_UNLOADED_AGENT_STATUSES] },
        sessionStatus: { not: "merged" },
        connection: { path: ["runtimeInstanceId"], equals: runtimeId },
      },
      select: {
        id: true,
        agentStatus: true,
        connection: true,
        organizationId: true,
        workdir: true,
        readOnlyWorkspace: true,
        sessionGroupId: true,
      },
    });

    runtimeDebug("restoreSessionsForRuntime loaded sessions", {
      runtimeId,
      organizationId: organizationId ?? null,
      sessionIds: sessions.map((session: { id: string }) => session.id),
    });

    for (const session of sessions) {
      sessionRouter.bindSession(session.id, runtime.key);

      if (runtime.hostingMode === "local" && session.workdir) {
        sessionRouter.sendToRuntime(
          runtime.id,
          {
            type: "track_session",
            sessionId: session.id,
            workdir: session.workdir,
            readOnly: session.readOnlyWorkspace,
            sessionGroupId: session.sessionGroupId,
          },
          session.organizationId,
        );
      }

      // Emit connection_restored for sessions that were disconnected or whose
      // provision wait timed out before this (now-connected) runtime's bridge
      // arrived — but not for sessions already done, which don't need event
      // churn. Healing `timed_out` here is what lets a slow-booting runtime
      // reclaim its session after the 300s startup window elapsed.
      const conn = this.parseConnection(session.connection);
      if (
        (conn.state === "disconnected" || conn.state === "timed_out") &&
        session.agentStatus !== "done"
      ) {
        await this.markConnectionRestored(session.id, runtimeId);
      }
    }
  }

  async storeToolSessionId(sessionId: string, toolSessionId: string) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { toolSessionId },
    });
  }

  async recoverMissingToolSession(
    sessionId: string,
    options: {
      toolSessionId: string;
      message?: string;
      interactionMode?: string;
      checkpointContext?: GitCheckpointContext | null;
      imageUrls?: string[];
    },
  ) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        organizationId: true,
        agentStatus: true,
        sessionStatus: true,
        worktreeDeleted: true,
        tool: true,
        model: true,
        reasoningEffort: true,
        createdBy: { select: { enableClaudeInChrome: true } },
        workdir: true,
        toolSessionId: true,
        repoId: true,
        sessionGroupId: true,
        sessionGroup: { select: { kind: true } },
        connection: true,
      },
    });
    if (!session) return;
    if (session.toolSessionId !== options.toolSessionId) return;
    if (isFullyUnloadedSession(session.agentStatus, session.sessionStatus, session.worktreeDeleted))
      return;

    const context = await buildConversationContext(sessionId);
    let prompt = buildToolSessionRecoveryPrompt(context);
    prompt = appendPromptInstructions(prompt, {
      hasRepo: !!session.repoId,
      sessionGroupKind: session.sessionGroup?.kind,
    });

    const promptEvent = await prisma.event.findFirst({
      where: {
        scopeId: sessionId,
        scopeType: "session",
        eventType: { in: ["message_sent", "session_started"] },
      },
      orderBy: { timestamp: "desc" },
      select: { id: true },
    });
    const checkpointContext =
      options.checkpointContext ??
      (session.repoId && session.sessionGroupId
        ? createCheckpointContext({
            checkpointContextId: randomUUID(),
            promptEventId: promptEvent?.id ?? null,
            sessionId,
            sessionGroupId: session.sessionGroupId,
            repoId: session.repoId,
          })
        : null);
    const conn = this.parseConnection(session.connection);

    await prisma.session.update({
      where: { id: sessionId },
      data: { toolSessionId: null },
    });

    const deliveryResult = sessionRouter.send(
      sessionId,
      {
        type: "send",
        sessionId,
        prompt,
        appendSystemPrompt: generatedProjectInstruction(session.sessionGroup?.kind),
        tool: session.tool,
        model: session.model ?? undefined,
        reasoningEffort: session.reasoningEffort ?? undefined,
        enableClaudeInChrome: this.claudeInChromeFlag(session.tool, session.createdBy),
        interactionMode: options.interactionMode,
        cwd: session.workdir ?? undefined,
        checkpointContext,
        imageUrls: options.imageUrls,
      },
      { expectedHomeRuntimeId: conn.runtimeInstanceId, organizationId: session.organizationId },
    );

    if (deliveryResult !== "delivered") {
      await this.persistConnectionFailure(
        sessionId,
        session.organizationId,
        deliveryResult,
        "tool_session_recovery",
      );
      await eventService.create({
        organizationId: session.organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "session_output",
        payload: {
          type: "recovery_failed",
          reason: "tool_session_missing",
          message: options.message ?? "Local tool session was unavailable",
        },
        actorType: "system",
        actorId: "system",
      });
      return;
    }

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "tool_session_recovered",
        oldToolSessionId: options.toolSessionId,
      },
      actorType: "system",
      actorId: "system",
    });
  }

  async recordGitCheckpoint(sessionId: string, checkpoint: GitCheckpointBridgePayload) {
    if (Number.isNaN(new Date(checkpoint.committedAt).getTime())) {
      console.warn(
        `[checkpoint] invalid committedAt for session ${sessionId}: ${checkpoint.committedAt}`,
      );
      return;
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        organizationId: true,
        sessionGroupId: true,
        repoId: true,
        sessionGroup: { select: { kind: true, ownerUserId: true } },
      },
    });
    if (!session?.sessionGroupId || !session.repoId) return;

    const existing = await prisma.gitCheckpoint.findUnique({
      where: {
        sessionGroupId_commitSha: {
          sessionGroupId: session.sessionGroupId,
          commitSha: checkpoint.commitSha,
        },
      },
    });
    const rewrittenCommitSha =
      typeof checkpoint.rewrittenFromCommitSha === "string"
        ? checkpoint.rewrittenFromCommitSha.trim()
        : "";
    const rewrittenCheckpoint =
      rewrittenCommitSha && rewrittenCommitSha !== checkpoint.commitSha
        ? await prisma.gitCheckpoint.findUnique({
            where: {
              sessionGroupId_commitSha: {
                sessionGroupId: session.sessionGroupId,
                commitSha: rewrittenCommitSha,
              },
            },
          })
        : null;

    let persisted = existing;
    let didPersistCheckpoint = false;

    if (!persisted) {
      const promptEventId = await this.resolvePromptEventIdForCheckpoint(sessionId, checkpoint);
      if (!promptEventId) return null;

      if (rewrittenCheckpoint) {
        persisted = await prisma.gitCheckpoint.update({
          where: { id: rewrittenCheckpoint.id },
          data: {
            sessionId,
            promptEventId,
            commitSha: checkpoint.commitSha,
            parentShas: checkpoint.parentShas,
            treeSha: checkpoint.treeSha,
            subject: checkpoint.subject,
            author: checkpoint.author,
            committedAt: new Date(checkpoint.committedAt),
            filesChanged: checkpoint.filesChanged,
          },
        });
      } else {
        persisted = await prisma.gitCheckpoint.create({
          data: {
            sessionId,
            sessionGroupId: session.sessionGroupId,
            repoId: session.repoId,
            promptEventId,
            commitSha: checkpoint.commitSha,
            parentShas: checkpoint.parentShas,
            treeSha: checkpoint.treeSha,
            subject: checkpoint.subject,
            author: checkpoint.author,
            committedAt: new Date(checkpoint.committedAt),
            filesChanged: checkpoint.filesChanged,
          },
        });
      }

      didPersistCheckpoint = true;
    }

    if (!persisted) return null;

    // App checkpoints get a preview screenshot, but the headless render must not
    // block the per-session event queue (it would freeze the agent's live output
    // for seconds per commit). Mark it pending, emit the checkpoint now, and run
    // the capture off-queue — a follow-up git_checkpoint event (merged by id on
    // the client) carries the thumbnail once it's ready.
    const shouldCaptureAppCheckpoint = didPersistCheckpoint && session.sessionGroup?.kind === "app";
    const shouldPublishDesignPreview =
      didPersistCheckpoint && session.sessionGroup?.kind === "design";
    if (shouldCaptureAppCheckpoint && persisted) {
      persisted = await prisma.gitCheckpoint.update({
        where: { id: persisted.id },
        data: { captureStatus: "pending" },
      });
    }
    if (shouldPublishDesignPreview && persisted) {
      persisted = await prisma.gitCheckpoint.update({
        where: { id: persisted.id },
        data: { previewStatus: "pending" },
      });
    }

    if (didPersistCheckpoint) {
      await eventService.create({
        organizationId: session.organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "session_output",
        payload: {
          type: "git_checkpoint",
          checkpoint: serializeGitCheckpoint(persisted),
        } as Prisma.InputJsonValue,
        actorType: "system",
        actorId: "system",
      });
    }

    if (rewrittenCheckpoint && rewrittenCheckpoint.id !== persisted.id) {
      await prisma.gitCheckpoint.delete({
        where: { id: rewrittenCheckpoint.id },
      });

      await eventService.create({
        organizationId: session.organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "session_output",
        payload: {
          type: "git_checkpoint_rewrite",
          replacedCommitSha: rewrittenCheckpoint.commitSha,
          replacedCheckpointId: rewrittenCheckpoint.id,
          checkpoint: serializeGitCheckpoint(persisted),
        } as Prisma.InputJsonValue,
        actorType: "system",
        actorId: "system",
      });
    }

    if (shouldCaptureAppCheckpoint && persisted && session.sessionGroup) {
      this.captureAppCheckpointAsync({
        checkpointId: persisted.id,
        sessionId,
        organizationId: session.organizationId,
        sessionGroupId: session.sessionGroupId,
        userId: session.sessionGroup.ownerUserId,
      });
    }
    if (shouldPublishDesignPreview && persisted && session.sessionGroup) {
      this.publishDesignCheckpointPreviewAsync({
        checkpointId: persisted.id,
        sessionId,
        organizationId: session.organizationId,
        sessionGroupId: session.sessionGroupId,
        commitSha: persisted.commitSha,
        userId: session.sessionGroup.ownerUserId,
      });
    }

    return persisted;
  }

  /**
   * Render and store an app checkpoint preview off the per-session event queue,
   * then emit a follow-up git_checkpoint event carrying the captured thumbnail
   * (the client merges checkpoints by id). Fire-and-forget: capture latency must
   * never block the live agent output stream.
   */
  private captureAppCheckpointAsync(input: {
    checkpointId: string;
    sessionId: string;
    organizationId: string;
    sessionGroupId: string;
    userId: string;
  }): void {
    void (async () => {
      try {
        const capture = await appCheckpointCaptureService.capture({
          organizationId: input.organizationId,
          sessionGroupId: input.sessionGroupId,
          checkpointId: input.checkpointId,
          userId: input.userId,
        });
        const updated = await prisma.gitCheckpoint.update({
          where: { id: input.checkpointId },
          data: {
            captureStatus: capture.captureStatus,
            captureKey: capture.captureKey ?? null,
            captureUrl: capture.captureUrl ?? null,
            captureContentType: capture.captureContentType ?? null,
            capturedAt: capture.capturedAt ?? null,
          },
        });
        await eventService.create({
          organizationId: input.organizationId,
          scopeType: "session",
          scopeId: input.sessionId,
          eventType: "session_output",
          payload: {
            type: "git_checkpoint",
            checkpoint: serializeGitCheckpoint(updated),
          } as Prisma.InputJsonValue,
          actorType: "system",
          actorId: "system",
        });
      } catch (error) {
        // A missing row (checkpoint rewritten away) or capture failure is
        // non-fatal — the checkpoint simply keeps its pending/last status.
        console.error("[app-checkpoint] async capture failed", error);
      }
    })();
  }

  private publishDesignCheckpointPreviewAsync(input: {
    checkpointId: string;
    sessionId: string;
    organizationId: string;
    sessionGroupId: string;
    commitSha: string;
    userId: string;
  }): void {
    void (async () => {
      try {
        const preview = await designCheckpointPreviewService.publish(input);
        const updated = await prisma.gitCheckpoint.update({
          where: { id: input.checkpointId },
          data: {
            previewStatus: preview.previewStatus,
            previewKey: preview.previewKey ?? null,
            previewUrl: preview.previewUrl ?? null,
            previewContentType: preview.previewContentType ?? null,
            previewCapturedAt: preview.previewCapturedAt ?? null,
          },
        });
        await eventService.create({
          organizationId: input.organizationId,
          scopeType: "session",
          scopeId: input.sessionId,
          eventType: "session_output",
          payload: {
            type: "git_checkpoint",
            checkpoint: serializeGitCheckpoint(updated),
          } as Prisma.InputJsonValue,
          actorType: "system",
          actorId: "system",
        });
      } catch (error) {
        console.error("[design-checkpoint] async preview publish failed", error);
      }
    })();
  }

  async retryConnection(
    sessionId: string,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    const session = await prisma.session.findFirstOrThrow({
      where: { id: sessionId, organizationId },
      include: { ...SESSION_INCLUDE, projects: true },
    });

    const conn = this.parseConnection(session.connection);

    if (
      isFullyUnloadedSession(session.agentStatus, session.sessionStatus, session.worktreeDeleted)
    ) {
      const retryableFailedSession =
        session.agentStatus === "failed" &&
        session.sessionStatus !== "merged" &&
        session.worktreeDeleted === false &&
        conn.canRetry === true &&
        (conn.state === "failed" || conn.state === "timed_out" || conn.state === "disconnected");
      if (!retryableFailedSession) return session;
    }

    assertCloudRepoRemoteAvailable(session.hosting, session.repo);

    // Emit retry requested event
    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: { type: "recovery_requested", retryCount: conn.retryCount + 1 },
      actorType,
      actorId,
    });

    // Retry only reconnects to the session's original home bridge. If the
    // home bridge isn't currently available, retry fails — the user must
    // explicitly Move to continue on a different bridge. This avoids silent
    // handoff to an arbitrary connected runtime.
    const homeRuntimeId = conn.runtimeInstanceId;
    if (session.hosting === "local" && homeRuntimeId) {
      await this.assertRuntimeAccess({
        userId: actorId,
        organizationId,
        runtimeInstanceId: homeRuntimeId,
        sessionGroupId: session.sessionGroupId,
      });
    }
    if (
      session.hosting === "cloud" &&
      (!homeRuntimeId || !sessionRouter.isRuntimeAvailable(homeRuntimeId, organizationId))
    ) {
      return this.moveSessionInPlace({
        session,
        targetHosting: "cloud",
        targetRuntimeInstanceId: null,
        targetRuntimeLabel: null,
        allowUnverifiedSourceGitStatus: true,
        actorType,
        actorId,
      });
    }

    const runtime = homeRuntimeId
      ? sessionRouter.isRuntimeAvailable(homeRuntimeId, organizationId)
        ? sessionRouter.getRuntime(homeRuntimeId, organizationId)
        : undefined
      : session.hosting === "local"
        ? await this.resolveDefaultAccessibleLocalRuntime({
            userId: actorId,
            organizationId,
            tool: session.tool,
            repoId: session.repoId,
            sessionGroupId: session.sessionGroupId,
          })
        : // Cloud session without a persisted home: do NOT fall back to
          // getDefaultRuntime — the runtime map is a single cross-tenant
          // namespace, so "first connected runtime" can mean another user's
          // bridge. The user must re-provision via Move instead.
          undefined;

    if (!runtime) {
      const failureReason = homeRuntimeId ? "home_runtime_offline" : "no_runtime";
      const failureMessage = homeRuntimeId
        ? conn.runtimeLabel
          ? `${conn.runtimeLabel} is offline — use Move to continue on another bridge`
          : "The original bridge is offline — use Move to continue on another bridge"
        : "No runtime available";
      const failedConn: SessionConnectionData = {
        ...conn,
        state: "disconnected",
        retryCount: conn.retryCount + 1,
        lastError: failureMessage,
        lastDeliveryFailureAt: new Date().toISOString(),
        canRetry: true,
        canMove: true,
        // home_runtime_offline is non-transient — stop the auto-retry loop.
        // The user must either bring the home bridge back online or Move.
        autoRetryable: failureReason !== "home_runtime_offline",
      };
      await prisma.session.update({
        where: { id: sessionId },
        data: { connection: connJson(failedConn) },
      });
      const sessionGroup = await this.syncGroupWorkspaceState(session.sessionGroupId, {
        connection: connJson(failedConn),
      });

      await eventService.create({
        organizationId: session.organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "session_output",
        payload: {
          type: "recovery_failed",
          reason: failureReason,
          connection: connJson(failedConn),
          ...(sessionGroup ? { sessionGroup } : {}),
        },
        actorType: "system",
        actorId: "system",
      });

      return prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
        include: SESSION_INCLUDE,
      });
    }

    // Bind and attempt workspace setup if needed
    sessionRouter.bindSession(sessionId, runtime.key);

    if (session.repo) {
      const startMeta = await getSessionStartMetadata(sessionId);
      const restoredConn: SessionConnectionData = {
        ...conn,
        state: "connected",
        runtimeInstanceId: runtime.id,
        runtimeLabel: runtime.label,
        lastSeen: new Date().toISOString(),
        lastError: undefined,
        retryCount: 0,
        autoRetryable: true,
      };
      const isGeneratedProject = isGeneratedProjectKind(session.sessionGroup?.kind);

      // Managed-git credentials are bound to a connected runtime. A retry used
      // to send a regular `prepare` command with the unauthenticated remote,
      // so app/design workspaces got a 403 after their container restarted.
      // Record the replacement runtime before minting its credential, then use
      // the generated-project preparation path that refreshes origin.
      if (isGeneratedProject) {
        await prisma.session.update({
          where: { id: sessionId },
          data: { connection: connJson(restoredConn) },
        });
        await this.syncGroupWorkspaceState(session.sessionGroupId, {
          connection: connJson(restoredConn),
        });
      }
      const retryPreparation = isGeneratedProject
        ? {
            type: "prepare_app" as const,
            sessionId,
            sessionGroupId: session.sessionGroupId ?? undefined,
            sessionGroupKind: session.sessionGroup?.kind,
            slug: session.sessionGroup?.slug ?? undefined,
            checkpointSha: startMeta.restoreCheckpointSha ?? undefined,
            ...(await this.createGeneratedProjectGitCredential({
              organizationId: session.organizationId,
              sessionId,
              runtimeInstanceId: runtime.id,
              repo: session.repo,
              actorType,
              actorId,
            })),
          }
        : {
            type: "prepare" as const,
            sessionId,
            sessionGroupId: session.sessionGroupId ?? undefined,
            slug: session.sessionGroup?.slug ?? undefined,
            preserveBranchName: shouldPreserveWorkspaceBranchName({
              slug: session.sessionGroup?.slug,
              branch: session.branch,
              channelBaseBranch: session.channel?.baseBranch,
            }),
            repoId: session.repo.id,
            repoName: session.repo.name,
            repoRemoteUrl: session.repo.remoteUrl,
            defaultBranch: session.repo.defaultBranch,
            branch: session.branch ?? undefined,
            checkpointSha: startMeta.restoreCheckpointSha ?? undefined,
            readOnly: session.readOnlyWorkspace,
          };
      // Re-run workspace preparation — pin delivery to the runtime we just
      // resolved (the home bridge) so no other bridge can intercept.
      const prepResult = sessionRouter.send(
        sessionId,
        retryPreparation,
        { expectedHomeRuntimeId: runtime.id, organizationId: session.organizationId },
      );

      if (prepResult !== "delivered") {
        await this.persistConnectionFailure(
          sessionId,
          session.organizationId,
          prepResult,
          "retry_prepare",
        );
        return prisma.session.findUniqueOrThrow({
          where: { id: sessionId },
          include: SESSION_INCLUDE,
        });
      }

      // Restore the connection while leaving the session in its prior idle state.
      // Preserve agent/session status unless it was previously marked terminal by a retryable failure.
      const updateData: Prisma.SessionUpdateInput = {
        connection: connJson(restoredConn),
        ...(session.agentStatus === "failed" ? { agentStatus: "done" } : {}),
      };
      const updated = await prisma.session.update({
        where: { id: sessionId },
        data: updateData,
        include: SESSION_INCLUDE,
      });
      const sessionGroup = await this.syncGroupWorkspaceState(updated.sessionGroupId, {
        connection: connJson(restoredConn),
        worktreeDeleted: false,
      });

      await eventService.create({
        organizationId: session.organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "session_output",
        payload: {
          type: "connection_restored",
          runtimeInstanceId: runtime.id,
          connection: connJson(restoredConn),
          agentStatus: updated.agentStatus,
          sessionStatus: updated.sessionStatus,
          ...(sessionGroup ? { sessionGroup } : {}),
        },
        actorType: "system",
        actorId: "system",
      });

      return updated;
    }

    // No repo — just restore connection
    const restoredConn: SessionConnectionData = {
      ...conn,
      state: "connected",
      runtimeInstanceId: runtime.id,
      runtimeLabel: runtime.label,
      lastSeen: new Date().toISOString(),
      lastError: undefined,
      retryCount: 0,
    };

    // Preserve agent/session status unless it was previously marked terminal by a retryable failure.
    const updateData: Prisma.SessionUpdateInput = {
      connection: connJson(restoredConn),
      ...(session.agentStatus === "failed" ? { agentStatus: "done" } : {}),
    };
    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: updateData,
      include: SESSION_INCLUDE,
    });
    const sessionGroup = await this.syncGroupWorkspaceState(updated.sessionGroupId, {
      connection: connJson(restoredConn),
      worktreeDeleted: false,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "connection_restored",
        runtimeInstanceId: runtime.id,
        connection: connJson(restoredConn),
        agentStatus: updated.agentStatus,
        sessionStatus: updated.sessionStatus,
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId: "system",
    });

    const pending = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { pendingRun: true },
    });
    if (pending?.pendingRun) {
      const replayResult = await this.deliverPendingCommand(sessionId, pending.pendingRun);
      if (replayResult && replayResult !== "delivered") {
        await this.persistConnectionFailure(
          sessionId,
          session.organizationId,
          replayResult,
          "retry_replay",
        );
      }
      return prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
        include: SESSION_INCLUDE,
      });
    }

    return updated;
  }

  private async completeRehomedSourceSession(params: {
    sessionId: string;
    hosting: "cloud" | "local";
    organizationId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const { sessionId, hosting, organizationId, actorType, actorId } = params;

    terminalRelay.destroyAllForSession(sessionId);

    try {
      await sessionRouter.transitionRuntime(sessionId, hosting, "terminate");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[session-service] failed to terminate rehomed session ${sessionId}: ${message}`,
      );
    }

    sessionRouter.unbindSession(sessionId);

    const prev = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { sessionStatus: true },
    });
    const clearedSessionStatus =
      prev?.sessionStatus === "needs_input" ? getIdleSessionStatus(prev.sessionStatus) : undefined;

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: {
        agentStatus: "stopped",
        ...(clearedSessionStatus ? { sessionStatus: clearedSessionStatus } : {}),
      },
      select: { sessionStatus: true, sessionGroupId: true },
    });
    const sessionGroup = await this.loadSessionGroupSnapshot(updated.sessionGroupId);

    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_terminated",
      payload: {
        sessionId,
        agentStatus: "stopped",
        sessionStatus: updated.sessionStatus,
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType,
      actorId,
    });
  }

  private async inspectSessionMoveSource(params: {
    sessionId: string;
    repoId?: string | null;
    workdir?: string | null;
    runtimeInstanceId?: string | null;
    allowUnverifiedSourceGitStatus?: boolean;
  }): Promise<{
    status: BridgeSessionGitSyncStatus | null;
    verified: boolean;
    skippedReason: string | null;
  }> {
    if (!params.repoId) return { status: null, verified: true, skippedReason: null };
    if (!params.workdir) {
      if (!params.allowUnverifiedSourceGitStatus) {
        throw new Error(
          "Cannot move session: source git status could not be verified because the source workdir is unavailable.",
        );
      }
      return { status: null, verified: false, skippedReason: "missing_workdir" };
    }
    if (!params.runtimeInstanceId) {
      if (!params.allowUnverifiedSourceGitStatus) {
        throw new Error(
          "Cannot move session: source git status could not be verified because the source runtime is unavailable.",
        );
      }
      return { status: null, verified: false, skippedReason: "source_runtime_unavailable" };
    }

    let status: BridgeSessionGitSyncStatus;
    try {
      status = await sessionRouter.inspectSessionGitSyncStatus(
        params.runtimeInstanceId,
        {
          sessionId: params.sessionId,
          workdirHint: params.workdir,
        },
        SESSION_MOVE_GIT_SYNC_STATUS_TIMEOUT_MS,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!params.allowUnverifiedSourceGitStatus) {
        throw new Error(`Cannot move session: source git status could not be verified. ${message}`);
      }
      console.warn(
        `[session-service] skipping move source git sync check for ${params.sessionId}: ${message}`,
      );
      return { status: null, verified: false, skippedReason: "inspection_failed" };
    }

    if (status.hasUncommittedChanges) {
      throw new Error(
        "Cannot move session: commit, stash, or discard local changes before moving.",
      );
    }

    if (!status.branch) {
      if (!status.headCommitSha) {
        throw new Error("Cannot move session: unable to resolve the current detached commit.");
      }
      return { status, verified: true, skippedReason: null };
    }

    if (status.remoteBranch && status.remoteCommitSha) {
      if (status.remoteAheadCount > 0 || status.remoteBehindCount > 0) {
        throw new Error(
          "Cannot move session: local branch must match its remote branch before moving.",
        );
      }
      return { status, verified: true, skippedReason: null };
    }

    if (!status.upstreamBranch || !status.upstreamCommitSha) {
      throw new Error(
        "Cannot move session: push this branch to origin before moving to another bridge.",
      );
    }

    if (status.aheadCount > 0 || status.behindCount > 0) {
      throw new Error("Cannot move session: local branch must match its upstream before moving.");
    }

    return { status, verified: true, skippedReason: null };
  }

  private async moveSessionInPlace(params: {
    session: Awaited<ReturnType<typeof prisma.session.findFirstOrThrow>> & {
      repo?: { remoteUrl: string | null } | null;
    };
    targetHosting: "cloud" | "local";
    targetRuntimeInstanceId?: string | null;
    targetRuntimeLabel?: string | null;
    targetRuntime?: RuntimeInstance | null;
    allowUnverifiedSourceGitStatus?: boolean;
    actorType: ActorType;
    actorId: string;
  }) {
    const {
      session,
      targetHosting,
      targetRuntimeInstanceId,
      targetRuntimeLabel,
      targetRuntime,
      allowUnverifiedSourceGitStatus,
      actorType,
      actorId,
    } = params;
    const currentSessionGroup = (
      session as {
        sessionGroup?: { visibility: string; ownerUserId: string } | null;
      }
    ).sessionGroup;
    await this.assertPrivateRuntimeOwner({
      visibility: currentSessionGroup?.visibility,
      ownerUserId: currentSessionGroup?.ownerUserId,
      organizationId: session.organizationId,
      hosting: targetHosting,
      runtimeInstanceId: targetRuntimeInstanceId,
    });
    const sourceRuntimeId =
      this.getConnectionRuntimeInstanceId(session.connection) ??
      sessionRouter.getRuntimeForSession(session.id)?.id ??
      null;
    const inspectableSourceRuntimeId =
      sourceRuntimeId && sessionRouter.isRuntimeAvailable(sourceRuntimeId, session.organizationId)
        ? sourceRuntimeId
        : null;
    const targetEnvironment =
      targetHosting === "cloud"
        ? await this.resolveProvisioningEnvironment({
            sessionId: session.id,
            organizationId: session.organizationId,
            adapterType: "provisioned",
          })
        : null;
    if (targetHosting === "cloud" && !targetEnvironment) {
      throw new Error("No enabled cloud agent environment is configured");
    }
    assertCloudRepoRemoteAvailable(targetHosting, session.repo);
    let sourceCloudRuntimeSession =
      session.hosting === "cloud" && targetHosting === "local"
        ? await this.withGroupRuntimeState(session)
        : null;
    if (sourceCloudRuntimeSession) {
      const runtimeConnection = this.parseConnection(sourceCloudRuntimeSession.connection);
      const sessionConnection = this.parseConnection(session.connection);
      const runtimeHasBinding =
        !!runtimeConnection.runtimeInstanceId || !!runtimeConnection.providerRuntimeId;
      const sessionHasBinding =
        !!sessionConnection.runtimeInstanceId || !!sessionConnection.providerRuntimeId;
      if (!runtimeHasBinding && sessionHasBinding) {
        sourceCloudRuntimeSession = {
          ...sourceCloudRuntimeSession,
          connection: session.connection,
        };
      }
    }

    const sourceInspection = await this.inspectSessionMoveSource({
      sessionId: session.id,
      repoId: session.repoId,
      workdir: session.workdir,
      runtimeInstanceId: inspectableSourceRuntimeId,
      allowUnverifiedSourceGitStatus,
    });
    const sourceGitStatus = sourceInspection.status;
    const siblings = session.sessionGroupId
      ? await prisma.session.findMany({
          where: {
            sessionGroupId: session.sessionGroupId,
            organizationId: session.organizationId,
            id: { not: session.id },
          },
          include: SESSION_INCLUDE,
        })
      : [];
    const sessionsToMove = [session, ...siblings];

    if (targetRuntime?.supportedTools) {
      const unsupportedSession = sessionsToMove.find(
        (current) => !targetRuntime.supportedTools?.includes(current.tool),
      );
      if (unsupportedSession) {
        throw new ToolNotInstalledError(unsupportedSession.tool, targetRuntime.label ?? null);
      }
    }

    // Stop every reachable source process before committing the shared target
    // binding. If a live bridge rejects teardown, no database binding changes.
    for (const current of sessionsToMove) {
      const boundRuntime = sessionRouter.getRuntimeForSession(current.id);
      const persistedRuntimeId = this.getConnectionRuntimeInstanceId(current.connection);
      const reachableRuntimeId =
        boundRuntime?.id &&
        sessionRouter.isRuntimeAvailable(boundRuntime.id, current.organizationId)
          ? boundRuntime.id
          : persistedRuntimeId &&
              sessionRouter.isRuntimeAvailable(persistedRuntimeId, current.organizationId)
            ? persistedRuntimeId
            : null;
      if (reachableRuntimeId) {
        await sessionRouter.transitionRuntime(
          current.id,
          current.hosting as "cloud" | "local",
          "terminate",
        );
      }
    }

    if (session.sessionGroupId) {
      terminalRelay.destroyAllForSessionGroup(session.sessionGroupId);
    } else {
      terminalRelay.destroyAllForSession(session.id);
    }

    const bootstrapPrompt = buildMigrationPrompt(sourceInspection.verified);
    const checkpointSha =
      sourceGitStatus?.headCommitSha && (!sourceGitStatus.branch || !sourceGitStatus.remoteBranch)
        ? sourceGitStatus.headCommitSha
        : null;
    const sourceBranch = sourceGitStatus?.branch ?? session.branch ?? null;
    const sourceConnection = this.parseConnection(session.connection);
    const nextConnection = connJson(
      targetHosting === "local"
        ? defaultConnection({
            runtimeInstanceId: targetRuntimeInstanceId ?? undefined,
            runtimeLabel: targetRuntimeLabel ?? undefined,
          })
        : defaultConnection({
            adapterType: "provisioned",
            environmentId: targetEnvironment?.id ?? sourceConnection.environmentId,
          }),
    );

    const movedSessions = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (session.sessionGroupId) {
        await tx.sessionGroup.update({
          where: { id: session.sessionGroupId },
          data: {
            workdir: null,
            connection: nextConnection,
            branch: sourceBranch,
            worktreeDeleted: false,
          },
        });
      }

      const updated = [];
      for (const current of sessionsToMove) {
        const isPrimary = current.id === session.id;
        const isMerged = current.sessionStatus === "merged";
        updated.push(
          await tx.session.update({
            where: { id: current.id },
            data: {
              ...(!isMerged && {
                agentStatus: "not_started",
                sessionStatus: getRunningSessionStatus(current.sessionStatus),
              }),
              hosting: targetHosting,
              branch: sourceBranch,
              workdir: null,
              ...(isPrimary && {
                pendingRun: {
                  type: "run",
                  prompt: bootstrapPrompt,
                  interactionMode: null,
                } satisfies PendingSessionCommand,
              }),
              toolSessionId: null,
              connection: nextConnection,
            },
            include: SESSION_INCLUDE,
          }),
        );
      }
      if (session.sessionGroupId) {
        await tx.session.updateMany({
          where: {
            sessionGroupId: session.sessionGroupId,
            id: { notIn: sessionsToMove.map((current) => current.id) },
          },
          data: {
            hosting: targetHosting,
            branch: sourceBranch,
            workdir: null,
            connection: nextConnection,
          },
        });
      }
      return updated;
    });
    const movedSession = movedSessions[0];
    if (!movedSession) throw new Error("Moved session was not persisted");
    const sessionGroup = await this.loadSessionGroupSnapshot(movedSession.sessionGroupId);

    const targetRuntimeKey =
      targetHosting === "local" && targetRuntimeInstanceId
        ? (sessionRouter.getRuntime(targetRuntimeInstanceId, movedSession.organizationId)?.key ??
          targetRuntimeInstanceId)
        : null;
    const sessionIdsToBind = new Set(movedSessions.map((moved) => moved.id));
    if (movedSession.sessionGroupId) {
      const committedGroupSessions = await prisma.session.findMany({
        where: { sessionGroupId: movedSession.sessionGroupId },
        select: { id: true },
      });
      for (const committed of committedGroupSessions) sessionIdsToBind.add(committed.id);
    }
    for (const movedSessionId of sessionIdsToBind) {
      sessionRouter.unbindSession(movedSessionId);
      if (targetRuntimeKey) sessionRouter.bindSession(movedSessionId, targetRuntimeKey);
    }

    await eventService.create({
      organizationId: movedSession.organizationId,
      scopeType: "session",
      scopeId: movedSession.id,
      eventType: "session_started",
      payload: {
        type: "runtime_move",
        session: serializeSession(movedSession),
        ...(sessionGroup ? { sessionGroup } : {}),
        sourceHosting: session.hosting,
        targetHosting,
        targetRuntimeLabel: targetRuntimeLabel ?? null,
        sourceGitStatusVerified: sourceInspection.verified,
        sourceGitStatusSkippedReason: sourceInspection.skippedReason,
      } as Prisma.InputJsonValue,
      actorType,
      actorId,
    });

    for (let index = 1; index < movedSessions.length; index++) {
      const relocated = movedSessions[index];
      const source = sessionsToMove[index];
      if (!relocated || !source) continue;
      await eventService.create({
        organizationId: relocated.organizationId,
        scopeType: "session",
        scopeId: relocated.id,
        eventType: "session_started",
        payload: {
          type: "runtime_move",
          session: serializeSession(relocated),
          sourceHosting: source.hosting,
          targetHosting,
          targetRuntimeLabel: targetRuntimeLabel ?? null,
          sourceGitStatusVerified: false,
          sourceGitStatusSkippedReason: null,
        } as Prisma.InputJsonValue,
        actorType,
        actorId,
      });
    }

    if (movedSession.repo || targetHosting === "cloud") {
      this.provisionRuntime({
        sessionId: movedSession.id,
        sessionGroupId: movedSession.sessionGroupId,
        sessionGroupKind: movedSession.sessionGroup?.kind,
        slug: movedSession.sessionGroup?.slug,
        preserveBranchName: shouldPreserveWorkspaceBranchName({
          slug: movedSession.sessionGroup?.slug,
          branch: movedSession.branch,
          channelBaseBranch: movedSession.channel?.baseBranch,
        }),
        hosting: targetHosting,
        tool: movedSession.tool,
        model: movedSession.model,
        reasoningEffort: movedSession.reasoningEffort,
        repo: movedSession.repo,
        branch: movedSession.branch,
        checkpointSha,
        createdById: actorId,
        organizationId: movedSession.organizationId,
        readOnly: movedSession.readOnlyWorkspace,
        adapterType: this.parseConnection(movedSession.connection).adapterType,
        environment: targetEnvironment,
      });
    } else {
      const deliveryResult = await this.deliverPendingCommand(
        movedSession.id,
        movedSession.pendingRun,
      );
      if (deliveryResult && deliveryResult !== "delivered") {
        await this.persistConnectionFailure(
          movedSession.id,
          movedSession.organizationId,
          deliveryResult,
          "move_run",
        );
        return prisma.session.findUniqueOrThrow({
          where: { id: movedSession.id },
          include: SESSION_INCLUDE,
        });
      }
    }

    if (sourceCloudRuntimeSession) {
      await this.destroyMovedSourceCloudRuntime(movedSession.id, sourceCloudRuntimeSession);
    }

    return movedSession;
  }

  private async destroyMovedSourceCloudRuntime(
    sessionId: string,
    sourceRuntimeSession: {
      hosting: string;
      organizationId?: string;
      workdir?: string | null;
      repoId?: string | null;
      connection?: unknown;
    },
  ): Promise<void> {
    try {
      await sessionRouter.destroyRuntime(sessionId, sourceRuntimeSession, {
        reason: "session_moved_to_local",
        skipBridgeDelete: true,
        skipUnbind: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[session-service] failed to destroy source cloud runtime after move for ${sessionId}: ${message}`,
      );
    }
  }

  async moveToRuntime(
    sessionId: string,
    runtimeInstanceId: string,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    const session = await prisma.session.findFirstOrThrow({
      where: { id: sessionId, organizationId },
      include: { ...SESSION_INCLUDE, projects: true },
    });

    if (session.sessionStatus === "merged" && session.worktreeDeleted !== false) {
      throw new Error("Cannot move a merged session");
    }
    const sourceRuntimeId = this.getConnectionRuntimeInstanceId(session.connection);
    await this.assertRuntimeAccess({
      userId: actorId,
      organizationId,
      runtimeInstanceId: sourceRuntimeId,
      sessionGroupId: session.sessionGroupId,
    });
    await this.assertRuntimeAccess({
      userId: actorId,
      organizationId,
      runtimeInstanceId,
      sessionGroupId: session.sessionGroupId,
    });
    const targetRuntime = sessionRouter.getRuntime(runtimeInstanceId, organizationId);
    if (!targetRuntime || targetRuntime.ws.readyState !== targetRuntime.ws.OPEN) {
      throw new Error("Selected runtime is not available");
    }
    if (
      Array.isArray(targetRuntime.supportedTools) &&
      !targetRuntime.supportedTools.includes(session.tool)
    ) {
      throw new Error("Selected runtime does not support this tool");
    }
    if (
      targetRuntime.hostingMode === "local" &&
      session.repoId &&
      Array.isArray(targetRuntime.registeredRepoIds) &&
      !targetRuntime.registeredRepoIds.includes(session.repoId)
    ) {
      throw new Error("Selected runtime does not have this repo linked");
    }
    await this.assertPrivateRuntimeOwner({
      visibility: session.sessionGroup?.visibility,
      ownerUserId: session.sessionGroup?.ownerUserId,
      organizationId,
      hosting: targetRuntime.hostingMode,
      runtimeInstanceId,
    });

    return this.moveSessionInPlace({
      session,
      targetHosting: targetRuntime.hostingMode,
      targetRuntimeInstanceId: runtimeInstanceId,
      targetRuntimeLabel: targetRuntime.label,
      targetRuntime,
      allowUnverifiedSourceGitStatus: true,
      actorType,
      actorId,
    });
  }

  /**
   * Move a session to a cloud runtime. Provisions a cloud machine on-demand
   * and creates a child session bound to it.
   */
  async moveToCloud(
    sessionId: string,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    if (isLocalMode()) {
      throw new Error("Cloud sessions are disabled in local mode");
    }

    const session = await prisma.session.findFirstOrThrow({
      where: { id: sessionId, organizationId },
      include: { ...SESSION_INCLUDE, projects: true },
    });

    if (session.sessionStatus === "merged" && session.worktreeDeleted !== false) {
      throw new Error("Cannot move a merged session");
    }
    await this.assertRuntimeAccess({
      userId: actorId,
      organizationId,
      runtimeInstanceId: this.getConnectionRuntimeInstanceId(session.connection),
      sessionGroupId: session.sessionGroupId,
    });
    await this.assertPrivateRuntimeOwner({
      visibility: session.sessionGroup?.visibility,
      ownerUserId: session.sessionGroup?.ownerUserId,
      organizationId,
      hosting: "cloud",
      runtimeInstanceId: null,
    });

    return this.moveSessionInPlace({
      session,
      targetHosting: "cloud",
      targetRuntimeInstanceId: null,
      targetRuntimeLabel: null,
      allowUnverifiedSourceGitStatus: true,
      actorType,
      actorId,
    });
  }

  async listRuntimesForTool(
    tool: string,
    organizationId: string,
    userId: string,
    sessionGroupId?: string | null,
    visibleRepoId?: string | null,
  ) {
    // Only return local runtimes — cloud is always offered as a single
    // "Cloud" option by the UI, and the adapter auto-provisions the
    // user's own cloud machine on demand.
    const diagnostics = sessionRouter.getRuntimeDiagnostics();
    runtimeDebug("availableRuntimes query received", {
      tool,
      organizationId,
      userId,
      sessionGroupId,
      runtimeDiagnostics: diagnostics,
    });
    const scopedGroup = sessionGroupId
      ? await prisma.sessionGroup.findFirst({
          where: { id: sessionGroupId, organizationId },
          select: { visibility: true, ownerUserId: true },
        })
      : null;
    if (scopedGroup && !canViewSessionGroup(scopedGroup, userId)) {
      throw new AuthorizationError("Not authorized for this session group");
    }

    // Tool availability no longer gates runtime selection: any local runtime is
    // offered regardless of whether the tool's CLI is installed. If the chosen
    // runtime lacks the tool, the send path surfaces a ToolNotInstalledError with
    // install instructions. `supportedTools` is still returned so callers can
    // reflect install state in the UI.
    const allRuntimes = sessionRouter
      .listRuntimes()
      .filter(
        (runtime) =>
          runtime.hostingMode === "local" &&
          runtime.organizationId === organizationId &&
          (scopedGroup?.visibility !== "private" ||
            runtime.ownerUserId === scopedGroup.ownerUserId),
      );

    const sessionIds = allRuntimes.flatMap((runtime) => [...runtime.boundSessions]);
    const sessions =
      sessionIds.length === 0
        ? []
        : await prisma.session.findMany({
            where: {
              id: { in: sessionIds },
              organizationId,
            },
            select: { id: true },
          });
    const orgSessionIds = new Set(sessions.map((session: { id: string }) => session.id));

    const result = await Promise.all(
      allRuntimes.map(async (r) => {
        const access = await runtimeAccessService.getAccessState({
          userId,
          organizationId,
          runtimeInstanceId: r.id,
          sessionGroupId,
        });
        const registeredRepoIds = access.allowed
          ? r.registeredRepoIds
          : visibleRepoId && r.registeredRepoIds.includes(visibleRepoId)
            ? [visibleRepoId]
            : [];

        return {
          id: r.id,
          label: r.label,
          hostingMode: r.hostingMode,
          supportedTools: r.supportedTools,
          connected: r.ws.readyState === r.ws.OPEN,
          sessionCount: [...r.boundSessions].filter((sessionId) => orgSessionIds.has(sessionId))
            .length,
          registeredRepoIds,
          access,
        };
      }),
    );

    runtimeDebug("availableRuntimes query resolved", {
      tool,
      organizationId,
      userId,
      sessionGroupId,
      result,
    });

    return result;
  }

  async listAvailableRuntimes(sessionId: string, organizationId: string, userId: string) {
    const session = await prisma.session.findFirstOrThrow({
      where: { id: sessionId, organizationId, AND: [visibleSessionWhere(userId)] },
      select: { tool: true, sessionGroupId: true, repoId: true },
    });
    return this.listRuntimesForTool(
      session.tool,
      organizationId,
      userId,
      session.sessionGroupId,
      session.repoId,
    );
  }

  /** List branches for a repo by delegating to the bridge runtime. */
  async listBranches(
    repoId: string,
    organizationId: string,
    userId: string,
    runtimeInstanceId?: string,
    sessionGroupId?: string | null,
  ): Promise<string[]> {
    await this.assertRepoExists(repoId, organizationId);
    // If the caller scopes the check to a session group, the group must
    // actually own this repo. Otherwise a `session_group`-scoped grant could
    // be used to list branches of any repo on the bridge by pairing the
    // grant's groupId with an unrelated repoId — client-supplied group IDs
    // are not a free pass to widen the grant.
    if (sessionGroupId) {
      const scopedGroup = await prisma.sessionGroup.findFirst({
        where: { id: sessionGroupId, organizationId },
        select: { repoId: true, visibility: true, ownerUserId: true },
      });
      if (!scopedGroup || scopedGroup.repoId !== repoId) {
        throw new AuthorizationError(
          "Bridge access denied: this session group does not own the requested repo",
        );
      }
      if (!canViewSessionGroup(scopedGroup, userId)) {
        throw new AuthorizationError("Not authorized for this session group");
      }
    }
    let runtimeId = runtimeInstanceId;
    if (runtimeId) {
      await this.assertRuntimeAccess({
        userId,
        organizationId,
        runtimeInstanceId: runtimeId,
        sessionGroupId,
      });
      const runtime = sessionRouter.getRuntime(runtimeId, organizationId);
      if (!runtime) throw new Error("Requested runtime not found");
      runtimeId = runtime.key;
    } else {
      const accessibleRuntimeIds = await runtimeAccessService.listAccessibleRuntimeInstanceIds({
        userId,
        organizationId,
        sessionGroupId,
      });
      const runtime = sessionRouter
        .listRuntimes()
        .find(
          (runtime) =>
            runtime.organizationId === organizationId &&
            (runtime.hostingMode === "cloud" || accessibleRuntimeIds.has(runtime.id)) &&
            runtime.registeredRepoIds.includes(repoId),
        );
      runtimeId = runtime?.key;
    }
    if (!runtimeId) throw new Error("Repo not cloned on any connected runtime");
    return sessionRouter.listBranches(runtimeId, repoId);
  }

  /**
   * List existing on-disk worktrees of a repo on a local runtime, so a session
   * can be started against one instead of creating a fresh Trace worktree.
   * Local hosting only — cloud runtimes have no user-owned worktrees.
   */
  async listRepoWorktrees(
    repoId: string,
    organizationId: string,
    userId: string,
    runtimeInstanceId?: string,
  ): Promise<BridgeRepoWorktree[]> {
    await this.assertRepoExists(repoId, organizationId);
    let runtimeId = runtimeInstanceId;
    if (runtimeId) {
      await this.assertRuntimeAccess({ userId, organizationId, runtimeInstanceId: runtimeId });
      const runtime = sessionRouter.getRuntime(runtimeId, organizationId);
      if (!runtime) throw new Error("Requested runtime not found");
      if (runtime.hostingMode !== "local") {
        throw new ValidationError("Worktree import is only available for local runtimes");
      }
      runtimeId = runtime.key;
    } else {
      const accessibleRuntimeIds = await runtimeAccessService.listAccessibleRuntimeInstanceIds({
        userId,
        organizationId,
      });
      const runtime = sessionRouter
        .listRuntimes()
        .find(
          (runtime) =>
            runtime.organizationId === organizationId &&
            runtime.hostingMode === "local" &&
            accessibleRuntimeIds.has(runtime.id) &&
            runtime.registeredRepoIds.includes(repoId),
        );
      runtimeId = runtime?.key;
    }
    if (!runtimeId) throw new Error("Repo not cloned on any connected local runtime");
    const worktrees = await sessionRouter.listRepoWorktrees(runtimeId, repoId);
    // Only importable worktrees: hide Trace-managed ones and the repo's main
    // checkout (a session must never adopt the user's primary working tree).
    return worktrees.filter((worktree) => !worktree.isTraceManaged && !worktree.isMain);
  }

  /**
   * Adopt an existing on-disk worktree into an existing session's group instead
   * of creating a new session. The group is flagged so the next run adopts the
   * worktree as-is (workspace is provisioned lazily on first run). Local hosting
   * only, and only before the session has started.
   */
  async importWorktree(
    sessionId: string,
    worktreePath: string,
    organizationId: string,
    userId: string,
    branch?: string,
  ) {
    const trimmedPath = normalizeWorktreePath(worktreePath);
    if (!trimmedPath) throw new ValidationError("A worktree path is required");
    const adoptedBranch = branch?.trim() || undefined;

    const session = await prisma.session.findFirst({
      where: { id: sessionId, organizationId },
      select: {
        id: true,
        sessionGroup: {
          select: {
            id: true,
            repoId: true,
            archivedAt: true,
            ownerUserId: true,
            visibility: true,
            sessions: { select: { agentStatus: true, hosting: true } },
          },
        },
      },
    });
    const group = session?.sessionGroup;
    if (!group) throw new ValidationError("Session not found");
    if (!canViewSessionGroup(group, userId)) {
      throw new AuthorizationError("Not authorized for this session");
    }
    if (group.archivedAt) throw new ValidationError("Cannot import into an archived session");
    if (!group.repoId) throw new ValidationError("Importing a worktree requires a repo");
    if (group.sessions.some((s) => s.hosting === "cloud")) {
      throw new ValidationError("Importing a worktree requires local hosting");
    }
    if (group.sessions.some((s) => s.agentStatus !== "not_started")) {
      throw new ValidationError("Can only import a worktree before the session has started");
    }

    // At most one active group may own a given worktree.
    const conflictingGroup = await prisma.sessionGroup.findFirst({
      where: {
        organizationId,
        repoId: group.repoId,
        workdir: trimmedPath,
        worktreeAdopted: true,
        worktreeDeleted: false,
        archivedAt: null,
        id: { not: group.id },
      },
      select: { id: true },
    });
    if (conflictingGroup) {
      throw new ValidationError("This worktree is already imported by another session");
    }

    // Record the worktree's current branch up front so the session shows which
    // worktree it adopted immediately; provisioning re-confirms it on first run.
    const sessionGroup = await this.syncGroupWorkspaceState(group.id, {
      workdir: trimmedPath,
      worktreeAdopted: true,
      worktreeDeleted: false,
      ...(adoptedBranch ? { branch: adoptedBranch } : {}),
    });

    // Events are the source of truth: broadcast the adopted group so every
    // client updates its store (no client reads the mutation result).
    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "worktree_imported",
        sessionGroup,
      },
      actorType: "user",
      actorId: userId,
    });

    return sessionGroup;
  }

  async getLinkedCheckoutStatus(
    sessionGroupId: string,
    repoId: string,
    organizationId: string,
    userId: string,
    runtimeInstanceId?: string,
  ) {
    await this.assertRepoExists(repoId, organizationId);
    const runtimeId = await this.resolveLinkedCheckoutRuntime(
      sessionGroupId,
      repoId,
      organizationId,
      userId,
      { runtimeInstanceId },
    );
    return sessionRouter.getLinkedCheckoutStatus(runtimeId, repoId);
  }

  async getLinkedCheckoutChangedFile(
    sessionGroupId: string,
    repoId: string,
    filePath: string,
    organizationId: string,
    userId: string,
    runtimeInstanceId?: string,
  ) {
    await this.assertRepoExists(repoId, organizationId);
    const runtimeId = await this.resolveLinkedCheckoutRuntime(
      sessionGroupId,
      repoId,
      organizationId,
      userId,
      { runtimeInstanceId, requireRegisteredRepo: true },
    );
    return sessionRouter.getLinkedCheckoutChangedFile(runtimeId, repoId, filePath);
  }

  async linkLinkedCheckoutRepo(
    sessionGroupId: string,
    repoId: string,
    localPath: string,
    organizationId: string,
    userId: string,
    runtimeInstanceId?: string,
  ) {
    await this.assertRepoExists(repoId, organizationId);
    const runtimeId = await this.resolveLinkedCheckoutRuntime(
      sessionGroupId,
      repoId,
      organizationId,
      userId,
      { runtimeInstanceId },
    );
    return sessionRouter.linkLinkedCheckoutRepo(runtimeId, repoId, localPath);
  }

  async syncLinkedCheckout(
    sessionGroupId: string,
    repoId: string,
    branch: string,
    organizationId: string,
    userId: string,
    options?: {
      runtimeInstanceId?: string;
      commitSha?: string | null;
      autoSyncEnabled?: boolean;
      conflictStrategy?: "discard" | "commit" | "rebase" | "stash";
      commitMessage?: string | null;
    },
  ) {
    await this.assertRepoExists(repoId, organizationId);
    const { runtimeId, runtimeInstanceId, group } = await this.resolveLinkedCheckoutRuntimeContext(
      sessionGroupId,
      repoId,
      organizationId,
      userId,
      { runtimeInstanceId: options?.runtimeInstanceId, requireRegisteredRepo: true },
    );
    const refreshedBranch = await this.refreshLinkedCheckoutBranchFromBridge({
      organizationId,
      repoId,
      group,
    });
    const sessionRuntimeInstanceId = this.getConnectionRuntimeInstanceId(group.connection);
    return sessionRouter.syncLinkedCheckout(runtimeId, {
      repoId,
      sessionGroupId,
      branch: refreshedBranch ?? branch,
      commitSha: options?.commitSha,
      autoSyncEnabled: options?.autoSyncEnabled,
      refreshBeforeSync:
        !!sessionRuntimeInstanceId && sessionRuntimeInstanceId !== runtimeInstanceId,
      conflictStrategy: options?.conflictStrategy,
      commitMessage: options?.commitMessage,
    });
  }

  async restoreLinkedCheckout(
    sessionGroupId: string,
    repoId: string,
    organizationId: string,
    userId: string,
    runtimeInstanceId?: string,
  ) {
    await this.assertRepoExists(repoId, organizationId);
    const runtimeId = await this.resolveLinkedCheckoutRuntime(
      sessionGroupId,
      repoId,
      organizationId,
      userId,
      { runtimeInstanceId, requireRegisteredRepo: true },
    );
    return sessionRouter.restoreLinkedCheckout(runtimeId, repoId);
  }

  async commitLinkedCheckoutChanges(
    sessionGroupId: string,
    repoId: string,
    organizationId: string,
    userId: string,
    runtimeInstanceId?: string,
    message?: string | null,
  ) {
    await this.assertRepoExists(repoId, organizationId);
    const runtimeId = await this.resolveLinkedCheckoutRuntime(
      sessionGroupId,
      repoId,
      organizationId,
      userId,
      { runtimeInstanceId, requireRegisteredRepo: true },
    );
    return sessionRouter.commitLinkedCheckoutChanges(runtimeId, {
      repoId,
      sessionGroupId,
      message,
    });
  }

  async setLinkedCheckoutAutoSync(
    sessionGroupId: string,
    repoId: string,
    enabled: boolean,
    organizationId: string,
    userId: string,
    runtimeInstanceId?: string,
  ) {
    await this.assertRepoExists(repoId, organizationId);
    const runtimeId = await this.resolveLinkedCheckoutRuntime(
      sessionGroupId,
      repoId,
      organizationId,
      userId,
      { runtimeInstanceId, requireRegisteredRepo: true },
    );
    return sessionRouter.setLinkedCheckoutAutoSync(runtimeId, repoId, enabled);
  }

  /**
   * A 404 from GitHub means the requested ref/path does not exist — the signal
   * to fall back to the default branch. Other failures (auth, rate limit,
   * transient 5xx) must surface so we don't mask them or waste a retry.
   */
  private isMissingRefError(error: unknown): boolean {
    return error instanceof GitHubApiError && error.status === 404;
  }

  /**
   * Run a GitHub read against the session group's branch, falling back to the
   * repo's default branch when the session branch is unavailable (e.g. never
   * pushed). Mirrors the fallback behaviour of {@link readFileWithSource}.
   */
  private async withDefaultBranchFallback<T>(
    source: GitHubSessionGroupFileSource,
    run: (branch: string) => Promise<T>,
  ): Promise<T> {
    try {
      return await run(source.branch);
    } catch (error) {
      if (source.branch === source.defaultBranch || !this.isMissingRefError(error)) {
        throw error;
      }
      return run(source.defaultBranch);
    }
  }

  /** List files in a session group's branch from GitHub. */
  async listFiles(
    sessionGroupId: string,
    organizationId: string,
    userId: string,
  ): Promise<string[]> {
    const source = await this.resolveGitHubSessionGroupFileSource(
      sessionGroupId,
      organizationId,
      userId,
    );
    return this.withDefaultBranchFallback(source, (branch) =>
      githubRepoService.listFiles(source.repo, branch, source.token),
    );
  }

  /**
   * Fetch the full recursive file list for a session group's branch, along with
   * GitHub's `truncated` flag so the client can fall back to lazy directory
   * loading when the repo is too large to return completely.
   */
  async listFileTree(
    sessionGroupId: string,
    organizationId: string,
    userId: string,
  ): Promise<GitHubFileTree> {
    const source = await this.resolveGitHubSessionGroupFileSource(
      sessionGroupId,
      organizationId,
      userId,
    );
    return this.withDefaultBranchFallback(source, (branch) =>
      githubRepoService.listFileTree(source.repo, branch, source.token),
    );
  }

  /** List one or more directory levels in a session group's branch from GitHub. */
  async listDirectoryEntries(
    sessionGroupId: string,
    directoryPath: string,
    depth: number | undefined,
    organizationId: string,
    userId: string,
  ): Promise<GitHubDirectoryEntry[]> {
    const normalizedPath = this.normalizeDirectoryPath(directoryPath);
    const boundedDepth =
      typeof depth === "number" && Number.isInteger(depth) ? Math.min(Math.max(depth, 1), 2) : 1;
    const source = await this.resolveGitHubSessionGroupFileSource(
      sessionGroupId,
      organizationId,
      userId,
    );
    return this.withDefaultBranchFallback(source, (branch) =>
      githubRepoService.listDirectoryEntries(
        source.repo,
        branch,
        normalizedPath,
        source.token,
        boundedDepth,
      ),
    );
  }

  /** Read a file's content from a session group's GitHub branch. */
  async readFile(
    sessionGroupId: string,
    filePath: string,
    organizationId: string,
    userId: string,
  ): Promise<string> {
    const result = await this.readFileWithSource(sessionGroupId, filePath, organizationId, userId);
    return result.content;
  }

  /** Read a file's content and report whether it came from the requested branch or default branch. */
  async readFileWithSource(
    sessionGroupId: string,
    filePath: string,
    organizationId: string,
    userId: string,
  ): Promise<SessionGroupFileContentResult> {
    const normalizedPath = this.normalizeFilePath(filePath);
    const source = await this.resolveGitHubSessionGroupFileSource(
      sessionGroupId,
      organizationId,
      userId,
    );
    const relativePath = this.toRepoRelativeFilePath(normalizedPath, source.workdir);
    try {
      return {
        content: await githubRepoService.readFile(
          source.repo,
          source.branch,
          relativePath,
          source.token,
        ),
        ref: source.branch,
        requestedRef: source.branch,
        usedFallback: false,
      };
    } catch (error) {
      if (source.branch === source.defaultBranch || !this.isMissingRefError(error)) {
        throw error;
      }
      return {
        content: await githubRepoService.readFile(
          source.repo,
          source.defaultBranch,
          relativePath,
          source.token,
        ),
        ref: source.defaultBranch,
        requestedRef: source.branch,
        usedFallback: true,
      };
    }
  }

  /** Save a file's content to a session group's working directory. */
  async saveFile(
    sessionGroupId: string,
    filePath: string,
    content: string,
    organizationId: string,
    userId: string,
  ): Promise<boolean> {
    const normalizedPath = this.normalizeFilePath(filePath);
    const runtime = await this.resolveAccessibleSessionGroupRuntime(
      sessionGroupId,
      organizationId,
      userId,
      { requireWrite: true },
    );
    await sessionRouter.writeFile(
      runtime.runtimeId,
      runtime.sessionId,
      normalizedPath,
      content,
      runtime.workdirHint,
    );
    if (normalizedPath === "document.format.json") {
      await managedGitService.retryPdfCommitExport(sessionGroupId, { force: true });
    }
    return true;
  }

  async pdfDownloadUrl(sessionGroupId: string, organizationId: string, userId: string | null) {
    if (!userId) throw new AuthenticationError();
    await assertSessionGroupAccess(sessionGroupId, userId, organizationId);
    const group = await prisma.sessionGroup.findFirst({
      where: {
        id: sessionGroupId,
        organizationId,
        kind: "pdf",
      },
      select: {
        pdfExportStatus: true,
        pdfExportKey: true,
        pdfExportCommitSha: true,
      },
    });
    if (!group) return null;
    if (group.pdfExportStatus !== "captured" || !group.pdfExportKey) {
      await managedGitService.retryPdfCommitExport(sessionGroupId);
      return null;
    }
    return storage.getGetUrl(group.pdfExportKey, {
      downloadFilename: `document-${group.pdfExportCommitSha?.slice(0, 8) ?? "latest"}.pdf`,
    });
  }

  async commitFileChanges(
    sessionGroupId: string,
    message: string | undefined,
    organizationId: string,
    userId: string,
  ): Promise<string> {
    const runtime = await this.resolveAccessibleSessionGroupRuntime(
      sessionGroupId,
      organizationId,
      userId,
      { requireWrite: true },
    );
    return sessionRouter.commitFileChanges(
      runtime.runtimeId,
      runtime.sessionId,
      message,
      runtime.workdirHint,
    );
  }

  async listWorktreeChanges(sessionGroupId: string, organizationId: string, userId: string) {
    const runtime = await this.resolveAccessibleSessionGroupRuntime(
      sessionGroupId,
      organizationId,
      userId,
      { requireWrite: true },
    );
    return sessionRouter.listWorktreeChanges(
      runtime.runtimeId,
      runtime.sessionId,
      runtime.workdirHint,
    );
  }

  async revertFileChange(
    sessionGroupId: string,
    filePath: string,
    organizationId: string,
    userId: string,
  ): Promise<boolean> {
    const normalizedPath = this.normalizeFilePath(filePath);
    const runtime = await this.resolveAccessibleSessionGroupRuntime(
      sessionGroupId,
      organizationId,
      userId,
      { requireWrite: true },
    );
    await sessionRouter.revertWorktreeFile(
      runtime.runtimeId,
      runtime.sessionId,
      normalizedPath,
      runtime.workdirHint,
    );
    return true;
  }

  /** Compute the branch diff for a session group from GitHub (changed files vs default branch). */
  async branchDiff(sessionGroupId: string, organizationId: string, userId: string) {
    const source = await this.resolveGitHubSessionGroupFileSource(
      sessionGroupId,
      organizationId,
      userId,
    );
    if (source.branch === source.defaultBranch) {
      return [];
    }
    return githubRepoService.branchDiff(
      source.repo,
      source.defaultBranch,
      source.branch,
      source.token,
    );
  }

  /** Read a file's content at a specific GitHub ref. */
  async readFileAtRef(
    sessionGroupId: string,
    filePath: string,
    ref: string,
    organizationId: string,
    userId: string,
  ): Promise<string> {
    // Validate ref to prevent git argument injection
    if (!this.isSafeGitRef(ref)) {
      throw new Error("Invalid git ref");
    }
    const normalizedPath = this.normalizeFilePath(filePath);
    const source = await this.resolveGitHubSessionGroupFileSource(
      sessionGroupId,
      organizationId,
      userId,
    );
    const relativePath = this.toRepoRelativeFilePath(normalizedPath, source.workdir);
    return githubRepoService.readFile(
      source.repo,
      this.toGitHubRef(ref),
      relativePath,
      source.token,
    );
  }

  private async resolveGitHubSessionGroupFileSource(
    sessionGroupId: string,
    organizationId: string,
    userId: string,
  ): Promise<GitHubSessionGroupFileSource> {
    const group = await prisma.sessionGroup.findFirst({
      where: { id: sessionGroupId, organizationId },
      select: {
        id: true,
        branch: true,
        workdir: true,
        visibility: true,
        ownerUserId: true,
        repo: { select: { provider: true, remoteUrl: true, defaultBranch: true } },
      },
    });
    if (!group) throw new Error("Session group not found");
    if (!canViewSessionGroup(group, userId)) {
      throw new AuthorizationError("Not authorized for this session group");
    }
    if (group.repo?.provider !== "github") {
      throw new Error("Cannot access GitHub files for a managed repo.");
    }
    if (!group.repo.remoteUrl) {
      throw new Error("Cannot access files: this session group has no GitHub remote.");
    }

    const repo = parseGitHubRepo(group.repo.remoteUrl);
    if (!repo) {
      throw new Error("Cannot access files: this session group's remote is not a GitHub repo.");
    }

    const tokens = await apiTokenService.getDecryptedTokens(userId);
    const githubToken =
      tokens.github ??
      (await orgSecretService.getDecryptedValueByName(
        organizationId,
        ORG_GITHUB_TOKEN_SECRET_NAME,
      ));
    if (!githubToken) {
      throw new Error(
        `No GitHub token configured. Add a personal GitHub API token or ask an org admin to add an org secret named ${ORG_GITHUB_TOKEN_SECRET_NAME}.`,
      );
    }

    const defaultBranch = this.toGitHubRef(group.repo.defaultBranch || "main");
    const branch = this.toGitHubRef(group.branch || defaultBranch);

    return {
      repo,
      token: githubToken,
      branch,
      defaultBranch,
      workdir: group.workdir,
    };
  }

  private toRepoRelativeFilePath(filePath: string, workdir: string | null): string {
    let relativePath = filePath;
    if (filePath.startsWith("/")) {
      if (!workdir) {
        throw new Error(INVALID_FILE_PATH_ERROR);
      }
      const workdirPrefix = workdir.replace(/\/$/, "") + "/";
      if (!filePath.startsWith(workdirPrefix)) {
        throw new Error(INVALID_FILE_PATH_ERROR);
      }
      relativePath = filePath.slice(workdirPrefix.length);
    }

    const parts = relativePath.split("/");
    if (
      relativePath.startsWith("/") ||
      parts.some((part) => part.length === 0 || part === "." || part === "..")
    ) {
      throw new Error(INVALID_FILE_PATH_ERROR);
    }
    return relativePath;
  }

  private toGitHubRef(ref: string): string {
    return ref.replace(/^origin\//, "");
  }

  private isSafeGitRef(ref: string): boolean {
    if (!ref || ref.startsWith("-") || ref.includes("..")) return false;
    for (const char of ref) {
      const code = char.charCodeAt(0);
      if (code <= 0x1f || code === 0x7f) {
        return false;
      }
    }
    return true;
  }

  // ─── Helpers ───

  /**
   * Extract plan/question data from a session_output payload and create an inbox item.
   */
  private async createInboxItemFromOutput(params: {
    orgId: string;
    userId: string;
    sessionName: string;
    sessionId: string;
    data: Record<string, unknown>;
  }) {
    const { orgId, userId, sessionName, sessionId, data } = params;
    const messageContent = (data.message as Record<string, unknown> | undefined)?.content as
      | Array<Record<string, unknown>>
      | undefined;

    const isQuestion = hasQuestionBlock(data);

    const questionBlock = isQuestion
      ? (messageContent?.find((b) => b.type === "question") as
          | { questions: Array<Record<string, unknown>> }
          | undefined)
      : undefined;

    const planBlock = !isQuestion
      ? (messageContent?.find((b) => b.type === "plan") as { content?: string } | undefined)
      : undefined;
    const planText = planBlock?.content;

    const summary = isQuestion
      ? (questionBlock?.questions?.[0]?.question as string | undefined)
      : planText?.slice(0, 200);

    await inboxService.createItem({
      orgId,
      userId,
      itemType: isQuestion ? "question" : "plan",
      title: sessionName,
      summary,
      payload: {
        planContent: planText ?? null,
        questions: questionBlock?.questions ?? null,
      } as unknown as Prisma.InputJsonValue,
      sourceType: "session",
      sourceId: sessionId,
    });
  }

  private parseConnection(raw: unknown): SessionConnectionData {
    if (!raw || typeof raw !== "object") return defaultConnection();
    return defaultConnection(raw as Partial<SessionConnectionData>);
  }

  private async resolvePromptEventIdForCheckpoint(
    sessionId: string,
    checkpoint: GitCheckpointBridgePayload,
  ) {
    if (typeof checkpoint.promptEventId === "string" && checkpoint.promptEventId.trim()) {
      return checkpoint.promptEventId;
    }

    if (
      typeof checkpoint.checkpointContextId === "string" &&
      checkpoint.checkpointContextId.trim()
    ) {
      const promptEventId = await this.findPromptEventIdForCheckpointContext(
        sessionId,
        checkpoint.checkpointContextId,
      );
      if (promptEventId) return promptEventId;
    }

    return this.findPromptEventIdForCheckpoint(sessionId, checkpoint.observedAt);
  }

  private async findPromptEventIdForCheckpointContext(
    sessionId: string,
    checkpointContextId: string,
  ) {
    const promptEvent = await prisma.event.findFirst({
      where: {
        scopeId: sessionId,
        scopeType: "session",
        eventType: { in: ["session_started", "message_sent"] },
        metadata: { path: ["checkpointContextId"], equals: checkpointContextId },
      },
      orderBy: { timestamp: "desc" },
      select: { id: true },
    });

    if (!promptEvent) {
      console.warn(
        `[checkpoint] no prompt event found for checkpoint context ${checkpointContextId} in session ${sessionId}`,
      );
      return null;
    }

    return promptEvent.id;
  }

  private async findPromptEventIdForCheckpoint(sessionId: string, observedAt: string) {
    const observedDate = new Date(observedAt);
    if (Number.isNaN(observedDate.getTime())) {
      console.warn(`[checkpoint] invalid observedAt for session ${sessionId}: ${observedAt}`);
      return null;
    }

    const latestPrompt = await prisma.event.findFirst({
      where: {
        scopeId: sessionId,
        scopeType: "session",
        eventType: { in: ["session_started", "message_sent"] },
        timestamp: { lte: observedDate },
      },
      orderBy: { timestamp: "desc" },
      select: { id: true },
    });

    if (!latestPrompt) {
      console.warn(
        `[checkpoint] no prompt event found before ${observedAt} for session ${sessionId}`,
      );
      return null;
    }

    return latestPrompt.id;
  }

  private async syncGroupWorkspaceState(
    sessionGroupId: string | null | undefined,
    patch: GroupWorkspaceStatePatch,
    options?: {
      workdirRuntimeInstanceId?: string | null;
      rebindSessionsToConnection?: boolean;
      destroyGroupTerminals?: boolean;
      hosting?: "cloud" | "local";
    },
  ) {
    if (!sessionGroupId) return null;

    const groupData: Prisma.SessionGroupUncheckedUpdateInput = {};
    const sessionData: Prisma.SessionUpdateManyMutationInput = {};

    // `workdir` is a runtime-specific filesystem path. A concrete path may only
    // be stamped onto sessions that actually live on the runtime that produced
    // it — mirroring one runtime's path onto a session bound to a different
    // runtime yields a nonexistent cwd and `spawn ENOENT`. Groups are pinned to
    // a single runtime, so in the healthy case this still updates every session;
    // the runtime scope is a guard against any legacy group whose sessions
    // diverged across runtimes. Clearing the workdir (null) is always safe to
    // apply group-wide.
    let scopedWorkdirUpdate: { runtimeInstanceId: string; workdir: string } | null = null;
    if (Object.prototype.hasOwnProperty.call(patch, "workdir")) {
      groupData.workdir = patch.workdir ?? null;
      if (patch.workdir && options?.workdirRuntimeInstanceId) {
        scopedWorkdirUpdate = {
          runtimeInstanceId: options.workdirRuntimeInstanceId,
          workdir: patch.workdir,
        };
      } else {
        sessionData.workdir = patch.workdir ?? null;
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, "connection")) {
      const connectionValue = patch.connection ?? Prisma.DbNull;
      groupData.connection = connectionValue;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "prUrl")) {
      groupData.prUrl = patch.prUrl ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "repoId")) {
      groupData.repoId = patch.repoId ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "branch")) {
      groupData.branch = patch.branch ?? null;
      sessionData.branch = patch.branch ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "slug")) {
      groupData.slug = patch.slug ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "worktreeDeleted")) {
      groupData.worktreeDeleted = patch.worktreeDeleted ?? false;
      sessionData.worktreeDeleted = patch.worktreeDeleted ?? false;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "worktreeAdopted")) {
      groupData.worktreeAdopted = patch.worktreeAdopted ?? false;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "setupStatus")) {
      groupData.setupStatus = patch.setupStatus ?? "idle";
    }

    if (Object.prototype.hasOwnProperty.call(patch, "setupError")) {
      groupData.setupError = patch.setupError ?? null;
    }

    if (options?.hosting) {
      sessionData.hosting = options.hosting;
    }

    const shouldMirrorToSessions = Object.keys(sessionData).length > 0;

    let shouldRebindSessions = options?.rebindSessionsToConnection ?? false;
    let shouldDestroyGroupTerminals = options?.destroyGroupTerminals ?? false;
    let sessionsToRebind: Array<{ id: string; organizationId: string }> = [];
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (Object.prototype.hasOwnProperty.call(patch, "connection")) {
        const currentGroup = await tx.sessionGroup.findFirst({
          where: { id: sessionGroupId },
          select: { connection: true },
        });
        const bindingChanged = Boolean(
          currentGroup &&
          hasRuntimeBindingChanged(
            this.parseConnection(currentGroup.connection),
            this.parseConnection(patch.connection),
          ),
        );
        shouldRebindSessions ||= bindingChanged;
        shouldDestroyGroupTerminals ||= bindingChanged;
      }

      await tx.sessionGroup.update({
        where: { id: sessionGroupId },
        data: groupData,
        select: SESSION_GROUP_SUMMARY_SELECT,
      });

      if (shouldMirrorToSessions) {
        await tx.session.updateMany({
          where: { sessionGroupId },
          data: sessionData,
        });
      }

      if (scopedWorkdirUpdate) {
        await tx.session.updateMany({
          where: {
            sessionGroupId,
            connection: {
              path: ["runtimeInstanceId"],
              equals: scopedWorkdirUpdate.runtimeInstanceId,
            },
          },
          data: { workdir: scopedWorkdirUpdate.workdir },
        });
      }

      if (shouldRebindSessions) {
        const targetConnection = this.parseConnection(patch.connection);
        const sessions = await tx.session.findMany({
          where: { sessionGroupId },
          select: { id: true, organizationId: true, connection: true },
        });
        for (const session of sessions) {
          await tx.session.update({
            where: { id: session.id },
            data: {
              // Bridge identity is shared by the group, while lifecycle state,
              // errors, retry counters, and optimistic versions remain owned by
              // each session. This write intentionally bypasses the connection
              // `version` gate — it runs inside the transaction against
              // not_started sessions that aren't actively writing their own
              // connection, so there is no conditional-write race to lose to.
              connection: connJson(
                mergeRuntimeBinding(this.parseConnection(session.connection), targetConnection),
              ),
            },
          });
        }
        sessionsToRebind = sessions.map(({ id, organizationId }) => ({ id, organizationId }));
      }
    });

    if (shouldDestroyGroupTerminals) {
      terminalRelay.destroyAllForSessionGroup(sessionGroupId);
    }

    if (shouldRebindSessions) {
      const runtimeInstanceId = this.getConnectionRuntimeInstanceId(patch.connection);
      const runtime = runtimeInstanceId
        ? sessionRouter.getRuntime(runtimeInstanceId, sessionsToRebind[0]?.organizationId)
        : null;
      for (const session of sessionsToRebind) {
        sessionRouter.unbindSession(session.id);
        if (runtime) sessionRouter.bindSession(session.id, runtime.key);
      }
    }

    return this.loadSessionGroupSnapshot(sessionGroupId);
  }

  private async loadSessionGroupSnapshot(
    sessionGroupId: string | null | undefined,
    db: Prisma.TransactionClient = prisma,
  ): Promise<SessionGroupSnapshot | null> {
    if (!sessionGroupId) return null;

    const group = await db.sessionGroup.findUnique({
      where: { id: sessionGroupId },
      select: {
        ...SESSION_GROUP_SUMMARY_SELECT,
        sessions: {
          select: {
            agentStatus: true,
            sessionStatus: true,
          },
        },
      },
    });

    if (!group) return null;
    const { sessions, ...summary } = group;
    return buildSessionGroupSnapshot(summary, sessions);
  }

  private async getChannelSetupScript(
    channelId: string | null | undefined,
  ): Promise<string | null> {
    if (!channelId) return null;
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { setupScript: true },
    });
    return channel?.setupScript?.trim() || null;
  }

  private async executeSetupScript({
    sessionId,
    sessionGroupId,
    organizationId,
    runtimeInstanceId,
    workdir,
    setupScript,
  }: {
    sessionId: string;
    sessionGroupId: string | null;
    organizationId: string;
    runtimeInstanceId: string;
    workdir: string;
    setupScript: string;
  }) {
    try {
      const exitCode = await terminalRelay.executeCommand(
        sessionId,
        sessionGroupId,
        organizationId,
        runtimeInstanceId,
        setupScript,
        workdir,
      );
      const success = exitCode === 0;
      const error = success ? null : `Setup script exited with code ${exitCode}`;
      const sessionGroup = await this.syncGroupWorkspaceState(sessionGroupId, {
        setupStatus: success ? "completed" : "failed",
        setupError: error,
      });
      await eventService.create({
        organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "session_output",
        payload: {
          type: "setup_script_completed",
          exitCode,
          success,
          ...(error ? { error } : {}),
          ...(sessionGroup ? { sessionGroup } : {}),
        },
        actorType: "system",
        actorId: "system",
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const sessionGroup = await this.syncGroupWorkspaceState(sessionGroupId, {
        setupStatus: "failed",
        setupError: error,
      });
      await eventService.create({
        organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "session_output",
        payload: {
          type: "setup_script_completed",
          exitCode: 1,
          success: false,
          error,
          ...(sessionGroup ? { sessionGroup } : {}),
        },
        actorType: "system",
        actorId: "system",
      });
    }
  }

  private mergeConnection(
    existing: unknown,
    patch: Partial<SessionConnectionData>,
  ): Prisma.InputJsonValue {
    const conn = this.parseConnection(existing);
    return connJson({ ...conn, ...patch });
  }

  private parsePendingCommand(raw: unknown): PendingSessionCommand | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const pending = raw as Record<string, unknown>;
    if (pending.type === "send" && typeof pending.prompt === "string") {
      return {
        type: "send",
        prompt: pending.prompt,
        interactionMode:
          typeof pending.interactionMode === "string" ? pending.interactionMode : null,
        clientSource: typeof pending.clientSource === "string" ? pending.clientSource : null,
        checkpointContext: parseCheckpointContext(pending.checkpointContext),
        imageKeys: Array.isArray(pending.imageKeys) ? (pending.imageKeys as string[]) : null,
        workspaceUpgrade: pending.workspaceUpgrade === true,
      };
    }
    if (pending.type === "run" || pending.type == null) {
      return {
        type: "run",
        prompt: typeof pending.prompt === "string" ? pending.prompt : null,
        interactionMode:
          typeof pending.interactionMode === "string" ? pending.interactionMode : null,
        clientSource: typeof pending.clientSource === "string" ? pending.clientSource : null,
        checkpointContext: parseCheckpointContext(pending.checkpointContext),
        imageKeys: Array.isArray(pending.imageKeys) ? (pending.imageKeys as string[]) : null,
        workspaceUpgrade: pending.workspaceUpgrade === true,
      };
    }
    return null;
  }

  private parsePendingCommands(raw: unknown): PendingSessionCommand[] {
    const singleCommand = this.parsePendingCommand(raw);
    if (singleCommand) return [singleCommand];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];

    const pending = raw as Record<string, unknown>;
    if (pending.type !== "queue" || !Array.isArray(pending.commands)) return [];

    const commands: PendingSessionCommand[] = [];
    for (const commandValue of pending.commands) {
      const command = this.parsePendingCommand(commandValue);
      if (command) commands.push(command);
    }
    return commands;
  }

  /**
   * Store a pending command and send upgrade_workspace to the bridge.
   * If delivery fails, persists the connection failure so the user sees the error.
   */
  private async triggerWorkspaceUpgrade(
    sessionId: string,
    session: {
      organizationId: string;
      sessionGroupId: string | null;
      sessionGroup?: { slug: string | null } | null;
      channel?: { baseBranch?: string | null } | null;
      repo: { id: string; name: string; remoteUrl: string | null; defaultBranch: string } | null;
      hosting: string;
      branch: string | null;
      connection: unknown;
    },
    pendingCommand: PendingSessionCommand,
    extraData?: Partial<Prisma.SessionUpdateInput>,
  ) {
    await this.storePendingCommand(
      sessionId,
      { ...pendingCommand, workspaceUpgrade: true },
      extraData,
    );

    const repo = session.repo;
    if (!repo) return;
    assertCloudRepoRemoteAvailable(session.hosting, repo);

    const conn = this.parseConnection(session.connection);
    const deliveryResult = sessionRouter.send(
      sessionId,
      {
        type: "upgrade_workspace",
        sessionId,
        sessionGroupId: session.sessionGroupId ?? undefined,
        slug: session.sessionGroup?.slug ?? undefined,
        preserveBranchName: shouldPreserveWorkspaceBranchName({
          slug: session.sessionGroup?.slug,
          branch: session.branch,
          channelBaseBranch: session.channel?.baseBranch,
        }),
        repoId: repo.id,
        repoName: repo.name,
        repoRemoteUrl: repo.remoteUrl,
        defaultBranch: repo.defaultBranch,
        branch: session.branch ?? undefined,
      },
      { expectedHomeRuntimeId: conn.runtimeInstanceId, organizationId: session.organizationId },
    );

    if (deliveryResult !== "delivered") {
      await this.persistConnectionFailure(
        sessionId,
        session.organizationId,
        deliveryResult,
        "upgrade_workspace",
      );
    }
  }

  private async storePendingCommand(
    sessionId: string,
    pending: PendingSessionCommand,
    extraData?: Partial<Prisma.SessionUpdateInput>,
    existingPendingRun?: unknown,
  ) {
    const rawPendingRun =
      arguments.length >= 4
        ? existingPendingRun
        : (
            await prisma.session.findUnique({
              where: { id: sessionId },
              select: { pendingRun: true },
            })
          )?.pendingRun;
    const commands = this.parsePendingCommands(rawPendingRun);
    await prisma.session.update({
      where: { id: sessionId },
      data: { pendingRun: pendingRunValue([...commands, pending]), ...extraData },
    });
  }

  private async deliverPendingCommand(
    sessionId: string,
    rawPending: unknown,
  ): Promise<DeliveryResult | null> {
    const pendingCommands = this.parsePendingCommands(rawPending);
    const pending = pendingCommands[0];
    if (!pending) return null;
    const remainingCommands = pendingCommands.slice(1);

    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        organizationId: true,
        tool: true,
        model: true,
        reasoningEffort: true,
        createdBy: { select: { enableClaudeInChrome: true } },
        sessionStatus: true,
        workdir: true,
        toolSessionId: true,
        repoId: true,
        connection: true,
        sessionGroupId: true,
        sessionGroup: { select: { kind: true } },
      },
    });

    // If no tool session ID exists, prepend conversation context so the new
    // process has the full history (same pattern as tool-switch).
    let prompt = pending.prompt;
    if (!session.toolSessionId && prompt) {
      const context = await buildConversationContext(sessionId);
      if (context) {
        prompt = `${context}\n\n${prompt}`;
      }
    }

    // Append system instructions (title, auto-save) to the prompt
    if (prompt) {
      prompt = appendPromptInstructions(prompt, {
        hasRepo: !!session.repoId,
        sessionGroupKind: session.sessionGroup?.kind,
      });
    }

    const fallbackCheckpointContext =
      pending.type === "run" && !pending.checkpointContext
        ? buildCheckpointContextFromStartMeta({
            sessionId,
            sessionGroupId: session.sessionGroupId,
            repoId: session.repoId,
            startMeta: await getSessionStartMetadata(sessionId),
          })
        : null;
    const checkpointContext = pending.checkpointContext ?? fallbackCheckpointContext;

    // Generate presigned GET URLs for any attached files in the pending command
    let imageUrls: string[] | undefined;
    if (pending.imageKeys?.length) {
      imageUrls = await Promise.all(pending.imageKeys.map((key) => storage.getGetUrl(key)));
    }

    const command = {
      type: pending.type,
      sessionId,
      prompt: prompt ?? undefined,
      appendSystemPrompt: generatedProjectInstruction(session.sessionGroup?.kind),
      tool: session.tool,
      model: session.model ?? undefined,
      reasoningEffort: session.reasoningEffort ?? undefined,
      enableClaudeInChrome: this.claudeInChromeFlag(session.tool, session.createdBy),
      interactionMode: pending.interactionMode ?? undefined,
      cwd: session.workdir ?? undefined,
      toolSessionId: session.toolSessionId ?? undefined,
      checkpointContext: checkpointContext ?? undefined,
      imageUrls,
    } satisfies {
      type: "run" | "send";
      sessionId: string;
      prompt?: string;
      appendSystemPrompt?: string;
      tool: CodingTool;
      model?: string;
      reasoningEffort?: string;
      enableClaudeInChrome?: boolean;
      interactionMode?: string;
      cwd?: string;
      toolSessionId?: string;
      checkpointContext?: GitCheckpointContext;
      imageUrls?: string[];
    };

    const conn = this.parseConnection(session.connection);
    const deliveryResult = sessionRouter.send(sessionId, command, {
      expectedHomeRuntimeId: conn.runtimeInstanceId,
      organizationId: session.organizationId,
    });
    if (deliveryResult !== "delivered") {
      return deliveryResult;
    }

    const boundRuntime = sessionRouter.getRuntimeForSession(sessionId);
    const resumedSessionStatus = getRunningSessionStatus(session.sessionStatus);
    const updatedSession = await prisma.session.update({
      where: { id: sessionId },
      data: {
        agentStatus: "active",
        sessionStatus: resumedSessionStatus,
        pendingRun: pendingRunValue(remainingCommands),
        connection: this.mergeConnection(session.connection, {
          state: "connected",
          lastSeen: new Date().toISOString(),
          lastError: undefined,
          autoRetryable: true,
          ...(boundRuntime && {
            runtimeInstanceId: boundRuntime.id,
            runtimeLabel: boundRuntime.label,
          }),
        }),
      },
      include: SESSION_INCLUDE,
    });
    const sessionGroup = await this.syncGroupWorkspaceState(updatedSession.sessionGroupId, {
      connection: updatedSession.connection as Prisma.InputJsonValue,
      worktreeDeleted: false,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_resumed",
      payload: {
        sessionId,
        clientSource: normalizeClientSource(pending.clientSource),
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId: "system",
    });

    return "delivered";
  }

  private async loadQueuedMessageClientSource(
    sessionId: string,
    queuedMessageId: string,
  ): Promise<string | null> {
    const events = await prisma.event.findMany({
      where: {
        scopeType: "session",
        scopeId: sessionId,
        eventType: "queued_message_added",
      },
      orderBy: { timestamp: "desc" },
      take: 20,
    });

    for (const event of events) {
      if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload))
        continue;
      const payload = event.payload as Record<string, unknown>;
      const queuedMessage = payload.queuedMessage;
      if (!queuedMessage || typeof queuedMessage !== "object" || Array.isArray(queuedMessage)) {
        continue;
      }
      if ((queuedMessage as Record<string, unknown>).id !== queuedMessageId) continue;
      return normalizeClientSource(
        typeof payload.clientSource === "string" ? payload.clientSource : null,
      );
    }

    return null;
  }

  private async persistConnectionFailure(
    sessionId: string,
    organizationId: string,
    deliveryResult: DeliveryResult,
    operation: string,
  ) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        agentStatus: true,
        sessionStatus: true,
        worktreeDeleted: true,
        tool: true,
        hosting: true,
        connection: true,
        sessionGroupId: true,
      },
    });
    if (
      session &&
      isFullyUnloadedSession(session.agentStatus, session.sessionStatus, session.worktreeDeleted)
    ) {
      return;
    }
    const conn = this.parseConnection(session?.connection);

    const homeOffline = deliveryResult === "runtime_disconnected" && !!conn.runtimeInstanceId;
    const unsupportedHomeTool = deliveryResult === "no_runtime" && !!conn.runtimeInstanceId;
    const bridgeLabel = conn.runtimeLabel ?? "The selected bridge";
    const lastError = homeOffline
      ? conn.runtimeLabel
        ? `${conn.runtimeLabel} is offline — use Move to continue on another bridge`
        : "The original bridge is offline — use Move to continue on another bridge"
      : unsupportedHomeTool
        ? session?.tool === "pi"
          ? `${bridgeLabel} does not have Pi installed. Install it with \`${PI_INSTALL_COMMAND}\`, then restart the bridge. Docs: ${PI_INSTALL_DOCS_URL}`
          : `${bridgeLabel} does not support ${session?.tool ?? "this coding tool"}`
        : `${operation}: ${deliveryResult}`;
    const updated: SessionConnectionData = {
      ...conn,
      state: "disconnected",
      lastError,
      lastDeliveryFailureAt: new Date().toISOString(),
      retryCount: conn.retryCount + 1,
      canRetry: true,
      canMove: true,
      // Don't spin the auto-retry loop for a non-transient failure.
      autoRetryable: session?.hosting !== "cloud" && !homeOffline && !unsupportedHomeTool,
    };

    await prisma.session.update({
      where: { id: sessionId },
      data: { connection: connJson(updated) },
    });
    const sessionGroup = await this.syncGroupWorkspaceState(session?.sessionGroupId, {
      connection: connJson(updated),
    });

    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "connection_lost",
        reason: deliveryResult,
        operation,
        connection: connJson(updated),
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId: "system",
    });
  }

  async cleanupIdleCloudSessionGroups(options: {
    idleAfterMs: number;
    now?: number;
    batchSize?: number;
  }): Promise<{ scanned: number; cleaned: string[] }> {
    const idleAfterMs = Math.max(1, Math.floor(options.idleAfterMs));
    const now = options.now ?? Date.now();
    const cutoff = new Date(now - idleAfterMs);
    const batchSize = Math.max(1, Math.min(options.batchSize ?? 25, 100));

    const groups: IdleCloudSessionGroupCandidate[] = await prisma.sessionGroup.findMany({
      where: {
        archivedAt: null,
        worktreeDeleted: false,
        sessions: {
          some: { hosting: "cloud" },
          none: {
            OR: [
              { agentStatus: "active" },
              { lastMessageAt: { gt: cutoff } },
              { lastUserMessageAt: { gt: cutoff } },
              {
                lastMessageAt: null,
                lastUserMessageAt: null,
                createdAt: { gt: cutoff },
              },
            ],
          },
        },
      },
      select: {
        id: true,
        organizationId: true,
        updatedAt: true,
        workdir: true,
        connection: true,
        sessions: {
          select: {
            id: true,
            hosting: true,
            agentStatus: true,
            sessionStatus: true,
            createdAt: true,
            lastUserMessageAt: true,
            lastMessageAt: true,
            updatedAt: true,
            connection: true,
          },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        },
      },
      orderBy: { updatedAt: "asc" },
      take: batchSize,
    });

    const cleaned: string[] = [];
    for (const group of groups) {
      const latestActivity = group.sessions.reduce<Date>((latest, session) => {
        const sessionActivity =
          session.lastMessageAt ?? session.lastUserMessageAt ?? session.createdAt;
        return sessionActivity > latest ? sessionActivity : latest;
      }, new Date(0));
      if (latestActivity > cutoff) continue;

      const groupConnection = this.parseConnection(group.connection);
      const groupHasRuntimeBinding =
        !!group.workdir ||
        !!groupConnection.runtimeInstanceId ||
        !!groupConnection.providerRuntimeId;
      const cloudSessions = group.sessions.filter((session) => session.hosting === "cloud");
      if (cloudSessions.some((session) => session.agentStatus === "active")) continue;
      const cloudSession =
        cloudSessions.find((session) => {
          const sessionConnection = this.parseConnection(session.connection);
          return !!sessionConnection.runtimeInstanceId || !!sessionConnection.providerRuntimeId;
        }) ?? cloudSessions[0];
      if (!cloudSession) continue;
      if (!groupHasRuntimeBinding) {
        const sessionConnection = this.parseConnection(cloudSession.connection);
        const sessionHasRuntimeBinding =
          !!sessionConnection.runtimeInstanceId || !!sessionConnection.providerRuntimeId;
        if (!sessionHasRuntimeBinding) continue;
      }

      // Skip groups whose runtime compute is already torn down. Such groups
      // keep matching this idle query forever (the binding ids linger), so
      // re-stopping them only re-emits stopping/stopped events every sweep.
      // Evaluated against the already-fetched candidate connection so dead
      // groups cost no extra query; the same predicate is re-checked
      // race-safely inside the conditional update below.
      if (isRuntimeComputeGone(this.parseConnection(cloudSession.connection))) continue;

      // Never reap a runtime that is still coming up. Reviving an idle group
      // provisions fresh compute without a new message, so the group keeps
      // matching this idle query while its runtime boots — without this guard
      // the sweep kills it mid image-pull and the group can never be revived.
      // Re-checked race-safely inside the conditional update below.
      if (isRuntimeStartingWithinGrace(this.parseConnection(cloudSession.connection), now)) continue;

      const cleanedRuntime = await this.deprovisionIdleCloudSessionGroupRuntime(
        group,
        cloudSession,
        now,
      );
      if (!cleanedRuntime) continue;

      cleaned.push(group.id);
    }

    return { scanned: groups.length, cleaned };
  }

  private async deprovisionIdleCloudSessionGroupRuntime(
    group: IdleCloudSessionGroupCandidate,
    cloudSession: IdleCloudSessionGroupCandidate["sessions"][number],
    now: number,
  ): Promise<boolean> {
    const disconnectFlagged = await this.updateConnectionConditional(cloudSession.id, (conn) => {
      // The runtime's compute is already gone. Re-stopping it would just
      // re-emit stopping/stopped events on every idle sweep without ever
      // settling, since an idle group is re-selected each tick.
      if (isRuntimeComputeGone(conn)) return null;
      // A runtime that began starting up between selection and this update must
      // not be torn down mid-boot; leave it for a later sweep once it settles.
      if (isRuntimeStartingWithinGrace(conn, now)) return null;
      return {
        ...conn,
        disconnectOnDeprovision: true,
        disconnectReason: "idle_session_group_cleanup",
      };
    });
    if (!disconnectFlagged) return false;

    const session = await prisma.session.findUnique({
      where: { id: cloudSession.id },
      select: {
        organizationId: true,
        hosting: true,
        workdir: true,
        repoId: true,
        connection: true,
        sessionGroupId: true,
      },
    });
    if (!session) return false;

    const runtimeSession = await this.withGroupRuntimeState(session);

    // Final race guard: a restart can provision a fresh runtime between our flag
    // above and this teardown. Flagging is version-checked, but the flag lands
    // before the restart's start_requested, so it doesn't conflict — and killing
    // the runtime now would reap what the user just started. Re-read immediately
    // before destroying; if the session re-entered a startup state, bail out and
    // clear the now-stale flag so a later sweep (or the restart itself) settles it.
    const latest = await prisma.session.findUnique({
      where: { id: cloudSession.id },
      select: { connection: true },
    });
    if (latest && isRuntimeStartingWithinGrace(this.parseConnection(latest.connection), now)) {
      await this.updateConnectionConditional(cloudSession.id, (conn) => {
        if (conn.disconnectOnDeprovision !== true) return null;
        return { ...conn, disconnectOnDeprovision: false, disconnectReason: undefined };
      });
      return false;
    }

    terminalRelay.destroyAllForSessionGroup(group.id);
    try {
      await sessionRouter.destroyRuntime(
        cloudSession.id,
        runtimeSession,
        this.destroyRuntimeOptions(cloudSession.id, "idle_session_group_cleanup"),
      );
      // Destroying the runtime kills any forwarded application processes; reflect that.
      await sessionApplicationService.markSessionGroupRuntimeStopped(
        group.id,
        session.organizationId,
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[session-service] failed to deprovision idle cloud runtime for group ${group.id}: ${message}`,
      );
      return false;
    }
  }

  /**
   * Fully unload a session's runtime resources.
   * When `isGroupUnload` is true, destroys all group terminals and the shared runtime.
   * When false (single session), only destroys that session's terminals and checks
   * whether siblings are still active before touching group resources.
   */
  private async fullyUnloadSession(
    sessionId: string,
    isGroupUnload = false,
    reason = "session_unloaded",
  ): Promise<boolean> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        organizationId: true,
        hosting: true,
        workdir: true,
        repoId: true,
        connection: true,
        sessionGroupId: true,
      },
    });
    if (!session) return false;

    const destroyOptions = this.destroyRuntimeOptions(sessionId, reason);
    await this.resetReconcileState(sessionId);

    if (isGroupUnload && session.sessionGroupId) {
      const runtimeSession = await this.withGroupRuntimeState(session);

      // Group-level unload: destroy all terminals and the shared runtime
      terminalRelay.destroyAllForSessionGroup(session.sessionGroupId);
      try {
        await sessionRouter.destroyRuntime(sessionId, runtimeSession, destroyOptions);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[session-service] failed to unload group via session ${sessionId}: ${message}`,
        );
        return false;
      }
      await this.syncGroupWorkspaceState(session.sessionGroupId, {
        workdir: null,
        worktreeDeleted: true,
      });
      return true;
    }

    // Single-session unload: only destroy this session's terminals
    terminalRelay.destroyAllForSession(sessionId);

    if (session.sessionGroupId) {
      // Check whether any siblings are still active before touching group resources
      const activeSiblingCount = await prisma.session.count({
        where: {
          sessionGroupId: session.sessionGroupId,
          id: { not: sessionId },
          agentStatus: { notIn: [...FULLY_UNLOADED_AGENT_STATUSES] },
          sessionStatus: { not: "merged" },
        },
      });

      if (activeSiblingCount === 0) {
        // Last session in the group — tear down the shared runtime
        const runtimeSession = await this.withGroupRuntimeState(session);
        try {
          await sessionRouter.destroyRuntime(sessionId, runtimeSession, destroyOptions);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[session-service] failed to unload session ${sessionId}: ${message}`);
          return false;
        }
        await this.syncGroupWorkspaceState(session.sessionGroupId, {
          workdir: null,
          worktreeDeleted: true,
        });
        return true;
      }
      return false;
    } else {
      // No group — just destroy the runtime
      try {
        await sessionRouter.destroyRuntime(sessionId, session, destroyOptions);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[session-service] failed to unload session ${sessionId}: ${message}`);
        return false;
      }
      return true;
    }
  }

  private async withGroupRuntimeState<
    T extends {
      sessionGroupId?: string | null;
      workdir?: string | null;
      repoId?: string | null;
      connection?: unknown;
    },
  >(session: T): Promise<T> {
    if (!session.sessionGroupId) return session;

    const groupRuntime = await prisma.sessionGroup.findUnique({
      where: { id: session.sessionGroupId },
      select: { workdir: true, repoId: true, connection: true },
    });

    if (!groupRuntime) return session;

    return {
      ...session,
      workdir: groupRuntime.workdir ?? session.workdir,
      repoId: groupRuntime.repoId ?? session.repoId,
      connection: groupRuntime.connection ?? session.connection,
    };
  }

  /** Set prUrl on the active session group when a PR is opened for its current branch. */
  async markPrOpened(params: {
    sessionGroupId: string;
    eventSessionId: string;
    prUrl: string;
    organizationId: string;
    actorId?: string;
  }) {
    const {
      sessionGroupId,
      eventSessionId,
      prUrl,
      organizationId,
      actorId = "github-webhook",
    } = params;

    const group = await prisma.sessionGroup.findUnique({
      where: { id: sessionGroupId },
      select: { prUrl: true },
    });
    if (group?.prUrl === prUrl) return;

    // Transition all non-merged, non-needs-input sessions in the group to in_review.
    await prisma.session.updateMany({
      where: { sessionGroupId, sessionStatus: { notIn: ["merged", "needs_input"] } },
      data: { sessionStatus: "in_review" },
    });

    const sessionGroup = await this.syncGroupWorkspaceState(sessionGroupId, {
      prUrl,
    });

    if (!sessionGroup) return;

    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: eventSessionId,
      eventType: "session_pr_opened",
      payload: { sessionId: eventSessionId, prUrl, sessionStatus: "in_review", sessionGroup },
      actorType: "system",
      actorId,
    });
  }

  async syncPrObservation(params: {
    sessionId: string;
    runtimeInstanceId: string;
    organizationId: string;
    ownerUserId: string;
    branch: string | null;
    observedAt: string;
    pr: { url: string; state: "OPEN" | "CLOSED" | "MERGED"; merged: boolean } | null;
    error?: string | null;
    actorId?: string;
  }) {
    const {
      sessionId,
      runtimeInstanceId,
      organizationId,
      ownerUserId,
      branch,
      observedAt,
      pr,
      error,
      actorId = "github-bridge-poll",
    } = params;
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        hosting: true,
        organizationId: true,
        connection: true,
        sessionGroupId: true,
        sessionGroup: {
          select: {
            id: true,
            branch: true,
            connection: true,
            prUrl: true,
            sessions: {
              select: { id: true },
              orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
              take: 1,
            },
          },
        },
      },
    });

    if (
      !session ||
      session.hosting !== "local" ||
      session.organizationId !== organizationId ||
      !session.sessionGroupId ||
      !session.sessionGroup
    ) {
      return;
    }

    const boundRuntimeId =
      this.getConnectionRuntimeInstanceId(session.connection) ??
      this.getConnectionRuntimeInstanceId(session.sessionGroup.connection);
    if (!boundRuntimeId || boundRuntimeId !== runtimeInstanceId) {
      return;
    }

    const runtime = sessionRouter.getRuntime(runtimeInstanceId);
    if (runtime?.ownerUserId && runtime.ownerUserId !== ownerUserId) {
      return;
    }

    const branchMismatch =
      branch && session.sessionGroup.branch && branch !== session.sessionGroup.branch
        ? `Observed branch ${branch} does not match tracked branch ${session.sessionGroup.branch}`
        : null;
    const eventSessionId = session.sessionGroup.sessions?.[0]?.id ?? session.id;

    await prisma.sessionGroup.update({
      where: { id: session.sessionGroupId },
      data: {
        prSyncObservedAt: new Date(observedAt),
        prSyncError: error ?? branchMismatch,
      },
    });

    if (error || branchMismatch || !pr) return;

    if (pr.state === "OPEN") {
      await this.markPrOpened({
        sessionGroupId: session.sessionGroupId,
        eventSessionId,
        prUrl: pr.url,
        organizationId: session.organizationId,
        actorId,
      });
      return;
    }

    if (!session.sessionGroup.prUrl || session.sessionGroup.prUrl !== pr.url) {
      return;
    }

    if (pr.state === "CLOSED" && !pr.merged) {
      await this.markPrClosed({
        sessionGroupId: session.sessionGroupId,
        eventSessionId,
        prUrl: pr.url,
        organizationId: session.organizationId,
        actorId,
      });
      return;
    }

    if (pr.state === "MERGED" || pr.merged) {
      await this.markPrMerged({
        sessionGroupId: session.sessionGroupId,
        eventSessionId,
        prUrl: pr.url,
        organizationId: session.organizationId,
        actorId,
      });
    }
  }

  /** Clear prUrl on the active session group when its current PR is closed without merging. */
  async markPrClosed(params: {
    sessionGroupId: string;
    eventSessionId: string;
    prUrl: string;
    organizationId: string;
    actorId?: string;
  }) {
    const {
      sessionGroupId,
      eventSessionId,
      prUrl,
      organizationId,
      actorId = "github-webhook",
    } = params;

    const group = await prisma.sessionGroup.findUnique({
      where: { id: sessionGroupId },
      select: { prUrl: true },
    });
    if (!group?.prUrl || group.prUrl !== prUrl) return;

    const sessionGroup = await this.syncGroupWorkspaceState(sessionGroupId, {
      prUrl: null,
    });

    if (!sessionGroup) return;

    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: eventSessionId,
      eventType: "session_pr_closed",
      payload: { sessionId: eventSessionId, sessionGroup },
      actorType: "system",
      actorId,
    });
  }

  /** Archive a session group: stop agents, unload worktree, mark as archived. */
  async archiveGroup(
    groupId: string,
    organizationId: string,
    actorType: ActorType = "system",
    actorId: string = "system",
  ) {
    if (actorId !== "system") {
      await assertSessionGroupAccess(groupId, actorId, organizationId);
    }
    const group = await prisma.sessionGroup.findUnique({
      where: { id: groupId },
      include: {
        sessions: {
          select: { id: true, lastMessageAt: true },
          orderBy: { updatedAt: "desc" },
        },
      },
    });
    if (!group) throw new Error("Session group not found");
    if (group.organizationId !== organizationId) throw new Error("Session group not found");

    const hasConversation = group.sessions.some((session) => session.lastMessageAt !== null);
    if (!hasConversation) {
      await this.deleteGroup(groupId, organizationId, actorType, actorId, {
        deletionReason: "archived_empty_group",
        sourceAction: "archive",
      });
      return null;
    }

    // Stop all active agents
    await prisma.session.updateMany({
      where: { sessionGroupId: groupId, agentStatus: "active" },
      data: { agentStatus: "stopped" },
    });

    // Mark as archived
    await prisma.sessionGroup.update({
      where: { id: groupId },
      data: { archivedAt: new Date() },
    });

    for (const session of group.sessions) {
      await inboxService.resolveBySource({
        sourceType: "session",
        sourceId: session.id,
        orgId: organizationId,
        resolution: "session_archived",
      });
    }

    // fullyUnloadSession reads workdir from DB before nullifying it, and calls syncGroupWorkspaceState internally.
    const latestSessionId = group.sessions[0]?.id;
    if (latestSessionId) {
      await this.fullyUnloadSession(latestSessionId, true);
    } else {
      await this.syncGroupWorkspaceState(groupId, {
        workdir: null,
        worktreeDeleted: true,
      });
    }

    // Destroying the runtime kills any forwarded application processes; reflect that.
    await sessionApplicationService.markSessionGroupRuntimeStopped(groupId, organizationId);

    const sessionGroup = await this.loadSessionGroupSnapshot(groupId);

    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: latestSessionId ?? groupId,
      eventType: "session_group_archived",
      payload: {
        sessionGroupId: groupId,
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType,
      actorId,
    });

    return sessionGroup;
  }

  /** Transition all sessions in the group to merged when the group's PR is merged. */
  async markPrMerged(params: {
    sessionGroupId: string;
    eventSessionId: string;
    prUrl: string;
    organizationId: string;
    actorId?: string;
  }) {
    const {
      sessionGroupId,
      eventSessionId,
      prUrl,
      organizationId,
      actorId = "github-webhook",
    } = params;

    const group = await prisma.sessionGroup.findUnique({
      where: { id: sessionGroupId },
      select: { prUrl: true },
    });
    if (group?.prUrl && group.prUrl !== prUrl) return;

    // Only auto-archive if every distinct session creator in the group has opted in.
    // A single opt-out preserves the worktree so the dissenting user's preference wins.
    const groupCreators = await prisma.session.findMany({
      where: { sessionGroupId },
      select: { createdBy: { select: { autoArchiveMergedSessions: true } } },
      distinct: ["createdById"],
    });
    const shouldAutoArchive =
      groupCreators.length > 0 &&
      groupCreators.every(
        (entry: { createdBy: { autoArchiveMergedSessions: boolean } }) =>
          entry.createdBy.autoArchiveMergedSessions,
      );

    // Transition ALL sessions in the group to merged, not just the event session
    const { count } = await prisma.session.updateMany({
      where: { sessionGroupId, sessionStatus: { not: "merged" } },
      data: { agentStatus: "done", sessionStatus: "merged" },
    });

    if (count === 0) return;

    // Preserve the worktree path through runtime teardown so the bridge can
    // remove the on-disk worktree before we clear it from persisted state.
    await this.syncGroupWorkspaceState(sessionGroupId, { prUrl });

    const worktreeDeleted = shouldAutoArchive
      ? await this.fullyUnloadSession(eventSessionId, true)
      : false;
    const sessionGroup = await this.loadSessionGroupSnapshot(sessionGroupId);

    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: eventSessionId,
      eventType: "session_pr_merged",
      payload: {
        sessionId: eventSessionId,
        prUrl,
        agentStatus: "done",
        sessionStatus: "merged",
        worktreeDeleted,
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId,
    });
  }
}

export const sessionService = new SessionService();

setBridgeAccessApprovedHandler((input) => sessionService.resumePendingBridgeAccessSessions(input));
