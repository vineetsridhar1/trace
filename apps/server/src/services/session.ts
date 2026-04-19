import type { StartSessionInput, ActorType } from "@trace/gql";
import type { AgentStatus, SessionStatus, CodingTool } from "@prisma/client";
import type { EventType } from "@trace/gql";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import {
  getDefaultModel,
  hasQuestionBlock,
  hasPlanBlock,
  isSupportedModel,
  type GitCheckpointBridgePayload,
  type GitCheckpointContext,
} from "@trace/shared";
import { prisma } from "../lib/db.js";
import { AuthorizationError } from "../lib/errors.js";
import { eventService } from "./event.js";
import {
  sessionRouter,
  type DeliveryResult,
  type RuntimeInstance,
} from "../lib/session-router.js";
import { inboxService } from "./inbox.js";
import { runtimeDebug } from "../lib/runtime-debug.js";
import { terminalRelay } from "../lib/terminal-relay.js";
import { storage } from "../lib/storage/index.js";
import { runtimeAccessService } from "./runtime-access.js";
import {
  deriveSessionGroupStatus,
  type SessionGroupStatus as DerivedSessionGroupStatus,
  type SessionGroupStatusSource,
} from "../lib/session-group-status.js";

export type StartSessionServiceInput = StartSessionInput & {
  sessionGroupId?: string | null;
  sourceSessionId?: string | null;
  organizationId: string;
  createdById: string;
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
  state: "connected" | "degraded" | "disconnected";
  runtimeInstanceId?: string;
  runtimeLabel?: string;
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

type PendingSessionCommand =
  | {
      type: "run";
      prompt?: string | null;
      interactionMode?: string | null;
      checkpointContext?: GitCheckpointContext | null;
    }
  | {
      type: "send";
      prompt: string;
      interactionMode?: string | null;
      checkpointContext?: GitCheckpointContext | null;
      imageKeys?: string[] | null;
    };

type GroupWorkspaceStatePatch = {
  workdir?: string | null;
  connection?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | null;
  prUrl?: string | null;
  worktreeDeleted?: boolean;
  repoId?: string | null;
  branch?: string | null;
  slug?: string | null;
  setupStatus?: "idle" | "running" | "completed" | "failed";
  setupError?: string | null;
};

function defaultConnection(overrides?: Partial<SessionConnectionData>): SessionConnectionData {
  return {
    state: "connected",
    retryCount: 0,
    canRetry: true,
    canMove: true,
    ...overrides,
  };
}

function getIdleSessionStatus(sessionStatus?: SessionStatus | null): SessionStatus {
  return sessionStatus === "in_review" ? "in_review" : "in_progress";
}

function getIdleAgentStatus(agentStatus?: AgentStatus | null): AgentStatus {
  return agentStatus === "not_started" ? "not_started" : "done";
}

/** Cast connection data to Prisma-compatible JSON */
function connJson(data: SessionConnectionData): Prisma.InputJsonValue {
  return data as unknown as Prisma.InputJsonValue;
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
  slug: true,
  channelId: true,
  channel: true,
  repoId: true,
  repo: true,
  branch: true,
  workdir: true,
  connection: true,
  prUrl: true,
  worktreeDeleted: true,
  archivedAt: true,
  setupStatus: true,
  setupError: true,
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

type SessionGroupSnapshot = SessionGroupSummary & {
  status: DerivedSessionGroupStatus;
};

/** A session row with the fields needed by both SessionGroupStatusSource and sortSessionsByRecency. */
type SessionWithTimestamps = SessionGroupStatusSource & {
  updatedAt: Date;
  createdAt: Date;
  lastMessageAt?: Date | null;
};

const INVALID_FILE_PATH_ERROR = "Invalid file path";
const LOCAL_FILE_ACCESS_DENIED_ERROR =
  "Access denied: you do not have permission to access files on this local bridge";

function serializeSession(session: {
  id: string;
  name: string;
  agentStatus: AgentStatus;
  sessionStatus: SessionStatus;
  tool: string;
  model: string | null;
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
    const aRecency = (a.lastMessageAt ?? a.updatedAt).getTime();
    const bRecency = (b.lastMessageAt ?? b.updatedAt).getTime();
    const recencyDiff = bRecency - aRecency;
    if (recencyDiff !== 0) return recencyDiff;
    const updatedDiff = b.updatedAt.getTime() - a.updatedAt.getTime();
    if (updatedDiff !== 0) return updatedDiff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

function buildSessionGroupSnapshot(
  group: SessionGroupSummary,
  sessions: SessionGroupStatusSource[],
): SessionGroupSnapshot {
  return {
    ...group,
    status: deriveSessionGroupStatus(sessions, group.prUrl ?? null, group.archivedAt ?? null),
  };
}

/** Maximum length for session names (prompt-derived or title-tag-extracted). */
const MAX_SESSION_NAME_LENGTH = 80;

/** Instruction appended to every session prompt so the AI can set or update the title at any time. */
const TITLE_INSTRUCTION = `\n\n<system-instruction>
You may set or update the session title by outputting a short title (5-8 words) wrapped in XML tags: <trace-title>Your title here</trace-title>.
Do this ONCE at the start of your very first response to capture the overall goal of the session. After that, do NOT update the title unless the user explicitly asks you to rename/retitle it. Debugging, iterating, or continuing work on the same goal is not a reason to change the title. The tag will be stripped and not shown to the user.
</system-instruction>`;

/** Instruction appended to repo-based sessions so the AI reports branch name changes. */
const BRANCH_INSTRUCTION = `\n\n<system-instruction>
When you create or rename a git branch, output the branch name wrapped in XML tags: <trace-branch>branch-name</trace-branch>.
This lets the system track which branch this session is working on. The tag will be stripped and not shown to the user.
</system-instruction>`;

/** Instruction appended to every prompt for repo-based sessions so the AI auto-saves work. */
const AUTO_SAVE_INSTRUCTION = `\n\n<system-instruction>
After completing each task, silently save your work to the remote:
1. Stage all changes: git add -A
2. Commit with a short, descriptive message summarizing what changed (skip if nothing staged)
3. Push: git push origin HEAD
Do this silently — do not mention it to the user unless they ask or it fails.
If the user asks you to stop auto-saving or disable auto-save, stop doing this for the rest of the session.
</system-instruction>`;

function appendAutoSave(prompt: string, hasRepo: boolean): string {
  return hasRepo ? prompt + AUTO_SAVE_INSTRUCTION : prompt;
}

/** Append all system instructions (title, branch, auto-save) to a prompt in the correct order. */
function appendPromptInstructions(prompt: string, { hasRepo }: { hasRepo: boolean }): string {
  let result = prompt + TITLE_INSTRUCTION;
  if (hasRepo) result += BRANCH_INSTRUCTION;
  result = appendAutoSave(result, hasRepo);
  return result;
}

function buildBaseBranchInstruction(baseBranch: string, repoDefaultBranch: string): string {
  return `\n\n<system-instruction>
This channel overrides the repository's default branch. Work off "${baseBranch}" instead of "${repoDefaultBranch}": branch from origin/${baseBranch}, ensure pushes are based on it, and when opening a pull request set the base/target branch to "${baseBranch}" — do NOT target "${repoDefaultBranch}" or main.
</system-instruction>`;
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
  const events = await prisma.event.findMany({
    where: {
      scopeId: sessionId,
      scopeType: "session",
      eventType: { in: ["session_started", "message_sent", "session_output"] },
    },
    orderBy: { timestamp: "asc" },
  });

  const lines: string[] = [];

  for (const evt of events) {
    const payload = evt.payload as Record<string, unknown>;

    if (evt.eventType === "session_started") {
      const prompt = payload.prompt as string | undefined;
      if (prompt) lines.push(`[User]: ${prompt}`);
      continue;
    }

    if (evt.eventType === "message_sent") {
      const text = payload.text as string | undefined;
      if (text) lines.push(`[User]: ${text}`);
      continue;
    }

    // Assistant output — extract only text blocks, skip tool calls
    if (payload.type === "assistant") {
      const message = payload.message as Record<string, unknown> | undefined;
      const content = message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          lines.push(`[Assistant]: ${b.text}`);
        }
      }
    }
  }

  if (lines.length === 0) return null;
  return `<conversation-history>\nThe following is the conversation history from a previous coding tool in this session. Use it as context.\n\n${lines.join("\n\n")}\n</conversation-history>`;
}

function buildMigrationPrompt(context: string | null): string {
  if (!context) {
    return "Continue this session on the new runtime.";
  }
  return `${context}\n\nContinue this session on the new runtime.`;
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
  if (!isSupportedModel(tool, model)) {
    throw new Error(`Unsupported model "${model}" for tool "${tool}"`);
  }
  return model;
}

const FULLY_UNLOADED_AGENT_STATUSES: readonly AgentStatus[] = ["failed", "stopped"];

export function isFullyUnloadedSession(
  agentStatus: AgentStatus,
  sessionStatus: SessionStatus,
): boolean {
  return FULLY_UNLOADED_AGENT_STATUSES.includes(agentStatus) || sessionStatus === "merged";
}

export class SessionService {
  /**
   * Encapsulates the common createRuntime call used by startSession, run, and sendMessage.
   * Resolves repo/branch/hosting and delegates to the session router.
   */
  private provisionRuntime(params: {
    sessionId: string;
    sessionGroupId?: string | null;
    slug?: string | null;
    hosting: string;
    tool: string;
    model?: string | null;
    repo?: { id: string; name: string; remoteUrl: string; defaultBranch: string } | null;
    branch?: string | null;
    checkpointSha?: string | null;
    createdById: string;
    organizationId: string;
    readOnly?: boolean;
  }): void {
    sessionRouter.createRuntime({
      sessionId: params.sessionId,
      sessionGroupId: params.sessionGroupId ?? undefined,
      slug: params.slug ?? undefined,
      hosting: params.hosting as "cloud" | "local",
      tool: params.tool,
      model: params.model ?? undefined,
      repo: params.repo
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
      onFailed: (error) => this.workspaceFailed(params.sessionId, error),
      onWorkspaceReady: (workdir) => this.workspaceReady(params.sessionId, workdir),
    });
  }

  private async assertRuntimeAccess(params: {
    userId: string;
    organizationId: string;
    runtimeInstanceId?: string | null;
    sessionGroupId?: string | null;
    failureMessage?: string;
  }): Promise<void> {
    try {
      await runtimeAccessService.assertAccess({
        userId: params.userId,
        organizationId: params.organizationId,
        runtimeInstanceId: params.runtimeInstanceId,
        sessionGroupId: params.sessionGroupId,
      });
    } catch (error) {
      if (params.failureMessage && error instanceof Error) {
        throw new Error(params.failureMessage);
      }
      throw error;
    }
  }

  private async resolveDefaultAccessibleLocalRuntime(params: {
    userId: string;
    organizationId: string;
    tool: string;
    repoId?: string | null;
    sessionGroupId?: string | null;
  }): Promise<RuntimeInstance | undefined> {
    const accessibleRuntimeIds = await runtimeAccessService.listAccessibleRuntimeInstanceIds({
      userId: params.userId,
      organizationId: params.organizationId,
      sessionGroupId: params.sessionGroupId,
    });

    for (const runtime of sessionRouter.listRuntimes({ hostingMode: "local" })) {
      if (!accessibleRuntimeIds.has(runtime.id)) continue;
      if (!runtime.supportedTools.includes(params.tool)) continue;
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
    tool: string;
    repoId?: string | null;
    connection: unknown;
    failureMessage?: string;
  }): Promise<{ runtimeId: string | null; runtimeLabel: string | null }> {
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
      const runtime = sessionRouter.getRuntime(conn.runtimeInstanceId);
      if (runtime) {
        sessionRouter.bindSession(params.sessionId, runtime.id);
      }
      return {
        runtimeId: conn.runtimeInstanceId,
        runtimeLabel: runtime?.label ?? conn.runtimeLabel ?? null,
      };
    }

    const runtime = await this.resolveDefaultAccessibleLocalRuntime({
      userId: params.userId,
      organizationId: params.organizationId,
      tool: params.tool,
      repoId: params.repoId,
      sessionGroupId: params.sessionGroupId,
    });
    if (!runtime) {
      throw new Error("No accessible local runtime available");
    }

    sessionRouter.bindSession(params.sessionId, runtime.id);
    return {
      runtimeId: runtime.id,
      runtimeLabel: runtime.label,
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

  private async resolveAccessibleSessionGroupRuntime(
    sessionGroupId: string,
    organizationId: string,
    userId: string,
  ): Promise<{ runtimeId: string; sessionId: string; workdirHint?: string }> {
    const group = await prisma.sessionGroup.findFirst({
      where: { id: sessionGroupId, organizationId },
      select: { id: true, workdir: true, worktreeDeleted: true, connection: true },
    });
    if (!group) throw new Error("Session group not found");
    if (group.worktreeDeleted) {
      throw new Error("Cannot access files: session worktree has been deleted");
    }

    const sessions = await prisma.session.findMany({
      where: { sessionGroupId, organizationId },
      select: { id: true, workdir: true, connection: true },
    });

    const resolveSessionRuntimeId = (session: {
      id: string;
      connection: unknown;
    }): string | null =>
      this.getConnectionRuntimeInstanceId(session.connection) ??
      sessionRouter.getRuntimeForSession(session.id)?.id ??
      null;

    const groupRuntimeId = this.getConnectionRuntimeInstanceId(group.connection);
    if (groupRuntimeId) {
      await this.assertRuntimeAccess({
        userId,
        organizationId,
        runtimeInstanceId: groupRuntimeId,
        sessionGroupId,
        failureMessage: LOCAL_FILE_ACCESS_DENIED_ERROR,
      });

      const runtime = sessionRouter.getRuntime(groupRuntimeId);
      if (!runtime) {
        throw new Error("No connected runtime available for this session group");
      }

      const sessionOnGroupRuntime = sessions.find(
        (session: { id: string; workdir: string | null; connection: unknown }) =>
          resolveSessionRuntimeId(session) === groupRuntimeId,
      );
      if (!sessionOnGroupRuntime) {
        throw new Error("No session is bound to the current session group runtime");
      }

      return {
        runtimeId: runtime.id,
        sessionId: sessionOnGroupRuntime.id,
        workdirHint: sessionOnGroupRuntime.workdir ?? group.workdir ?? undefined,
      };
    }

    let accessDenied = false;
    for (const session of sessions) {
      const runtimeId = resolveSessionRuntimeId(session);
      if (!runtimeId) continue;
      try {
        await this.assertRuntimeAccess({
          userId,
          organizationId,
          runtimeInstanceId: runtimeId,
          sessionGroupId,
          failureMessage: LOCAL_FILE_ACCESS_DENIED_ERROR,
        });
      } catch (error) {
        if (error instanceof Error && error.message === LOCAL_FILE_ACCESS_DENIED_ERROR) {
          accessDenied = true;
          continue;
        }
        throw error;
      }
      const runtime = sessionRouter.getRuntime(runtimeId);
      if (!runtime) continue;
      return {
        runtimeId: runtime.id,
        sessionId: session.id,
        workdirHint: session.workdir ?? group.workdir ?? undefined,
      };
    }

    if (accessDenied) {
      throw new Error(LOCAL_FILE_ACCESS_DENIED_ERROR);
    }
    throw new Error("No connected runtime available for this session group");
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

  private async resolveLinkedCheckoutRuntime(
    sessionGroupId: string,
    repoId: string,
    organizationId: string,
    userId: string,
  ): Promise<string> {
    const group = await prisma.sessionGroup.findFirst({
      where: { id: sessionGroupId, organizationId },
      select: {
        id: true,
        repoId: true,
        connection: true,
        sessions: {
          select: {
            id: true,
            repoId: true,
          },
        },
      },
    });
    if (!group) throw new Error("Session group not found");

    const repoMatchesGroup =
      group.repoId === repoId ||
      group.sessions.some((session: { repoId: string | null }) => session.repoId === repoId);
    if (!repoMatchesGroup) {
      throw new Error("Session group is not associated with this repo");
    }

    // Linked checkout is tied to the session group's shared workspace runtime,
    // not whichever child session happens to be selected in the UI.
    const runtimeId = this.getConnectionRuntimeInstanceId(group.connection);

    if (!runtimeId) {
      throw new Error(
        "Linked checkout is only available on session groups backed by a local runtime.",
      );
    }
    await this.assertRuntimeAccess({
      userId,
      organizationId,
      runtimeInstanceId: runtimeId,
      sessionGroupId,
      failureMessage:
        "Linked checkout is only available on session groups backed by a bridge you can access.",
    });

    const runtime = sessionRouter.getRuntime(runtimeId);
    if (!runtime || runtime.hostingMode !== "local" || runtime.ws.readyState !== runtime.ws.OPEN) {
      throw new Error("No connected local runtime available for this session group");
    }

    return runtimeId;
  }

  private async assertRepoExists(repoId: string, organizationId: string): Promise<void> {
    const repo = await prisma.repo.findFirst({
      where: { id: repoId, organizationId },
      select: { id: true },
    });
    if (!repo) throw new Error("Repo not found");
  }

  async listGroups(
    channelId: string,
    organizationId: string,
    options?: { archived?: boolean; status?: string },
  ) {
    const where: Record<string, unknown> = { channelId, organizationId };

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
      // Default main table: exclude merged groups (server-side)
      filtered = mapped.filter((g: MappedGroup) => g.status !== "merged");
    }

    return filtered.sort((a: MappedGroup, b: MappedGroup) => {
      const aLatest = a.sessions[0];
      const bLatest = b.sessions[0];
      const aTs = aLatest?.lastMessageAt ?? aLatest?.updatedAt ?? a.updatedAt;
      const bTs = bLatest?.lastMessageAt ?? bLatest?.updatedAt ?? b.updatedAt;
      return bTs.getTime() - aTs.getTime();
    });
  }

  async getGroup(id: string, organizationId: string) {
    const group = await prisma.sessionGroup.findFirst({
      where: { id, organizationId },
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

  async list(
    organizationId: string,
    filters?: {
      agentStatus?: string | null;
      tool?: string | null;
      repoId?: string | null;
      channelId?: string | null;
    },
  ) {
    const where: Record<string, unknown> = { organizationId };
    if (filters?.agentStatus) where.agentStatus = filters.agentStatus;
    if (filters?.tool) where.tool = filters.tool;
    if (filters?.repoId) where.repoId = filters.repoId;
    if (filters?.channelId) where.channelId = filters.channelId;
    return prisma.session.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: SESSION_INCLUDE,
    });
  }

  async get(id: string) {
    return prisma.session.findUnique({ where: { id }, include: SESSION_INCLUDE });
  }

  async listByUser(organizationId: string, userId: string, agentStatus?: string | null) {
    const where: Record<string, unknown> = { organizationId, createdById: userId };
    if (agentStatus) where.agentStatus = agentStatus;
    return prisma.session.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: SESSION_INCLUDE,
    });
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

    const model = input.model
      ? validateModelForTool(input.tool, input.model)
      : getDefaultModel(input.tool);

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

    const existingGroupId = input.restoreCheckpointId
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

    const resolvedGroup = existingGroup ?? sourceSession?.sessionGroup ?? null;
    const seedGroup = input.restoreCheckpointId ? restoreGroup : resolvedGroup;
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

    const resolvedRepoId =
      authoritativeChannelRepoId ??
      input.repoId ??
      seedGroup?.repoId ??
      sourceSession?.repoId ??
      restoreCheckpoint?.repoId ??
      undefined;
    const resolvedBranch =
      input.branch ??
      seedGroup?.branch ??
      sourceSession?.branch ??
      resolvedChannel?.baseBranch ??
      undefined;
    const sharedWorkdir = input.restoreCheckpointId ? null : (resolvedGroup?.workdir ?? null);
    const sharedConnection = input.restoreCheckpointId ? null : (resolvedGroup?.connection ?? null);
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

    if (
      existingGroup?.id &&
      sharedRuntimeInstanceId &&
      input.runtimeInstanceId &&
      input.runtimeInstanceId !== sharedRuntimeInstanceId
    ) {
      throw new Error("This session group is already bound to a different runtime");
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

    const name = input.prompt
      ? input.prompt.slice(0, MAX_SESSION_NAME_LENGTH)
      : restoreCheckpoint
        ? `Restore ${shortCommitSha(restoreCheckpoint.commitSha)} ${restoreCheckpoint.subject}`
            .trim()
            .slice(0, MAX_SESSION_NAME_LENGTH)
        : `Session ${new Date().toLocaleString()}`;

    // Resolve hosting mode: if a runtime is specified, derive from it; otherwise use explicit value or default to cloud
    let hosting = input.hosting ?? sourceSession?.hosting ?? "cloud";
    let runtimeLabel: string | undefined;
    let requestedRuntimeInstanceId =
      input.runtimeInstanceId ?? sharedRuntimeInstanceId ?? restoreGroupRuntimeInstanceId ?? null;
    if (input.runtimeInstanceId) {
      const runtime = sessionRouter.getRuntime(input.runtimeInstanceId);
      runtimeDebug("startSession resolving requested runtime", {
        sessionId: "pending",
        runtimeInstanceId: input.runtimeInstanceId,
        requestedHosting: input.hosting ?? null,
        runtimeFoundInRouter: !!runtime,
      });
      if (!runtime) {
        throw new Error("Requested runtime not found");
      }
      await this.assertRuntimeAccess({
        userId: input.createdById,
        organizationId: input.organizationId,
        runtimeInstanceId: input.runtimeInstanceId,
        sessionGroupId: existingGroup?.id ?? null,
      });
      if (
        runtime.hostingMode === "local" &&
        resolvedRepoId &&
        !runtime.registeredRepoIds.includes(resolvedRepoId)
      ) {
        throw new Error("Selected runtime does not have this repo linked");
      }
      hosting = runtime.hostingMode;
      runtimeLabel = runtime.label;
    }

    if (!requestedRuntimeInstanceId && hosting === "local") {
      const defaultLocalRuntime = await this.resolveDefaultAccessibleLocalRuntime({
        userId: input.createdById,
        organizationId: input.organizationId,
        tool: input.tool,
        repoId: resolvedRepoId ?? null,
        sessionGroupId: existingGroup?.id ?? null,
      });
      if (!defaultLocalRuntime) {
        throw new Error("No accessible local runtime available");
      }
      requestedRuntimeInstanceId = defaultLocalRuntime.id;
      runtimeLabel = defaultLocalRuntime.label;
    }

    if (requestedRuntimeInstanceId && !runtimeLabel) {
      runtimeLabel =
        sessionRouter.getRuntime(requestedRuntimeInstanceId)?.label ??
        this.parseConnection(sharedConnection ?? restoreGroup?.connection ?? null).runtimeLabel;
    }

    // Ask-mode sessions skip worktree creation (read-only against repo root).
    // Checkpoint restores always need a worktree to reset to a specific SHA.
    const readOnlyWorkspace = input.interactionMode === "ask" && !input.restoreCheckpointId;

    const needsRuntimeProvisioning =
      !sharedRuntimeInstanceId && !sharedWorkdir && (!!resolvedRepoId || hosting === "cloud");
    const initialConnection = sharedConnection
      ? sharedConnection
      : connJson(
          defaultConnection({
            ...(requestedRuntimeInstanceId && { runtimeInstanceId: requestedRuntimeInstanceId }),
            ...(runtimeLabel && { runtimeLabel }),
          }),
        );

    // Sessions stay idle until a command is actually delivered to the coding tool.
    const initialAgentStatus: AgentStatus = "not_started";
    const initialSessionStatus: SessionStatus = "in_progress";
    const initialCheckpointContextId = resolvedRepoId && input.prompt ? randomUUID() : null;

    const session = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const sessionGroup = existingGroup
        ? await (async () => {
            const nextGroupData: Prisma.SessionGroupUncheckedUpdateInput = {};
            if (resolvedChannelId !== undefined && existingGroup.channelId !== resolvedChannelId) {
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
              organizationId: input.organizationId,
              channelId: resolvedChannelId,
              repoId: resolvedRepoId ?? undefined,
              branch: resolvedBranch ?? undefined,
              connection: initialConnection,
            },
            select: SESSION_GROUP_SUMMARY_SELECT,
          });

      const projectIds = input.projectId != null ? [input.projectId] : sourceProjectIds;

      const session = await tx.session.create({
        data: {
          name,
          agentStatus: initialAgentStatus,
          sessionStatus: initialSessionStatus,
          tool: input.tool,
          model: model ?? undefined,
          hosting,
          organizationId: input.organizationId,
          createdById: input.createdById,
          repoId: resolvedRepoId ?? undefined,
          branch: resolvedBranch ?? undefined,
          workdir: sessionGroup.workdir ?? undefined,
          channelId: resolvedChannelId,
          sessionGroupId: sessionGroup.id,
          connection: sessionGroup.connection ?? initialConnection,
          lastUserMessageAt: input.prompt ? new Date() : undefined,
          lastMessageAt: input.prompt ? new Date() : undefined,
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

      await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "session",
          scopeId: session.id,
          eventType: "session_started",
          payload: {
            session: serializeSession(session),
            sessionGroup: sessionGroupSnapshot,
            prompt: input.prompt ?? null,
            sourceSessionId: input.sourceSessionId ?? null,
            restoreCheckpointId: restoreCheckpoint?.id ?? null,
            restoreCheckpointSha: restoreCheckpoint?.commitSha ?? null,
          } as Prisma.InputJsonValue,
          metadata: initialCheckpointContextId
            ? ({ checkpointContextId: initialCheckpointContextId } as Prisma.InputJsonValue)
            : undefined,
          actorType: "user",
          actorId: input.createdById,
        },
        tx,
      );

      return session;
    });

    // Reuse the group's runtime binding when a shared workspace already exists,
    // or inherit from the restore group so the session lands on the same machine.
    const runtimeToBind = requestedRuntimeInstanceId;
    if (runtimeToBind) {
      sessionRouter.bindSession(session.id, runtimeToBind);
    }

    // Only provision the runtime immediately when a prompt is provided.
    // Sessions created without a prompt (e.g. Cmd+N) defer provisioning
    // until the user sends their first message.
    if (needsRuntimeProvisioning && input.prompt) {
      this.provisionRuntime({
        sessionId: session.id,
        sessionGroupId: session.sessionGroupId,
        slug: session.sessionGroup?.slug,
        hosting: session.hosting,
        tool: session.tool,
        model: session.model,
        repo: session.repo,
        branch: resolvedBranch,
        checkpointSha: restoreCheckpoint?.commitSha,
        createdById: input.createdById,
        organizationId: input.organizationId,
        readOnly: readOnlyWorkspace,
      });
    }

    return session;
  }

  async run(
    id: string,
    prompt?: string | null,
    interactionMode?: string,
    access?: { userId: string; organizationId: string },
  ) {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id },
      include: SESSION_INCLUDE,
    });
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
        checkpointContext: buildCheckpointContextFromStartMeta({
          sessionId: id,
          sessionGroupId: session.sessionGroupId,
          repoId: session.repoId,
          startMeta,
        }),
      };
      await this.triggerWorkspaceUpgrade(id, session, pendingCommand);
      return prisma.session.findUniqueOrThrow({ where: { id }, include: SESSION_INCLUDE });
    }

    // If workspace is still being prepared, queue the run for later
    if (session.agentStatus === "not_started" && !session.workdir) {
      const updated = await prisma.session.update({
        where: { id },
        data: {
          pendingRun: {
            type: "run",
            prompt: prompt ?? null,
            interactionMode: interactionMode ?? null,
            checkpointContext: buildCheckpointContextFromStartMeta({
              sessionId: id,
              sessionGroupId: session.sessionGroupId,
              repoId: session.repoId,
              startMeta,
            }),
          } as unknown as Prisma.InputJsonValue,
          ...(session.hosting === "local" &&
            runtimeBinding.runtimeId &&
            !conn.runtimeInstanceId && {
              connection: this.mergeConnection(session.connection, {
                runtimeInstanceId: runtimeBinding.runtimeId,
                runtimeLabel: runtimeBinding.runtimeLabel ?? undefined,
              }),
            }),
        },
        include: SESSION_INCLUDE,
      });

      // If no runtime has been provisioned yet (deferred from startSession),
      // kick it off now that the user has sent their first message.
      // Guard: skip if a runtime is already bound (provisioning in progress).
      const needsProvisioning = !!session.repoId || session.hosting === "cloud";
      const alreadyProvisioning = !!sessionRouter.getRuntimeForSession(id);
      if (needsProvisioning && !alreadyProvisioning) {
        this.provisionRuntime({
          sessionId: id,
          sessionGroupId: session.sessionGroupId,
          slug: session.sessionGroup?.slug,
          hosting: session.hosting,
          tool: session.tool,
          model: session.model,
          repo: session.repo,
          branch: session.branch,
          createdById: session.createdById,
          organizationId: session.organizationId,
          readOnly: session.readOnlyWorkspace,
        });
      }

      return updated;
    }

    // Fully unloaded sessions cannot accept follow-up work.
    if (isFullyUnloadedSession(session.agentStatus, session.sessionStatus)) {
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
      resolvedPrompt = appendPromptInstructions(resolvedPrompt, { hasRepo: !!session.repo });
    }

    // Append base branch instruction when the channel overrides the repo's default
    const channelBaseBranch =
      session.channel?.baseBranch ?? session.sessionGroup?.channel?.baseBranch ?? null;
    const repoDefaultBranch =
      session.repo?.defaultBranch ?? session.sessionGroup?.repo?.defaultBranch ?? null;
    if (
      isFirstRun &&
      resolvedPrompt &&
      channelBaseBranch &&
      repoDefaultBranch &&
      channelBaseBranch !== repoDefaultBranch
    ) {
      resolvedPrompt =
        resolvedPrompt + buildBaseBranchInstruction(channelBaseBranch, repoDefaultBranch);
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
      tool: session.tool,
      model: session.model ?? undefined,
      interactionMode,
      cwd: session.workdir ?? undefined,
      toolSessionId: session.toolSessionId ?? undefined,
      checkpointContext,
    };

    const deliveryResult = sessionRouter.send(id, command, {
      expectedHomeRuntimeId: runtimeBinding.runtimeId ?? conn.runtimeInstanceId,
    });

    if (deliveryResult !== "delivered") {
      await this.storePendingCommand(id, {
        type: "run",
        prompt: resolvedPrompt ?? null,
        interactionMode: interactionMode ?? null,
        checkpointContext,
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
        sessionStatus: "in_progress",
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
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "user",
      actorId: session.createdById,
    });

    return updated;
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

  async delete(id: string, actorType: ActorType = "system", actorId: string = "system") {
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
      await sessionRouter.destroyRuntime(id, session);
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
  ) {
    const group = await prisma.sessionGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new Error("Session group not found");
    if (group.organizationId !== organizationId) throw new Error("Session group not found");

    const sessions = await prisma.session.findMany({
      where: { sessionGroupId: groupId },
      select: { id: true },
    });

    for (const session of sessions) {
      await this.delete(session.id, actorType, actorId);
    }

    // If no sessions existed, the group won't have been cascade-deleted, so delete it directly
    if (sessions.length === 0) {
      await prisma.sessionGroup.delete({ where: { id: groupId } });
      await eventService.create({
        organizationId: group.organizationId,
        scopeType: "session",
        scopeId: groupId,
        eventType: "session_deleted",
        payload: { deletedSessionGroupId: groupId },
        actorType,
        actorId,
      });
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
        sessionGroupId: true,
      },
    });

    if (isFullyUnloadedSession(current.agentStatus, current.sessionStatus)) {
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
    config: { tool?: CodingTool; model?: string; hosting?: string; runtimeInstanceId?: string },
    actorType: ActorType,
    actorId: string,
  ) {
    const prev = await prisma.session.findFirstOrThrow({
      where: { id: sessionId, organizationId },
      select: {
        id: true,
        tool: true,
        model: true,
        agentStatus: true,
        hosting: true,
        repoId: true,
        sessionGroupId: true,
        sessionGroup: { select: { slug: true } },
        connection: true,
        readOnlyWorkspace: true,
        branch: true,
        repo: { select: { id: true, name: true, remoteUrl: true, defaultBranch: true } },
      },
    });

    const toolChanged = config.tool != null && config.tool !== prev.tool;
    const nextTool = config.tool ?? prev.tool;
    const nextModel =
      config.model != null
        ? validateModelForTool(nextTool, config.model)
        : toolChanged
          ? (getDefaultModel(nextTool) ?? null)
          : undefined;

    const data: Record<string, unknown> = {};
    if (config.tool != null) data.tool = config.tool;
    if (nextModel !== undefined) data.model = nextModel;
    if (toolChanged) {
      data.toolChangedAt = new Date();
      data.toolSessionId = null;
    }

    // Allow runtime switching for not_started sessions
    const runtimeChanged =
      prev.agentStatus === "not_started" &&
      (config.hosting != null || config.runtimeInstanceId != null);
    if (runtimeChanged) {
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
        const runtime = sessionRouter.getRuntime(config.runtimeInstanceId);
        if (!runtime) throw new Error("Requested runtime not found");
        newHosting = runtime.hostingMode;
        runtimeInstanceId = runtime.id;
        runtimeLabel = runtime.label;
        sessionRouter.bindSession(sessionId, runtime.id);
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
        sessionRouter.bindSession(sessionId, runtime.id);
      }
      data.hosting = newHosting;
      data.connection = connJson(
        defaultConnection({
          ...(runtimeInstanceId && { runtimeInstanceId }),
          ...(runtimeLabel && { runtimeLabel }),
        }),
      );
      data.workdir = null;
      data.pendingRun = Prisma.DbNull;

      // Provision the new runtime (repo already included in initial select)
      const needsProvisioning = !!prev.repoId || newHosting === "cloud";
      if (needsProvisioning) {
        this.provisionRuntime({
          sessionId,
          sessionGroupId: prev.sessionGroupId,
          slug: prev.sessionGroup?.slug,
          hosting: newHosting,
          tool: nextTool,
          model: nextModel !== undefined ? nextModel : prev.model,
          repo: prev.repo,
          branch: prev.branch,
          createdById: actorId,
          organizationId,
          readOnly: prev.readOnlyWorkspace,
        });
      }
    }

    const session = await prisma.session.update({
      where: { id: prev.id },
      data,
      include: SESSION_INCLUDE,
    });

    // Sync group connection if runtime changed
    if (runtimeChanged && session.sessionGroupId) {
      await this.syncGroupWorkspaceState(session.sessionGroupId, {
        connection: session.connection as Prisma.InputJsonValue,
        worktreeDeleted: false,
      });
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
        toolChanged,
        ...(runtimeChanged && { hosting: session.hosting, connection: session.connection }),
      },
      actorType,
      actorId,
    });

    return session;
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
    const newSessionStatus: SessionStatus =
      hasPendingPlan || hasQuestion
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

    // Create inbox item when complete() newly transitions to needs_input.
    // Skip if recordOutput() already set needs_input (and created the inbox item).
    if (newSessionStatus === "needs_input" && current.sessionStatus !== "needs_input") {
      // Find the event that triggered needs_input to extract question/plan data
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

    if (newSessionStatus !== "needs_input") {
      setImmediate(() => {
        void this.drainOneQueuedMessage(id);
      });
    }
  }

  async sendMessage({
    sessionId,
    text,
    imageKeys,
    actorType,
    actorId,
    interactionMode,
    clientMutationId,
  }: {
    sessionId: string;
    text: string;
    imageKeys?: string[];
    actorType: ActorType;
    actorId: string;
    interactionMode?: string;
    clientMutationId?: string;
  }) {
    if (imageKeys?.length) {
      for (const key of imageKeys) {
        if (typeof key !== "string" || !key.startsWith("uploads/") || key.includes("..")) {
          throw new Error("Invalid image key");
        }
      }
    }

    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        organizationId: true,
        agentStatus: true,
        sessionStatus: true,
        hosting: true,
        createdById: true,
        tool: true,
        model: true,
        toolChangedAt: true,
        workdir: true,
        toolSessionId: true,
        repoId: true,
        sessionGroupId: true,
        sessionGroup: { select: { slug: true } },
        connection: true,
        worktreeDeleted: true,
        readOnlyWorkspace: true,
        repo: { select: { id: true, name: true, remoteUrl: true, defaultBranch: true } },
        branch: true,
      },
    });
    const conn = this.parseConnection(session.connection);
    const runtimeBinding =
      actorType === "user"
        ? await this.resolveAccessibleLocalRuntimeBinding({
            sessionId,
            sessionGroupId: session.sessionGroupId,
            organizationId: session.organizationId,
            userId: actorId,
            hosting: session.hosting,
            tool: session.tool,
            repoId: session.repoId,
            connection: session.connection,
          })
        : {
            runtimeId: conn.runtimeInstanceId ?? null,
            runtimeLabel: conn.runtimeLabel ?? null,
          };

    // Image keys are scoped to an organization (`uploads/{orgId}/...`).
    // Reject keys whose org segment doesn't match the session's org so a
    // multi-org user can't smuggle another org's image into this session.
    if (imageKeys?.length) {
      for (const key of imageKeys) {
        const orgSegment = key.split("/")[1];
        if (orgSegment !== session.organizationId) {
          throw new Error("Image key does not belong to this organization");
        }
      }
    }

    if (session.worktreeDeleted) {
      throw new Error("Cannot send messages: session worktree has been deleted");
    }

    // If runtime was deferred (session created without a prompt), provision it
    // now and queue the message for delivery once the workspace is ready.
    if (session.agentStatus === "not_started" && !session.workdir && !session.toolSessionId) {
      const needsProvisioning = !!session.repoId || session.hosting === "cloud";
      if (needsProvisioning) {
        await prisma.session.update({
          where: { id: sessionId },
          data: {
            pendingRun: {
              type: "send",
              prompt: text,
              interactionMode: interactionMode ?? null,
              checkpointContext: null,
              ...(imageKeys?.length ? { imageKeys } : {}),
            } as unknown as Prisma.InputJsonValue,
            lastMessageAt: new Date(),
            ...(actorType === "user" ? { lastUserMessageAt: new Date() } : {}),
            ...(session.hosting === "local" &&
              runtimeBinding.runtimeId &&
              !conn.runtimeInstanceId && {
                connection: this.mergeConnection(session.connection, {
                  runtimeInstanceId: runtimeBinding.runtimeId,
                  runtimeLabel: runtimeBinding.runtimeLabel ?? undefined,
                }),
              }),
          },
        });

        this.provisionRuntime({
          sessionId,
          sessionGroupId: session.sessionGroupId,
          slug: session.sessionGroup?.slug,
          hosting: session.hosting,
          tool: session.tool,
          model: session.model,
          repo: session.repo,
          branch: session.branch,
          createdById: session.createdById,
          organizationId: session.organizationId,
          readOnly: session.readOnlyWorkspace,
        });

        const event = await eventService.create({
          organizationId: session.organizationId,
          scopeType: "session",
          scopeId: sessionId,
          eventType: "message_sent",
          payload: { text, ...(imageKeys?.length ? { imageKeys } : {}), ...(clientMutationId ? { clientMutationId } : {}) },
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
        checkpointContext: null,
        ...(imageKeys?.length ? { imageKeys } : {}),
      };
      await this.triggerWorkspaceUpgrade(
        sessionId,
        session,
        pendingCommand,
        { lastMessageAt: new Date(), ...(actorType === "user" ? { lastUserMessageAt: new Date() } : {}) },
      );
      // Record the message event so it appears in the UI
      const event = await eventService.create({
        organizationId: session.organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "message_sent",
        payload: { text, ...(imageKeys?.length ? { imageKeys } : {}), ...(clientMutationId ? { clientMutationId } : {}) },
        actorType,
        actorId,
      });
      return event;
    }

    // If the tool was recently switched and no user message has been sent since,
    // prepend conversation history so the new coding tool has context.
    let prompt = text;
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
        const context = await buildConversationContext(sessionId);
        if (context) {
          prompt = `${context}\n\n${text}`;
        }
      }
    }

    if (!session.toolSessionId) {
      const startMeta = await getSessionStartMetadata(sessionId);
      prompt = await prependSourceSessionContext(startMeta.sourceSessionId, prompt);
    }

    // Append system instructions (title, auto-save) to the prompt
    prompt = appendPromptInstructions(prompt, { hasRepo: !!session.repoId });

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

    // Generate presigned GET URLs for attached images
    let imageUrls: string[] | undefined;
    if (imageKeys?.length) {
      imageUrls = await Promise.all(imageKeys.map((key) => storage.getGetUrl(key)));
      runtimeDebug(`Generated ${imageUrls.length} image URLs for ${sessionId}`);
    }

    // Attempt delivery before marking active. Pinning to the session's home
    // runtime prevents silent bridge hijack when the home is offline and a
    // different bridge (e.g. Laptop B) is now the only connected runtime.
    const deliveryResult = sessionRouter.send(
      sessionId,
      {
        type: "send",
        sessionId,
        prompt,
        tool: session.tool,
        model: session.model ?? undefined,
        interactionMode,
        cwd: session.workdir ?? undefined,
        toolSessionId: session.toolSessionId ?? undefined,
        checkpointContext,
        imageUrls,
      },
      { expectedHomeRuntimeId: runtimeBinding.runtimeId ?? conn.runtimeInstanceId },
    );

    if (deliveryResult !== "delivered") {
      await this.storePendingCommand(
        sessionId,
        {
          type: "send",
          prompt,
          interactionMode: interactionMode ?? null,
          checkpointContext,
          ...(imageKeys?.length ? { imageKeys } : {}),
        },
        { lastMessageAt: new Date(), ...(actorType === "user" ? { lastUserMessageAt: new Date() } : {}) },
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
          ...(imageKeys?.length ? { imageKeys } : {}),
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
    const updatedSession = await prisma.session.update({
      where: { id: sessionId },
      data: {
        agentStatus: "active",
        sessionStatus: "in_progress",
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
        sessionStatus: "in_progress",
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
      payload: { text, ...(imageKeys?.length ? { imageKeys } : {}), ...(clientMutationId ? { clientMutationId } : {}) },
      metadata: checkpointMetadata,
      actorType,
      actorId,
    });

    return event;
  }

  async queueMessage({
    sessionId,
    text,
    actorId,
    interactionMode,
    organizationId,
  }: {
    sessionId: string;
    text: string;
    actorId: string;
    interactionMode?: string;
    organizationId: string;
  }) {
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
        queuedMessage: {
          id: queuedMessage.id,
          sessionId: queuedMessage.sessionId,
          text: queuedMessage.text,
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
      await this.sendMessage({
        sessionId,
        text: popped.text,
        actorType: "user",
        actorId: popped.createdById,
        interactionMode: popped.interactionMode ?? undefined,
      });
    } catch (error) {
      // Re-insert the message so it's not lost
      await prisma.queuedMessage.create({
        data: {
          id: popped.id,
          sessionId: popped.sessionId,
          text: popped.text,
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

  async workspaceReady(sessionId: string, workdir: string, branch?: string, slug?: string) {
    // Read and clear pendingRun atomically in a transaction to prevent double-delivery
    const [session, pendingRun] = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const prev = await tx.session.findUniqueOrThrow({
          where: { id: sessionId },
          select: { pendingRun: true, agentStatus: true, sessionStatus: true },
        });

        const updated = await tx.session.update({
          where: { id: sessionId },
          data: {
            agentStatus: getIdleAgentStatus(prev.agentStatus),
            sessionStatus: getIdleSessionStatus(prev.sessionStatus),
            workdir,
            ...(branch && { branch }),
            pendingRun: Prisma.DbNull,
            readOnlyWorkspace: false,
          },
          include: SESSION_INCLUDE,
        });

        return [updated, prev.pendingRun] as const;
      },
    );
    const setupScript = await this.getChannelSetupScript(session.channelId);
    const sessionGroup = await this.syncGroupWorkspaceState(session.sessionGroupId, {
      workdir,
      connection: session.connection as Prisma.InputJsonValue,
      worktreeDeleted: false,
      repoId: session.repoId ?? null,
      ...(branch !== undefined ? { branch } : {}),
      ...(slug !== undefined ? { slug } : {}),
      setupStatus: setupScript ? "running" : "idle",
      setupError: null,
    });

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

    if (setupScript) {
      await this.executeSetupScript({
        sessionId,
        sessionGroupId: session.sessionGroupId ?? null,
        organizationId: session.organizationId,
        workdir,
        setupScript,
      });
    }

    // If a run was queued while workspace was being prepared, execute it now
    if (pendingRun) {
      const replayResult = await this.deliverPendingCommand(sessionId, pendingRun);
      if (replayResult && replayResult !== "delivered") {
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
    const session = await prisma.session.update({
      where: { id: sessionId },
      data: {
        agentStatus: "failed",
        workdir: null,
        worktreeDeleted: true,
        pendingRun: Prisma.DbNull,
        connection: connJson(defaultConnection({ state: "disconnected", lastError: error })),
      },
      include: SESSION_INCLUDE,
    });
    const sessionGroup = await this.syncGroupWorkspaceState(session.sessionGroupId, {
      workdir: null,
      connection: session.connection as Prisma.InputJsonValue,
      worktreeDeleted: true,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_terminated",
      payload: {
        sessionId,
        reason: "workspace_failed",
        error,
        agentStatus: session.agentStatus,
        sessionStatus: session.sessionStatus,
        worktreeDeleted: true,
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
        connection: true,
        sessionGroupId: true,
      },
    });
    if (!session) return;

    // Fully unloaded sessions are excluded from reconnect/disconnect handling.
    if (isFullyUnloadedSession(session.agentStatus, session.sessionStatus)) return;

    const conn = this.parseConnection(session.connection);
    const updated: SessionConnectionData = {
      ...conn,
      state: "disconnected",
      lastError: reason,
      runtimeInstanceId: runtimeInstanceId ?? conn.runtimeInstanceId,
      canRetry: true,
      canMove: true,
    };

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
      runtimeLabel: sessionRouter.getRuntime(runtimeInstanceId)?.label ?? conn.runtimeLabel,
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
  }

  /**
   * When a runtime connects, restore all sessions it previously owned except fully unloaded ones.
   * The DB (connection.runtimeInstanceId) is the single source of truth for ownership.
   * Excludes fully unloaded statuses (failed, merged).
   */
  async restoreSessionsForRuntime(runtimeId: string) {
    const runtime = sessionRouter.getRuntime(runtimeId);
    if (!runtime) return;
    runtimeDebug("restoreSessionsForRuntime begin", { runtimeId, runtimeLabel: runtime.label });

    const sessions = await prisma.session.findMany({
      where: {
        agentStatus: { notIn: [...FULLY_UNLOADED_AGENT_STATUSES] },
        sessionStatus: { not: "merged" },
        connection: { path: ["runtimeInstanceId"], equals: runtimeId },
      },
      select: { id: true, agentStatus: true, connection: true },
    });

    runtimeDebug("restoreSessionsForRuntime loaded sessions", {
      runtimeId,
      sessionIds: sessions.map((session: { id: string }) => session.id),
    });

    for (const session of sessions) {
      sessionRouter.bindSession(session.id, runtimeId);

      // Only emit connection_restored for sessions that were disconnected
      // and are not already done — done sessions don't need event churn
      const conn = this.parseConnection(session.connection);
      if (conn.state === "disconnected" && session.agentStatus !== "done") {
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

    return persisted;
  }

  async retryConnection(
    sessionId: string,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    const session = await prisma.session.findFirstOrThrow({
      where: { id: sessionId, organizationId },
      include: SESSION_INCLUDE,
    });

    if (isFullyUnloadedSession(session.agentStatus, session.sessionStatus)) {
      return session;
    }

    const conn = this.parseConnection(session.connection);

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
    const runtime = homeRuntimeId
      ? sessionRouter.isRuntimeAvailable(homeRuntimeId)
        ? sessionRouter.getRuntime(homeRuntimeId)
        : undefined
      : session.hosting === "local"
        ? await this.resolveDefaultAccessibleLocalRuntime({
            userId: actorId,
            organizationId,
            tool: session.tool,
            repoId: session.repoId,
            sessionGroupId: session.sessionGroupId,
          })
        : sessionRouter.getDefaultRuntime();

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
    sessionRouter.bindSession(sessionId, runtime.id);

    if (session.repo) {
      const startMeta = await getSessionStartMetadata(sessionId);
      // Re-run workspace preparation — pin delivery to the runtime we just
      // resolved (the home bridge) so no other bridge can intercept.
      const prepResult = sessionRouter.send(
        sessionId,
        {
          type: "prepare",
          sessionId,
          sessionGroupId: session.sessionGroupId ?? undefined,
          slug: session.sessionGroup?.slug ?? undefined,
          repoId: session.repo.id,
          repoName: session.repo.name,
          repoRemoteUrl: session.repo.remoteUrl,
          defaultBranch: session.repo.defaultBranch,
          branch: session.branch ?? undefined,
          checkpointSha: startMeta.restoreCheckpointSha ?? undefined,
        },
        { expectedHomeRuntimeId: runtime.id },
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

      // Preserve agent/session status — only update connection state.
      const updated = await prisma.session.update({
        where: { id: sessionId },
        data: {
          connection: connJson(restoredConn),
        },
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

    // Preserve agent/session status — only update connection state.
    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: {
        connection: connJson(restoredConn),
      },
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

    // Fetch ticket links for this session
    const ticketLinks = await prisma.ticketLink.findMany({
      where: { entityType: "session", entityId: sessionId },
    });

    if (session.sessionStatus === "merged") {
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
    const targetRuntime = sessionRouter.getRuntime(runtimeInstanceId);
    if (!targetRuntime || targetRuntime.ws.readyState !== targetRuntime.ws.OPEN) {
      throw new Error("Selected runtime is not available");
    }
    if (!targetRuntime.supportedTools.includes(session.tool)) {
      throw new Error("Selected runtime does not support this tool");
    }

    // Build conversation context from the old session
    const context = await buildConversationContext(sessionId);
    const bootstrapPrompt = buildMigrationPrompt(context);

    // Create child session and copy ticket links in a single transaction
    const childSession = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const child = await tx.session.create({
        data: {
          name: session.name,
          agentStatus: "not_started",
          sessionStatus: "in_progress",
          tool: session.tool,
          model: session.model ?? undefined,
          hosting: targetRuntime.hostingMode,
          organizationId: session.organizationId,
          createdById: actorId,
          repoId: session.repoId ?? undefined,
          branch: session.branch ?? undefined,
          channelId: session.channelId ?? undefined,
          sessionGroupId: session.sessionGroupId ?? undefined,
          workdir: session.repoId ? undefined : (session.workdir ?? undefined),
          pendingRun: {
            type: "run",
            prompt: bootstrapPrompt,
            interactionMode: null,
          } satisfies PendingSessionCommand,
          lastUserMessageAt: session.lastUserMessageAt ?? undefined,
          connection: connJson(
            defaultConnection({
              runtimeInstanceId,
              runtimeLabel: targetRuntime.label,
            }),
          ),
          ...(session.projects.length > 0 && {
            projects: {
              create: session.projects.map((sp: { projectId: string }) => ({
                projectId: sp.projectId,
              })),
            },
          }),
        },
        include: SESSION_INCLUDE,
      });

      if (ticketLinks.length > 0) {
        await tx.ticketLink.createMany({
          data: ticketLinks.map((tl: { ticketId: string }) => ({
            ticketId: tl.ticketId,
            entityType: "session",
            entityId: child.id,
          })),
          skipDuplicates: true,
        });
      }

      return child;
    });
    await this.syncGroupWorkspaceState(session.sessionGroupId, {
      workdir: childSession.repo ? null : (session.workdir ?? null),
      connection: childSession.connection as Prisma.InputJsonValue,
      worktreeDeleted: false,
    });

    // Bind the child session to the target runtime
    sessionRouter.bindSession(childSession.id, runtimeInstanceId);

    // Emit session_started for the child
    const childSessionGroup = await this.loadSessionGroupSnapshot(childSession.sessionGroupId);
    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: childSession.id,
      eventType: "session_started",
      payload: {
        session: serializeSession(childSession),
        ...(childSessionGroup ? { sessionGroup: childSessionGroup } : {}),
        prompt: bootstrapPrompt,
        sourceSessionId: sessionId,
        movedFromSessionId: sessionId,
      } as Prisma.InputJsonValue,
      actorType,
      actorId,
    });

    // Provision the runtime on the target
    if (childSession.repo || targetRuntime.hostingMode === "cloud") {
      sessionRouter.createRuntime({
        sessionId: childSession.id,
        sessionGroupId: childSession.sessionGroupId ?? undefined,
        slug: childSession.sessionGroup?.slug ?? undefined,
        hosting: targetRuntime.hostingMode,
        tool: childSession.tool,
        model: childSession.model ?? undefined,
        repo: childSession.repo
          ? {
              id: childSession.repo.id,
              name: childSession.repo.name,
              remoteUrl: childSession.repo.remoteUrl,
              defaultBranch: childSession.repo.defaultBranch,
            }
          : null,
        branch: childSession.branch ?? undefined,
        createdById: actorId,
        organizationId: childSession.organizationId,
        onFailed: (error) => this.workspaceFailed(childSession.id, error),
        onWorkspaceReady: (workdir) => this.workspaceReady(childSession.id, workdir),
      });
    } else {
      const deliveryResult = await this.deliverPendingCommand(
        childSession.id,
        childSession.pendingRun,
      );
      if (deliveryResult && deliveryResult !== "delivered") {
        await this.persistConnectionFailure(
          childSession.id,
          childSession.organizationId,
          deliveryResult,
          "move_run",
        );
      }
    }

    // Emit rehome event on old session
    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "session_rehomed",
        newSessionId: childSession.id,
        runtimeInstanceId,
      },
      actorType,
      actorId,
    });

    await this.completeRehomedSourceSession({
      sessionId,
      hosting: session.hosting as "cloud" | "local",
      organizationId: session.organizationId,
      actorType,
      actorId,
    });

    return childSession;
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
    const session = await prisma.session.findFirstOrThrow({
      where: { id: sessionId, organizationId },
      include: { ...SESSION_INCLUDE, projects: true },
    });

    // Fetch ticket links for this session
    const ticketLinks = await prisma.ticketLink.findMany({
      where: { entityType: "session", entityId: sessionId },
    });

    if (session.sessionStatus === "merged") {
      throw new Error("Cannot move a merged session");
    }
    await this.assertRuntimeAccess({
      userId: actorId,
      organizationId,
      runtimeInstanceId: this.getConnectionRuntimeInstanceId(session.connection),
      sessionGroupId: session.sessionGroupId,
    });

    // Build conversation context from the old session
    const context = await buildConversationContext(sessionId);
    const bootstrapPrompt = buildMigrationPrompt(context);

    // Create child session and copy ticket links in a single transaction
    const childSession = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const child = await tx.session.create({
        data: {
          name: session.name,
          agentStatus: "not_started",
          sessionStatus: "in_progress",
          tool: session.tool,
          model: session.model ?? undefined,
          hosting: "cloud",
          organizationId: session.organizationId,
          createdById: actorId,
          repoId: session.repoId ?? undefined,
          branch: session.branch ?? undefined,
          channelId: session.channelId ?? undefined,
          sessionGroupId: session.sessionGroupId ?? undefined,
          workdir: session.repoId ? undefined : (session.workdir ?? undefined),
          pendingRun: {
            type: "run",
            prompt: bootstrapPrompt,
            interactionMode: null,
          } satisfies PendingSessionCommand,
          lastUserMessageAt: session.lastUserMessageAt ?? undefined,
          connection: connJson(defaultConnection()),
          ...(session.projects.length > 0 && {
            projects: {
              create: session.projects.map((sp: { projectId: string }) => ({
                projectId: sp.projectId,
              })),
            },
          }),
        },
        include: SESSION_INCLUDE,
      });

      if (ticketLinks.length > 0) {
        await tx.ticketLink.createMany({
          data: ticketLinks.map((tl: { ticketId: string }) => ({
            ticketId: tl.ticketId,
            entityType: "session",
            entityId: child.id,
          })),
          skipDuplicates: true,
        });
      }

      return child;
    });
    await this.syncGroupWorkspaceState(session.sessionGroupId, {
      workdir: childSession.repo ? null : (session.workdir ?? null),
      connection: childSession.connection as Prisma.InputJsonValue,
      worktreeDeleted: false,
    });

    // Emit session_started for the child
    const childSessionGroup = await this.loadSessionGroupSnapshot(childSession.sessionGroupId);
    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: childSession.id,
      eventType: "session_started",
      payload: {
        session: serializeSession(childSession),
        ...(childSessionGroup ? { sessionGroup: childSessionGroup } : {}),
        prompt: bootstrapPrompt,
        sourceSessionId: sessionId,
        movedFromSessionId: sessionId,
      } as Prisma.InputJsonValue,
      actorType,
      actorId,
    });

    // Provision cloud runtime — the CloudAdapter handles VM creation,
    // waiting for bridge connection, and workspace setup.
    sessionRouter.createRuntime({
      sessionId: childSession.id,
      sessionGroupId: childSession.sessionGroupId ?? undefined,
      slug: childSession.sessionGroup?.slug ?? undefined,
      hosting: "cloud",
      tool: childSession.tool,
      model: childSession.model ?? undefined,
      repo: childSession.repo
        ? {
            id: childSession.repo.id,
            name: childSession.repo.name,
            remoteUrl: childSession.repo.remoteUrl,
            defaultBranch: childSession.repo.defaultBranch,
          }
        : null,
      branch: childSession.branch ?? undefined,
      createdById: actorId,
      organizationId: childSession.organizationId,
      onFailed: (error) => this.workspaceFailed(childSession.id, error),
      onWorkspaceReady: (workdir) => this.workspaceReady(childSession.id, workdir),
    });

    // Emit rehome event on old session
    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "session_rehomed",
        newSessionId: childSession.id,
        runtimeInstanceId: null,
      },
      actorType,
      actorId,
    });

    await this.completeRehomedSourceSession({
      sessionId,
      hosting: session.hosting as "cloud" | "local",
      organizationId: session.organizationId,
      actorType,
      actorId,
    });

    return childSession;
  }

  async listRuntimesForTool(
    tool: string,
    organizationId: string,
    userId: string,
    sessionGroupId?: string | null,
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

    const accessibleRuntimeIds = await runtimeAccessService.listAccessibleRuntimeInstanceIds({
      userId,
      organizationId,
      sessionGroupId,
    });

    const allRuntimes = sessionRouter
      .listRuntimes()
      .filter(
        (runtime) =>
          runtime.hostingMode === "local" &&
          accessibleRuntimeIds.has(runtime.id) &&
          runtime.supportedTools.includes(tool),
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

    const result = allRuntimes.map((r) => ({
      id: r.id,
      label: r.label,
      hostingMode: r.hostingMode,
      supportedTools: r.supportedTools,
      connected: r.ws.readyState === r.ws.OPEN,
      sessionCount: [...r.boundSessions].filter((sessionId) => orgSessionIds.has(sessionId)).length,
      registeredRepoIds: r.registeredRepoIds,
    }));

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
      where: { id: sessionId, organizationId },
      select: { tool: true, sessionGroupId: true },
    });
    return this.listRuntimesForTool(
      session.tool,
      organizationId,
      userId,
      session.sessionGroupId,
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
        select: { repoId: true },
      });
      if (!scopedGroup || scopedGroup.repoId !== repoId) {
        throw new AuthorizationError(
          "Bridge access denied: this session group does not own the requested repo",
        );
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
    } else {
      const accessibleRuntimeIds = await runtimeAccessService.listAccessibleRuntimeInstanceIds({
        userId,
        organizationId,
        sessionGroupId,
      });
      runtimeId = sessionRouter
        .listRuntimes()
        .find(
          (runtime) =>
            (runtime.hostingMode === "cloud" || accessibleRuntimeIds.has(runtime.id)) &&
            runtime.registeredRepoIds.includes(repoId),
        )?.id;
    }
    if (!runtimeId) throw new Error("Repo not cloned on any connected runtime");
    return sessionRouter.listBranches(runtimeId, repoId);
  }

  async getLinkedCheckoutStatus(
    sessionGroupId: string,
    repoId: string,
    organizationId: string,
    userId: string,
  ) {
    await this.assertRepoExists(repoId, organizationId);
    const runtimeId = await this.resolveLinkedCheckoutRuntime(
      sessionGroupId,
      repoId,
      organizationId,
      userId,
    );
    return sessionRouter.getLinkedCheckoutStatus(runtimeId, repoId);
  }

  async linkLinkedCheckoutRepo(
    sessionGroupId: string,
    repoId: string,
    localPath: string,
    organizationId: string,
    userId: string,
  ) {
    await this.assertRepoExists(repoId, organizationId);
    const runtimeId = await this.resolveLinkedCheckoutRuntime(
      sessionGroupId,
      repoId,
      organizationId,
      userId,
    );
    return sessionRouter.linkLinkedCheckoutRepo(runtimeId, repoId, localPath);
  }

  async syncLinkedCheckout(
    sessionGroupId: string,
    repoId: string,
    branch: string,
    organizationId: string,
    userId: string,
    options?: { commitSha?: string | null; autoSyncEnabled?: boolean },
  ) {
    await this.assertRepoExists(repoId, organizationId);
    const runtimeId = await this.resolveLinkedCheckoutRuntime(
      sessionGroupId,
      repoId,
      organizationId,
      userId,
    );
    return sessionRouter.syncLinkedCheckout(runtimeId, {
      repoId,
      sessionGroupId,
      branch,
      commitSha: options?.commitSha,
      autoSyncEnabled: options?.autoSyncEnabled,
    });
  }

  async restoreLinkedCheckout(
    sessionGroupId: string,
    repoId: string,
    organizationId: string,
    userId: string,
  ) {
    await this.assertRepoExists(repoId, organizationId);
    const runtimeId = await this.resolveLinkedCheckoutRuntime(
      sessionGroupId,
      repoId,
      organizationId,
      userId,
    );
    return sessionRouter.restoreLinkedCheckout(runtimeId, repoId);
  }

  async setLinkedCheckoutAutoSync(
    sessionGroupId: string,
    repoId: string,
    enabled: boolean,
    organizationId: string,
    userId: string,
  ) {
    await this.assertRepoExists(repoId, organizationId);
    const runtimeId = await this.resolveLinkedCheckoutRuntime(
      sessionGroupId,
      repoId,
      organizationId,
      userId,
    );
    return sessionRouter.setLinkedCheckoutAutoSync(runtimeId, repoId, enabled);
  }

  /** List files in a session group's working directory by delegating to the bridge runtime. */
  async listFiles(
    sessionGroupId: string,
    organizationId: string,
    userId: string,
  ): Promise<string[]> {
    const runtime = await this.resolveAccessibleSessionGroupRuntime(
      sessionGroupId,
      organizationId,
      userId,
    );
    return sessionRouter.listFiles(runtime.runtimeId, runtime.sessionId, runtime.workdirHint);
  }

  /** Read a file's content from a session group's working directory. */
  async readFile(
    sessionGroupId: string,
    filePath: string,
    organizationId: string,
    userId: string,
  ): Promise<string> {
    const runtime = await this.resolveAccessibleSessionGroupRuntime(
      sessionGroupId,
      organizationId,
      userId,
    );
    const normalizedPath = this.normalizeFilePath(filePath);
    // For absolute paths, derive the relative form for the allowlist check.
    // The bridge will resolve the actual path and verify it's inside the workdir.
    let relativePath = normalizedPath;
    if (normalizedPath.startsWith("/") && runtime.workdirHint) {
      const prefix = runtime.workdirHint.replace(/\/$/, "") + "/";
      if (normalizedPath.startsWith(prefix)) {
        relativePath = normalizedPath.slice(prefix.length);
      }
    }
    const allowedFiles = await sessionRouter.listFiles(
      runtime.runtimeId,
      runtime.sessionId,
      runtime.workdirHint,
    );
    if (!allowedFiles.includes(relativePath)) {
      throw new Error(INVALID_FILE_PATH_ERROR);
    }
    return sessionRouter.readFile(
      runtime.runtimeId,
      runtime.sessionId,
      normalizedPath,
      runtime.workdirHint,
    );
  }

  /** Compute the branch diff for a session group (changed files vs default branch). */
  async branchDiff(sessionGroupId: string, organizationId: string, userId: string) {
    const group = await prisma.sessionGroup.findFirst({
      where: { id: sessionGroupId, organizationId },
      select: {
        id: true,
        worktreeDeleted: true,
        repo: { select: { defaultBranch: true } },
      },
    });
    if (!group) throw new Error("Session group not found");
    if (group.worktreeDeleted) {
      throw new Error("Cannot access files: session worktree has been deleted");
    }
    const baseBranch = "origin/" + (group.repo?.defaultBranch ?? "main");
    const runtime = await this.resolveAccessibleSessionGroupRuntime(
      sessionGroupId,
      organizationId,
      userId,
    );
    return sessionRouter.branchDiff(
      runtime.runtimeId,
      runtime.sessionId,
      baseBranch,
      runtime.workdirHint,
    );
  }

  /** Read a file's content at a specific git ref from a session group's runtime. */
  async readFileAtRef(
    sessionGroupId: string,
    filePath: string,
    ref: string,
    organizationId: string,
    userId: string,
  ): Promise<string> {
    // Validate ref to prevent git argument injection
    if (!ref || ref.startsWith("-") || ref.includes("..") || /[\x00-\x1f\x7f]/.test(ref)) {
      throw new Error("Invalid git ref");
    }
    const runtime = await this.resolveAccessibleSessionGroupRuntime(
      sessionGroupId,
      organizationId,
      userId,
    );
    const normalizedPath = this.normalizeFilePath(filePath);
    return sessionRouter.fileAtRef(
      runtime.runtimeId,
      runtime.sessionId,
      normalizedPath,
      ref,
      runtime.workdirHint,
    );
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
  ) {
    if (!sessionGroupId) return null;

    const groupData: Prisma.SessionGroupUncheckedUpdateInput = {};
    const sessionData: Prisma.SessionUpdateManyMutationInput = {};

    if (Object.prototype.hasOwnProperty.call(patch, "workdir")) {
      groupData.workdir = patch.workdir ?? null;
      sessionData.workdir = patch.workdir ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "connection")) {
      const connectionValue = patch.connection ?? Prisma.DbNull;
      groupData.connection = connectionValue;
      // Do NOT mirror connection to sessions — each session keeps its own connection state.
      // Only the group's connection represents the shared workspace runtime state.
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

    if (Object.prototype.hasOwnProperty.call(patch, "setupStatus")) {
      groupData.setupStatus = patch.setupStatus ?? "idle";
    }

    if (Object.prototype.hasOwnProperty.call(patch, "setupError")) {
      groupData.setupError = patch.setupError ?? null;
    }

    const shouldMirrorToSessions = Object.keys(sessionData).length > 0;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
    });

    return this.loadSessionGroupSnapshot(sessionGroupId);
  }

  private async loadSessionGroupSnapshot(
    sessionGroupId: string | null | undefined,
  ): Promise<SessionGroupSnapshot | null> {
    if (!sessionGroupId) return null;

    const group = await prisma.sessionGroup.findUnique({
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
    workdir,
    setupScript,
  }: {
    sessionId: string;
    sessionGroupId: string | null;
    organizationId: string;
    workdir: string;
    setupScript: string;
  }) {
    try {
      const exitCode = await terminalRelay.executeCommand(
        sessionId,
        sessionGroupId,
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
        checkpointContext: parseCheckpointContext(pending.checkpointContext),
        imageKeys: Array.isArray(pending.imageKeys) ? (pending.imageKeys as string[]) : null,
      };
    }
    if (pending.type === "run" || pending.type == null) {
      return {
        type: "run",
        prompt: typeof pending.prompt === "string" ? pending.prompt : null,
        interactionMode:
          typeof pending.interactionMode === "string" ? pending.interactionMode : null,
        checkpointContext: parseCheckpointContext(pending.checkpointContext),
      };
    }
    return null;
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
      repo: { id: string; name: string; remoteUrl: string; defaultBranch: string } | null;
      branch: string | null;
      connection: unknown;
    },
    pendingCommand: PendingSessionCommand,
    extraData?: Partial<Prisma.SessionUpdateInput>,
  ) {
    await this.storePendingCommand(sessionId, pendingCommand, extraData);

    const repo = session.repo;
    if (!repo) return;

    const conn = this.parseConnection(session.connection);
    const deliveryResult = sessionRouter.send(
      sessionId,
      {
        type: "upgrade_workspace",
        sessionId,
        sessionGroupId: session.sessionGroupId ?? undefined,
        slug: session.sessionGroup?.slug ?? undefined,
        repoId: repo.id,
        repoName: repo.name,
        repoRemoteUrl: repo.remoteUrl,
        defaultBranch: repo.defaultBranch,
        branch: session.branch ?? undefined,
      },
      { expectedHomeRuntimeId: conn.runtimeInstanceId },
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
  ) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { pendingRun: pending as unknown as Prisma.InputJsonValue, ...extraData },
    });
  }

  private async deliverPendingCommand(
    sessionId: string,
    rawPending: unknown,
  ): Promise<DeliveryResult | null> {
    const pending = this.parsePendingCommand(rawPending);
    if (!pending) return null;

    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        organizationId: true,
        tool: true,
        model: true,
        workdir: true,
        toolSessionId: true,
        repoId: true,
        connection: true,
        sessionGroupId: true,
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
      prompt = appendPromptInstructions(prompt, { hasRepo: !!session.repoId });
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

    // Generate presigned GET URLs for any attached images in the pending command
    let imageUrls: string[] | undefined;
    if (pending.type === "send" && pending.imageKeys?.length) {
      imageUrls = await Promise.all(pending.imageKeys.map((key) => storage.getGetUrl(key)));
    }

    const command = {
      type: pending.type,
      sessionId,
      prompt: prompt ?? undefined,
      tool: session.tool,
      model: session.model ?? undefined,
      interactionMode: pending.interactionMode ?? undefined,
      cwd: session.workdir ?? undefined,
      toolSessionId: session.toolSessionId ?? undefined,
      checkpointContext: checkpointContext ?? undefined,
      imageUrls,
    } satisfies {
      type: "run" | "send";
      sessionId: string;
      prompt?: string;
      tool: CodingTool;
      model?: string;
      interactionMode?: string;
      cwd?: string;
      toolSessionId?: string;
      checkpointContext?: GitCheckpointContext;
      imageUrls?: string[];
    };

    const conn = this.parseConnection(session.connection);
    const deliveryResult = sessionRouter.send(sessionId, command, {
      expectedHomeRuntimeId: conn.runtimeInstanceId,
    });
    if (deliveryResult !== "delivered") {
      return deliveryResult;
    }

    const boundRuntime = sessionRouter.getRuntimeForSession(sessionId);
    const updatedSession = await prisma.session.update({
      where: { id: sessionId },
      data: {
        agentStatus: "active",
        sessionStatus: "in_progress",
        pendingRun: Prisma.DbNull,
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
      payload: { sessionId, ...(sessionGroup ? { sessionGroup } : {}) },
      actorType: "system",
      actorId: "system",
    });

    return "delivered";
  }

  private async persistConnectionFailure(
    sessionId: string,
    organizationId: string,
    deliveryResult: DeliveryResult,
    operation: string,
  ) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { agentStatus: true, sessionStatus: true, connection: true, sessionGroupId: true },
    });
    if (session && isFullyUnloadedSession(session.agentStatus, session.sessionStatus)) return;
    const conn = this.parseConnection(session?.connection);

    const homeOffline = deliveryResult === "runtime_disconnected" && !!conn.runtimeInstanceId;
    const lastError = homeOffline
      ? conn.runtimeLabel
        ? `${conn.runtimeLabel} is offline — use Move to continue on another bridge`
        : "The original bridge is offline — use Move to continue on another bridge"
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
      autoRetryable: !homeOffline,
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

  /**
   * Fully unload a session's runtime resources.
   * When `isGroupUnload` is true, destroys all group terminals and the shared runtime.
   * When false (single session), only destroys that session's terminals and checks
   * whether siblings are still active before touching group resources.
   */
  private async fullyUnloadSession(sessionId: string, isGroupUnload = false) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        hosting: true,
        workdir: true,
        repoId: true,
        connection: true,
        sessionGroupId: true,
      },
    });
    if (!session) return;

    if (isGroupUnload && session.sessionGroupId) {
      // Group-level unload: destroy all terminals and the shared runtime
      terminalRelay.destroyAllForSessionGroup(session.sessionGroupId);
      try {
        await sessionRouter.destroyRuntime(sessionId, session);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[session-service] failed to unload group via session ${sessionId}: ${message}`,
        );
      }
      await this.syncGroupWorkspaceState(session.sessionGroupId, {
        workdir: null,
        worktreeDeleted: true,
      });
      return;
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
        try {
          await sessionRouter.destroyRuntime(sessionId, session);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[session-service] failed to unload session ${sessionId}: ${message}`);
        }
        await this.syncGroupWorkspaceState(session.sessionGroupId, {
          workdir: null,
          worktreeDeleted: true,
        });
      }
    } else {
      // No group — just destroy the runtime
      try {
        await sessionRouter.destroyRuntime(sessionId, session);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[session-service] failed to unload session ${sessionId}: ${message}`);
      }
    }
  }

  /** Set prUrl on the active session group when a PR is opened for its current branch. */
  async markPrOpened(params: {
    sessionGroupId: string;
    eventSessionId: string;
    prUrl: string;
    organizationId: string;
  }) {
    const { sessionGroupId, eventSessionId, prUrl, organizationId } = params;

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
      actorId: "github-webhook",
    });
  }

  /** Clear prUrl on the active session group when its current PR is closed without merging. */
  async markPrClosed(params: {
    sessionGroupId: string;
    eventSessionId: string;
    prUrl: string;
    organizationId: string;
  }) {
    const { sessionGroupId, eventSessionId, prUrl, organizationId } = params;

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
      actorId: "github-webhook",
    });
  }

  /** Archive a session group: stop agents, unload worktree, mark as archived. */
  async archiveGroup(
    groupId: string,
    organizationId: string,
    actorType: ActorType = "system",
    actorId: string = "system",
  ) {
    const group = await prisma.sessionGroup.findUnique({
      where: { id: groupId },
      include: { sessions: { select: { id: true }, orderBy: { updatedAt: "desc" } } },
    });
    if (!group) throw new Error("Session group not found");
    if (group.organizationId !== organizationId) throw new Error("Session group not found");

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
  }) {
    const { sessionGroupId, eventSessionId, prUrl, organizationId } = params;

    const group = await prisma.sessionGroup.findUnique({
      where: { id: sessionGroupId },
      select: { prUrl: true },
    });
    if (group?.prUrl && group.prUrl !== prUrl) return;

    // Transition ALL sessions in the group to merged, not just the event session
    const { count } = await prisma.session.updateMany({
      where: { sessionGroupId, sessionStatus: { not: "merged" } },
      data: { agentStatus: "done", sessionStatus: "merged" },
    });

    if (count === 0) return;

    const sessionGroup = await this.syncGroupWorkspaceState(sessionGroupId, {
      prUrl,
      workdir: null,
      worktreeDeleted: true,
    });

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
        worktreeDeleted: true,
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId: "github-webhook",
    });

    await this.fullyUnloadSession(eventSessionId, true);
  }
}

export const sessionService = new SessionService();
