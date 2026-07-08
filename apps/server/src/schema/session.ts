import type { Context } from "../context.js";
import type {
  AgentStatus,
  CodingTool,
  SessionFilters,
  StartSessionInput,
  UpdateSessionDefaultsInput,
} from "@trace/gql";
import type { CodingTool as CodingToolEnum } from "@prisma/client";
import { sessionService } from "../services/session.js";
import { sessionRouter } from "../lib/session-router.js";
import { runtimeAccessService } from "../services/runtime-access.js";
import { BUILTIN_SLASH_COMMANDS, type BridgeSkillInfo } from "@trace/shared";
import { prisma } from "../lib/db.js";
import { AuthenticationError, toGraphQLError } from "../lib/errors.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { assertOrgAccess, requireOrgContext } from "../lib/require-org.js";
import {
  deriveSessionGroupStatus,
  type SessionGroupStatusSource,
} from "../lib/session-group-status.js";
import { assertScopeAccess, canViewSessionGroup } from "../services/access.js";

export const sessionQueries = {
  sessionGroups: (
    _: unknown,
    args: {
      channelId: string;
      archived?: boolean | null;
      status?: string | null;
      includeActiveMerged?: boolean | null;
    },
    ctx: Context,
  ) => {
    return sessionService.listGroups(args.channelId, requireOrgContext(ctx), ctx.userId, {
      archived: args.archived ?? undefined,
      status: args.status ?? undefined,
      includeActiveMerged: args.includeActiveMerged ?? undefined,
    });
  },
  sessionGroup: (_: unknown, args: { id: string }, ctx: Context) => {
    return sessionService.getGroup(args.id, requireOrgContext(ctx), ctx.userId);
  },
  sessions: (
    _: unknown,
    args: { organizationId: string; filters?: SessionFilters },
    ctx: Context,
  ) => {
    assertOrgAccess(ctx, args.organizationId);
    const filters = args.filters ? { ...args.filters } : undefined;
    return sessionService.list(args.organizationId, ctx.userId, filters);
  },
  session: (_: unknown, args: { id: string }, ctx: Context) => {
    return sessionService.get(args.id, requireOrgContext(ctx), ctx.userId);
  },
  mySessions: (
    _: unknown,
    args: {
      organizationId: string;
      agentStatus?: AgentStatus | null;
      includeMerged?: boolean | null;
      includeArchived?: boolean | null;
    },
    ctx: Context,
  ) => {
    assertOrgAccess(ctx, args.organizationId);
    return sessionService.listByUser(args.organizationId, ctx.userId, {
      agentStatus: args.agentStatus ?? undefined,
      includeMerged: args.includeMerged ?? true,
      includeArchived: args.includeArchived ?? true,
    });
  },
  searchSessions: (
    _: unknown,
    args: { query: string; channelId?: string | null },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);
    return sessionService.search(orgId, ctx.userId, args.query, args.channelId ?? undefined);
  },
  availableSessionRuntimes: (_: unknown, args: { sessionId: string }, ctx: Context) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return sessionService.listAvailableRuntimes(args.sessionId, orgId, ctx.userId);
  },
  availableRuntimes: (
    _: unknown,
    args: { tool: CodingToolEnum; sessionGroupId?: string | null },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return sessionService.listRuntimesForTool(
      args.tool,
      orgId,
      ctx.userId,
      args.sessionGroupId ?? undefined,
    );
  },
  repoBranches: (
    _: unknown,
    args: { repoId: string; runtimeInstanceId?: string | null; sessionGroupId?: string | null },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return sessionService.listBranches(
      args.repoId,
      orgId,
      ctx.userId,
      args.runtimeInstanceId ?? undefined,
      args.sessionGroupId ?? undefined,
    );
  },
  sessionGroupFiles: (_: unknown, args: { sessionGroupId: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return sessionService.listFiles(args.sessionGroupId, orgId, ctx.userId);
  },
  sessionGroupFileTree: (_: unknown, args: { sessionGroupId: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return sessionService.listFileTree(args.sessionGroupId, orgId, ctx.userId);
  },
  sessionGroupDirectoryEntries: (
    _: unknown,
    args: { sessionGroupId: string; directoryPath: string; depth?: number | null },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);
    return sessionService.listDirectoryEntries(
      args.sessionGroupId,
      args.directoryPath,
      args.depth ?? undefined,
      orgId,
      ctx.userId,
    );
  },
  sessionGroupFileContent: (
    _: unknown,
    args: { sessionGroupId: string; filePath: string },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);
    return sessionService.readFile(args.sessionGroupId, args.filePath, orgId, ctx.userId);
  },
  sessionGroupFileContentWithSource: (
    _: unknown,
    args: { sessionGroupId: string; filePath: string },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);
    return sessionService.readFileWithSource(args.sessionGroupId, args.filePath, orgId, ctx.userId);
  },
  sessionGroupBranchDiff: (_: unknown, args: { sessionGroupId: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return sessionService.branchDiff(args.sessionGroupId, orgId, ctx.userId);
  },
  sessionGroupFileAtRef: (
    _: unknown,
    args: { sessionGroupId: string; filePath: string; ref: string },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);
    return sessionService.readFileAtRef(
      args.sessionGroupId,
      args.filePath,
      args.ref,
      orgId,
      ctx.userId,
    );
  },
  linkedCheckoutStatus: (
    _: unknown,
    args: { sessionGroupId: string; repoId: string; runtimeInstanceId?: string | null },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return sessionService.getLinkedCheckoutStatus(
      args.sessionGroupId,
      args.repoId,
      orgId,
      ctx.userId,
      args.runtimeInstanceId ?? undefined,
    );
  },
  linkedCheckoutChangedFile: (
    _: unknown,
    args: {
      sessionGroupId: string;
      repoId: string;
      filePath: string;
      runtimeInstanceId?: string | null;
    },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return sessionService.getLinkedCheckoutChangedFile(
      args.sessionGroupId,
      args.repoId,
      args.filePath,
      orgId,
      ctx.userId,
      args.runtimeInstanceId ?? undefined,
    );
  },
  sessionGroupWorktreeChanges: (_: unknown, args: { sessionGroupId: string }, ctx: Context) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return sessionService.listWorktreeChanges(args.sessionGroupId, orgId, ctx.userId);
  },
  sessionSlashCommands: async (_: unknown, args: { sessionId: string }, ctx: Context) => {
    if (!ctx.userId) throw new AuthenticationError();

    const orgId = requireOrgContext(ctx);
    await assertScopeAccess("session", args.sessionId, ctx.userId, orgId);
    const session = await prisma.session.findFirst({
      where: { id: args.sessionId, organizationId: orgId },
      select: {
        id: true,
        tool: true,
        workdir: true,
        sessionGroupId: true,
        connection: true,
      },
    });
    if (!session || session.tool !== "claude_code") return [];

    const runtimeInstanceId =
      session.connection &&
      typeof session.connection === "object" &&
      !Array.isArray(session.connection) &&
      typeof (session.connection as { runtimeInstanceId?: unknown }).runtimeInstanceId === "string"
        ? ((session.connection as { runtimeInstanceId?: string }).runtimeInstanceId ?? null)
        : null;
    const runtime =
      (runtimeInstanceId ? sessionRouter.getRuntime(runtimeInstanceId, orgId) : null) ??
      sessionRouter.getRuntimeForSession(args.sessionId);

    // Try to get skills from bridge
    let skills: BridgeSkillInfo[] = [];
    let canUseBridgeSkills = true;
    if (runtimeInstanceId) {
      const access = await runtimeAccessService.getAccessState({
        userId: ctx.userId,
        organizationId: orgId,
        runtimeInstanceId,
        sessionGroupId: session.sessionGroupId ?? undefined,
      });
      canUseBridgeSkills = access.hostingMode !== "local" || access.allowed;
    }
    if (runtime && canUseBridgeSkills) {
      try {
        skills = await sessionRouter.listSkills(runtime.key, args.sessionId, {
          workdirHint: session.workdir ?? undefined,
          includeUserSkills: true,
          includeProjectSkills: true,
        });
      } catch {
        skills = [];
      }
    }

    // Merge built-in commands with bridge skills
    const commands: Array<{ name: string; description: string; source: string; category: string }> =
      [];

    for (const cmd of BUILTIN_SLASH_COMMANDS) {
      commands.push({
        name: cmd.name,
        description: cmd.description,
        source: "builtin",
        category: cmd.category,
      });
    }

    // Add bridge skills
    for (const skill of skills) {
      commands.push({
        name: skill.name,
        description: skill.description,
        source: skill.source === "user" ? "user_skill" : "project_skill",
        category: "passthrough",
      });
    }

    return commands;
  },
};

export const sessionMutations = {
  startSession: (_: unknown, args: { input: StartSessionInput }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return sessionService.start({
      ...args.input,
      organizationId: orgId,
      createdById: ctx.userId,
      actorType: ctx.actorType,
      clientSource: ctx.clientSource,
    });
  },
  forkSession: (_: unknown, args: { eventId: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    if (!ctx.userId) throw new AuthenticationError();
    return sessionService.forkSession({
      eventId: args.eventId,
      organizationId: orgId,
      createdById: ctx.userId,
      actorType: ctx.actorType,
      clientSource: ctx.clientSource,
    });
  },
  runSession: async (
    _: unknown,
    args: { id: string; prompt?: string | null; interactionMode?: string | null },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    try {
      return await sessionService.run(args.id, args.prompt, args.interactionMode ?? undefined, {
        userId: ctx.userId,
        organizationId: requireOrgContext(ctx),
        clientSource: ctx.clientSource,
      });
    } catch (error) {
      throw toGraphQLError(error);
    }
  },
  terminateSession: async (_: unknown, args: { id: string }, ctx: Context) => {
    await assertScopeAccess("session", args.id, ctx.userId, requireOrgContext(ctx));
    return sessionService.terminate(args.id, ctx.actorType, ctx.userId);
  },
  dismissSession: async (_: unknown, args: { id: string }, ctx: Context) => {
    await assertScopeAccess("session", args.id, ctx.userId, requireOrgContext(ctx));
    return sessionService.dismiss(args.id, ctx.actorType, ctx.userId);
  },
  deleteSession: async (_: unknown, args: { id: string }, ctx: Context) => {
    await assertScopeAccess("session", args.id, ctx.userId, requireOrgContext(ctx));
    return sessionService.delete(args.id, ctx.actorType, ctx.userId);
  },
  archiveSessionGroup: (_: unknown, args: { id: string }, ctx: Context) => {
    return sessionService.archiveGroup(args.id, requireOrgContext(ctx), ctx.actorType, ctx.userId);
  },
  renameSessionGroup: (_: unknown, args: { id: string; name: string }, ctx: Context) => {
    return sessionService.renameGroup(
      args.id,
      requireOrgContext(ctx),
      args.name,
      ctx.actorType,
      ctx.userId,
    );
  },
  updateSessionGroupVisibility: (
    _: unknown,
    args: { id: string; visibility: "public" | "private" },
    ctx: Context,
  ) => {
    return sessionService.updateGroupVisibility(
      args.id,
      requireOrgContext(ctx),
      args.visibility,
      ctx.actorType,
      ctx.userId,
    );
  },
  deleteSessionGroup: (_: unknown, args: { id: string }, ctx: Context) => {
    return sessionService.deleteGroup(args.id, requireOrgContext(ctx), ctx.actorType, ctx.userId);
  },
  updateSessionConfig: (
    _: unknown,
    args: {
      sessionId: string;
      tool?: CodingTool | null;
      model?: string | null;
      reasoningEffort?: string | null;
      hosting?: string | null;
      runtimeInstanceId?: string | null;
    },
    ctx: Context,
  ) => {
    return sessionService.updateConfig(
      args.sessionId,
      requireOrgContext(ctx),
      {
        tool: args.tool ?? undefined,
        model: args.model ?? undefined,
        reasoningEffort: args.reasoningEffort ?? undefined,
        hosting: args.hosting ?? undefined,
        runtimeInstanceId: args.runtimeInstanceId ?? undefined,
      },
      ctx.actorType,
      ctx.userId,
    );
  },
  updateSessionDefaults: (
    _: unknown,
    args: { input: UpdateSessionDefaultsInput },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    return sessionService.updateDefaults(ctx.userId, args.input);
  },
  sendSessionMessage: async (
    _: unknown,
    args: {
      sessionId: string;
      text: string;
      attachmentKeys?: string[] | null;
      imageKeys?: string[] | null;
      interactionMode?: string | null;
      clientMutationId?: string | null;
    },
    ctx: Context,
  ) => {
    await assertScopeAccess("session", args.sessionId, ctx.userId, requireOrgContext(ctx));
    try {
      return await sessionService.sendMessage({
        sessionId: args.sessionId,
        text: args.text,
        imageKeys: args.attachmentKeys ?? args.imageKeys ?? undefined,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        interactionMode: args.interactionMode ?? undefined,
        clientMutationId: args.clientMutationId ?? undefined,
        clientSource: ctx.clientSource,
      });
    } catch (error) {
      throw toGraphQLError(error);
    }
  },
  retrySessionConnection: (_: unknown, args: { sessionId: string }, ctx: Context) => {
    return sessionService.retryConnection(
      args.sessionId,
      requireOrgContext(ctx),
      ctx.actorType,
      ctx.userId,
    );
  },
  retrySessionGroupSetup: (_: unknown, args: { id: string }, ctx: Context) => {
    return sessionService.retrySessionGroupSetup(
      args.id,
      requireOrgContext(ctx),
      ctx.actorType,
      ctx.userId,
    );
  },
  moveSessionToRuntime: (
    _: unknown,
    args: {
      sessionId: string;
      runtimeInstanceId: string;
    },
    ctx: Context,
  ) => {
    return sessionService.moveToRuntime(
      args.sessionId,
      args.runtimeInstanceId,
      requireOrgContext(ctx),
      ctx.actorType,
      ctx.userId,
    );
  },
  moveSessionToCloud: (_: unknown, args: { sessionId: string }, ctx: Context) => {
    return sessionService.moveToCloud(
      args.sessionId,
      requireOrgContext(ctx),
      ctx.actorType,
      ctx.userId,
    );
  },
  saveSessionGroupFile: (
    _: unknown,
    args: { sessionGroupId: string; filePath: string; content: string },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return sessionService.saveFile(
      args.sessionGroupId,
      args.filePath,
      args.content,
      orgId,
      ctx.userId,
    );
  },
  commitSessionGroupFileChanges: (
    _: unknown,
    args: { sessionGroupId: string; message?: string | null },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return sessionService.commitFileChanges(
      args.sessionGroupId,
      args.message ?? undefined,
      orgId,
      ctx.userId,
    );
  },
  revertSessionGroupFileChange: (
    _: unknown,
    args: { sessionGroupId: string; filePath: string },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return sessionService.revertFileChange(args.sessionGroupId, args.filePath, orgId, ctx.userId);
  },
  linkLinkedCheckoutRepo: (
    _: unknown,
    args: {
      sessionGroupId: string;
      repoId: string;
      localPath: string;
      runtimeInstanceId?: string | null;
    },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return sessionService.linkLinkedCheckoutRepo(
      args.sessionGroupId,
      args.repoId,
      args.localPath,
      orgId,
      ctx.userId,
      args.runtimeInstanceId ?? undefined,
    );
  },
  syncLinkedCheckout: (
    _: unknown,
    args: {
      sessionGroupId: string;
      repoId: string;
      branch: string;
      runtimeInstanceId?: string | null;
      commitSha?: string | null;
      autoSyncEnabled?: boolean | null;
      conflictStrategy?: "DISCARD" | "COMMIT" | "REBASE" | "STASH" | null;
      commitMessage?: string | null;
    },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return sessionService.syncLinkedCheckout(
      args.sessionGroupId,
      args.repoId,
      args.branch,
      orgId,
      ctx.userId,
      {
        runtimeInstanceId: args.runtimeInstanceId ?? undefined,
        commitSha: args.commitSha ?? undefined,
        autoSyncEnabled: args.autoSyncEnabled ?? undefined,
        conflictStrategy:
          args.conflictStrategy === "DISCARD"
            ? "discard"
            : args.conflictStrategy === "COMMIT"
              ? "commit"
              : args.conflictStrategy === "REBASE"
                ? "rebase"
                : args.conflictStrategy === "STASH"
                  ? "stash"
                  : undefined,
        commitMessage: args.commitMessage ?? undefined,
      },
    );
  },
  commitLinkedCheckoutChanges: (
    _: unknown,
    args: {
      sessionGroupId: string;
      repoId: string;
      runtimeInstanceId?: string | null;
      message?: string | null;
    },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return sessionService.commitLinkedCheckoutChanges(
      args.sessionGroupId,
      args.repoId,
      orgId,
      ctx.userId,
      args.runtimeInstanceId ?? undefined,
      args.message ?? undefined,
    );
  },
  restoreLinkedCheckout: (
    _: unknown,
    args: { sessionGroupId: string; repoId: string; runtimeInstanceId?: string | null },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return sessionService.restoreLinkedCheckout(
      args.sessionGroupId,
      args.repoId,
      orgId,
      ctx.userId,
      args.runtimeInstanceId ?? undefined,
    );
  },
  setLinkedCheckoutAutoSync: (
    _: unknown,
    args: {
      sessionGroupId: string;
      repoId: string;
      enabled: boolean;
      runtimeInstanceId?: string | null;
    },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return sessionService.setLinkedCheckoutAutoSync(
      args.sessionGroupId,
      args.repoId,
      args.enabled,
      orgId,
      ctx.userId,
      args.runtimeInstanceId ?? undefined,
    );
  },
  queueSessionMessage: async (
    _: unknown,
    args: {
      sessionId: string;
      text: string;
      attachmentKeys?: string[] | null;
      imageKeys?: string[] | null;
      interactionMode?: string | null;
    },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);
    await assertScopeAccess("session", args.sessionId, ctx.userId, orgId);
    return sessionService.queueMessage({
      sessionId: args.sessionId,
      text: args.text,
      imageKeys: args.attachmentKeys ?? args.imageKeys ?? undefined,
      actorId: ctx.userId,
      interactionMode: args.interactionMode ?? undefined,
      organizationId: orgId,
      clientSource: ctx.clientSource,
    });
  },
  removeQueuedMessage: async (_: unknown, args: { id: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    try {
      const sessionId = await sessionService.getQueuedMessageSessionId(args.id, orgId);
      await assertScopeAccess("session", sessionId, ctx.userId, orgId);
      return await sessionService.removeQueuedMessage(args.id, ctx.userId, orgId);
    } catch (error) {
      throw toGraphQLError(error);
    }
  },
  steerQueuedMessage: async (_: unknown, args: { id: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    try {
      const sessionId = await sessionService.getQueuedMessageSessionId(args.id, orgId);
      await assertScopeAccess("session", sessionId, ctx.userId, orgId);
      return await sessionService.steerQueuedMessage(args.id, ctx.userId, orgId);
    } catch (error) {
      throw toGraphQLError(error);
    }
  },
  updateQueuedMessage: async (_: unknown, args: { id: string; text: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    try {
      const sessionId = await sessionService.getQueuedMessageSessionId(args.id, orgId);
      await assertScopeAccess("session", sessionId, ctx.userId, orgId);
      return await sessionService.updateQueuedMessage(args.id, args.text, ctx.userId, orgId);
    } catch (error) {
      throw toGraphQLError(error);
    }
  },
  clearQueuedMessages: async (_: unknown, args: { sessionId: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    await assertScopeAccess("session", args.sessionId, ctx.userId, orgId);
    return sessionService.clearQueuedMessages(args.sessionId, ctx.userId, orgId);
  },
  reorderQueuedMessages: async (
    _: unknown,
    args: { sessionId: string; ids: string[] },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);
    await assertScopeAccess("session", args.sessionId, ctx.userId, orgId);
    return sessionService.reorderQueuedMessages(args.sessionId, args.ids, ctx.userId, orgId);
  },
};

export const sessionTypeResolvers = {
  SessionGroup: {
    status: async (
      group: {
        id: string;
        prUrl?: string | null;
        archivedAt?: string | Date | null;
        sessions?: SessionGroupStatusSource[];
      },
      _args: unknown,
      ctx: Context,
    ) => {
      const sessions = Array.isArray(group.sessions)
        ? group.sessions
        : ((
            (await ctx.sessionGroupLoader.load(group.id)) as {
              sessions?: SessionGroupStatusSource[];
            } | null
          )?.sessions ?? []);
      return deriveSessionGroupStatus(sessions, group.prUrl ?? null, group.archivedAt ?? null);
    },
    sessions: async (group: { id: string; sessions?: unknown[] }, _args: unknown, ctx: Context) => {
      if (Array.isArray(group.sessions)) return group.sessions;
      return (
        ((await ctx.sessionGroupLoader.load(group.id)) as { sessions?: unknown[] } | null)
          ?.sessions ?? []
      );
    },
    gitCheckpoints: async (group: { id: string }) => {
      return sessionService.listGitCheckpointsForGroup(group.id);
    },
    owner: async (
      group: { owner?: unknown; ownerUser?: unknown; ownerUserId?: string },
      _args: unknown,
      ctx: Context,
    ) => {
      if (group.owner) return group.owner;
      if (group.ownerUser) return group.ownerUser;
      if (!group.ownerUserId) return null;
      return ctx.userLoader.load(group.ownerUserId);
    },
    forkedFromSessionGroup: async (
      group: { forkedFromSessionGroup?: unknown; forkedFromSessionGroupId?: string | null },
      _args: unknown,
      ctx: Context,
    ) => {
      if (!ctx.userId) return null;
      if (group.forkedFromSessionGroup) {
        const sourceGroup = group.forkedFromSessionGroup as {
          ownerUserId?: string | null;
          visibility?: "public" | "private" | null;
        };
        return canViewSessionGroup(sourceGroup, ctx.userId) ? group.forkedFromSessionGroup : null;
      }
      if (!group.forkedFromSessionGroupId) return null;
      const sourceGroup = (await ctx.sessionGroupLoader.load(group.forkedFromSessionGroupId)) as {
        ownerUserId?: string | null;
        visibility?: "public" | "private" | null;
      } | null;
      if (!sourceGroup || !canViewSessionGroup(sourceGroup, ctx.userId)) return null;
      return sourceGroup;
    },
  },
  Session: {
    inputTokens: (session: { inputTokens?: bigint | number | null }) =>
      typeof session.inputTokens === "bigint"
        ? Number(session.inputTokens)
        : (session.inputTokens ?? 0),
    outputTokens: (session: { outputTokens?: bigint | number | null }) =>
      typeof session.outputTokens === "bigint"
        ? Number(session.outputTokens)
        : (session.outputTokens ?? 0),
    cacheReadTokens: (session: { cacheReadTokens?: bigint | number | null }) =>
      typeof session.cacheReadTokens === "bigint"
        ? Number(session.cacheReadTokens)
        : (session.cacheReadTokens ?? 0),
    cacheCreationTokens: (session: { cacheCreationTokens?: bigint | number | null }) =>
      typeof session.cacheCreationTokens === "bigint"
        ? Number(session.cacheCreationTokens)
        : (session.cacheCreationTokens ?? 0),
    tickets: (session: { id: string }, _args: unknown, ctx: Context) =>
      ctx.sessionTicketsLoader.load(session.id),
    gitCheckpoints: async (session: { id: string }) => {
      return sessionService.listGitCheckpointsForSession(session.id);
    },
    queuedMessages: async (session: { id: string }) => {
      return prisma.queuedMessage.findMany({
        where: { sessionId: session.id },
        orderBy: { position: "asc" },
      });
    },
  },
  QueuedMessage: {
    attachmentKeys: (message: { imageKeys: string[] }) => message.imageKeys,
  },
  GitCheckpoint: {
    session: async (checkpoint: { sessionId: string }, _args: unknown, ctx: Context) => {
      return ctx.sessionLoader.load(checkpoint.sessionId);
    },
    sessionGroup: async (checkpoint: { sessionGroupId: string }, _args: unknown, ctx: Context) => {
      return ctx.sessionGroupLoader.load(checkpoint.sessionGroupId);
    },
    repo: async (checkpoint: { repoId: string }, _args: unknown, ctx: Context) => {
      return ctx.repoLoader.load(checkpoint.repoId);
    },
    promptEvent: async (checkpoint: { promptEventId: string }, _args: unknown, ctx: Context) => {
      return ctx.eventLoader.load(checkpoint.promptEventId);
    },
  },
};

export const sessionSubscriptions = {
  sessionPortsChanged: {
    subscribe: async (
      _: unknown,
      args: { sessionId: string; organizationId: string },
      ctx: Context,
    ) => {
      assertOrgAccess(ctx, args.organizationId);
      await assertScopeAccess("session", args.sessionId, ctx.userId, ctx.organizationId);
      return pubsub.asyncIterator(topics.sessionPorts(args.sessionId));
    },
  },
  sessionStatusChanged: {
    subscribe: async (
      _: unknown,
      args: { sessionId: string; organizationId: string },
      ctx: Context,
    ) => {
      assertOrgAccess(ctx, args.organizationId);
      await assertScopeAccess("session", args.sessionId, ctx.userId, ctx.organizationId);
      return pubsub.asyncIterator(topics.sessionStatus(args.sessionId));
    },
  },
};
