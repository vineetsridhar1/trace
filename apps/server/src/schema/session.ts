import type { Context } from "../context.js";
import type { AgentStatus, CodingTool, SessionFilters, StartSessionInput } from "@trace/gql";
import type { CodingTool as CodingToolEnum } from "@prisma/client";
import { sessionService } from "../services/session.js";
import { sessionRouter } from "../lib/session-router.js";
import { runtimeAccessService } from "../services/runtime-access.js";
import { BUILTIN_SLASH_COMMANDS, type BridgeSkillInfo } from "@trace/shared";
import { prisma } from "../lib/db.js";
import { AuthenticationError } from "../lib/errors.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { assertOrgAccess, requireOrgContext } from "../lib/require-org.js";
import {
  deriveSessionGroupStatus,
  type SessionGroupStatusSource,
} from "../lib/session-group-status.js";
import { assertScopeAccess } from "../services/access.js";

export const sessionQueries = {
  sessionGroups: (
    _: unknown,
    args: { channelId: string; archived?: boolean | null; status?: string | null },
    ctx: Context,
  ) => {
    return sessionService.listGroups(args.channelId, requireOrgContext(ctx), {
      archived: args.archived ?? undefined,
      status: args.status ?? undefined,
    });
  },
  sessionGroup: (_: unknown, args: { id: string }, ctx: Context) => {
    return sessionService.getGroup(args.id, requireOrgContext(ctx));
  },
  sessions: (
    _: unknown,
    args: { organizationId: string; filters?: SessionFilters },
    ctx: Context,
  ) => {
    assertOrgAccess(ctx, args.organizationId);
    const filters = args.filters ? { ...args.filters } : undefined;
    return sessionService.list(args.organizationId, filters);
  },
  session: (_: unknown, args: { id: string }, ctx: Context) => {
    return sessionService.get(args.id, requireOrgContext(ctx));
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
    return sessionService.search(orgId, args.query, args.channelId ?? undefined);
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
  sessionGroupFileContent: (
    _: unknown,
    args: { sessionGroupId: string; filePath: string },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);
    return sessionService.readFile(args.sessionGroupId, args.filePath, orgId, ctx.userId);
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
    args: { sessionGroupId: string; repoId: string },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return sessionService.getLinkedCheckoutStatus(
      args.sessionGroupId,
      args.repoId,
      orgId,
      ctx.userId,
    );
  },
  sessionSlashCommands: async (_: unknown, args: { sessionId: string }, ctx: Context) => {
    if (!ctx.userId) throw new AuthenticationError();

    const orgId = requireOrgContext(ctx);
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
      (runtimeInstanceId ? sessionRouter.getRuntime(runtimeInstanceId) : null) ??
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
        skills = await sessionRouter.listSkills(runtime.id, args.sessionId, {
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
      clientSource: ctx.clientSource,
    });
  },
  runSession: (
    _: unknown,
    args: { id: string; prompt?: string | null; interactionMode?: string | null },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    return sessionService.run(args.id, args.prompt, args.interactionMode ?? undefined, {
      userId: ctx.userId,
      organizationId: requireOrgContext(ctx),
      clientSource: ctx.clientSource,
    });
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
  deleteSessionGroup: (_: unknown, args: { id: string }, ctx: Context) => {
    return sessionService.deleteGroup(args.id, requireOrgContext(ctx), ctx.actorType, ctx.userId);
  },
  updateSessionConfig: (
    _: unknown,
    args: {
      sessionId: string;
      tool?: CodingTool | null;
      model?: string | null;
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
        hosting: args.hosting ?? undefined,
        runtimeInstanceId: args.runtimeInstanceId ?? undefined,
      },
      ctx.actorType,
      ctx.userId,
    );
  },
  sendSessionMessage: async (
    _: unknown,
    args: {
      sessionId: string;
      text: string;
      imageKeys?: string[] | null;
      interactionMode?: string | null;
      clientMutationId?: string | null;
    },
    ctx: Context,
  ) => {
    await assertScopeAccess("session", args.sessionId, ctx.userId, requireOrgContext(ctx));
    return sessionService.sendMessage({
      sessionId: args.sessionId,
      text: args.text,
      imageKeys: args.imageKeys ?? undefined,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      interactionMode: args.interactionMode ?? undefined,
      clientMutationId: args.clientMutationId ?? undefined,
      clientSource: ctx.clientSource,
    });
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
    args: { sessionId: string; runtimeInstanceId: string },
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
  linkLinkedCheckoutRepo: (
    _: unknown,
    args: { sessionGroupId: string; repoId: string; localPath: string },
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
    );
  },
  syncLinkedCheckout: (
    _: unknown,
    args: {
      sessionGroupId: string;
      repoId: string;
      branch: string;
      commitSha?: string | null;
      autoSyncEnabled?: boolean | null;
      conflictStrategy?: "DISCARD" | "COMMIT" | "REBASE" | null;
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
        commitSha: args.commitSha ?? undefined,
        autoSyncEnabled: args.autoSyncEnabled ?? undefined,
        conflictStrategy:
          args.conflictStrategy === "DISCARD"
            ? "discard"
            : args.conflictStrategy === "COMMIT"
              ? "commit"
              : args.conflictStrategy === "REBASE"
                ? "rebase"
                : undefined,
        commitMessage: args.commitMessage ?? undefined,
      },
    );
  },
  commitLinkedCheckoutChanges: (
    _: unknown,
    args: { sessionGroupId: string; repoId: string; message?: string | null },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return sessionService.commitLinkedCheckoutChanges(
      args.sessionGroupId,
      args.repoId,
      orgId,
      ctx.userId,
      args.message ?? undefined,
    );
  },
  restoreLinkedCheckout: (
    _: unknown,
    args: { sessionGroupId: string; repoId: string },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return sessionService.restoreLinkedCheckout(
      args.sessionGroupId,
      args.repoId,
      orgId,
      ctx.userId,
    );
  },
  setLinkedCheckoutAutoSync: (
    _: unknown,
    args: { sessionGroupId: string; repoId: string; enabled: boolean },
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
    );
  },
  queueSessionMessage: (
    _: unknown,
    args: {
      sessionId: string;
      text: string;
      imageKeys?: string[] | null;
      interactionMode?: string | null;
    },
    ctx: Context,
  ) => {
    return sessionService.queueMessage({
      sessionId: args.sessionId,
      text: args.text,
      imageKeys: args.imageKeys ?? undefined,
      actorId: ctx.userId,
      interactionMode: args.interactionMode ?? undefined,
      organizationId: requireOrgContext(ctx),
      clientSource: ctx.clientSource,
    });
  },
  removeQueuedMessage: (_: unknown, args: { id: string }, ctx: Context) => {
    return sessionService.removeQueuedMessage(args.id, ctx.userId, requireOrgContext(ctx));
  },
  clearQueuedMessages: (_: unknown, args: { sessionId: string }, ctx: Context) => {
    return sessionService.clearQueuedMessages(args.sessionId, ctx.userId, requireOrgContext(ctx));
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
    ultraplan: async (group: { id: string }) => {
      return prisma.ultraplan.findUnique({ where: { sessionGroupId: group.id } });
    },
  },
  Session: {
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
