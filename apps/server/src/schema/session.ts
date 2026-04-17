import type { Context } from "../context.js";
import type { AgentStatus, CodingTool, SessionFilters, StartSessionInput } from "@trace/gql";
import type { CodingTool as CodingToolEnum } from "@prisma/client";
import { sessionService } from "../services/session.js";
import { sessionRouter } from "../lib/session-router.js";
import { BUILTIN_SLASH_COMMANDS } from "@trace/shared";
import { prisma } from "../lib/db.js";
import { AuthenticationError } from "../lib/errors.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { requireOrgContext } from "../lib/require-org.js";
import {
  deriveSessionGroupStatus,
  type SessionGroupStatusSource,
} from "../lib/session-group-status.js";

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
  sessions: (_: unknown, args: { organizationId: string; filters?: SessionFilters }) => {
    const filters = args.filters ? { ...args.filters } : undefined;
    return sessionService.list(args.organizationId, filters);
  },
  session: (_: unknown, args: { id: string }) => {
    return sessionService.get(args.id);
  },
  mySessions: (
    _: unknown,
    args: { organizationId: string; agentStatus?: AgentStatus },
    ctx: Context,
  ) => {
    return sessionService.listByUser(
      args.organizationId,
      ctx.userId,
      args.agentStatus ?? undefined,
    );
  },
  availableSessionRuntimes: (_: unknown, args: { sessionId: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return sessionService.listAvailableRuntimes(args.sessionId, orgId);
  },
  availableRuntimes: (_: unknown, args: { tool: CodingToolEnum }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return sessionService.listRuntimesForTool(args.tool, orgId);
  },
  repoBranches: (
    _: unknown,
    args: { repoId: string; runtimeInstanceId?: string | null },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);
    return sessionService.listBranches(args.repoId, orgId, args.runtimeInstanceId ?? undefined);
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
  sessionSlashCommands: async (_: unknown, args: { sessionId: string }, ctx: Context) => {
    if (!ctx.userId) throw new AuthenticationError();

    const orgId = requireOrgContext(ctx);
    const session = await prisma.session.findFirst({
      where: { id: args.sessionId, organizationId: orgId },
      select: {
        id: true,
        tool: true,
        workdir: true,
        hosting: true,
        createdById: true,
      },
    });
    if (!session || session.tool !== "claude_code") return [];

    const runtime = sessionRouter.getRuntimeForSession(args.sessionId);

    // Try to get skills from bridge
    type SkillResult = Array<{ name: string; description: string; source: "user" | "project" }>;
    let skills: SkillResult = [];
    if (runtime) {
      try {
        const includeUserSkills = session.hosting !== "local" || session.createdById === ctx.userId;
        skills = await sessionRouter.listSkills(
          runtime.id,
          args.sessionId,
          {
            workdirHint: session.workdir ?? undefined,
            includeUserSkills,
            includeProjectSkills: true,
          },
        );
      } catch {
        skills = [];
      }
    }

    if (session.tool !== "claude_code") {
      return [];
    }

    // Merge built-in commands with bridge skills
    const commands: Array<{ name: string; description: string; source: string; category: string }> = [];

    for (const cmd of BUILTIN_SLASH_COMMANDS) {
      commands.push({ name: cmd.name, description: cmd.description, source: "builtin", category: cmd.category });
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
    });
  },
  runSession: (
    _: unknown,
    args: { id: string; prompt?: string | null; interactionMode?: string | null },
    _ctx: Context,
  ) => {
    return sessionService.run(args.id, args.prompt, args.interactionMode ?? undefined);
  },
  terminateSession: (_: unknown, args: { id: string }, ctx: Context) => {
    return sessionService.terminate(args.id, ctx.actorType, ctx.userId);
  },
  dismissSession: (_: unknown, args: { id: string }, ctx: Context) => {
    return sessionService.dismiss(args.id, ctx.actorType, ctx.userId);
  },
  deleteSession: (_: unknown, args: { id: string }, ctx: Context) => {
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
  sendSessionMessage: (
    _: unknown,
    args: {
      sessionId: string;
      text: string;
      interactionMode?: string | null;
      clientMutationId?: string | null;
    },
    ctx: Context,
  ) => {
    return sessionService.sendMessage({
      sessionId: args.sessionId,
      text: args.text,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      interactionMode: args.interactionMode ?? undefined,
      clientMutationId: args.clientMutationId ?? undefined,
    });
  },
  resetSessionDatabase: (_: unknown, args: { sessionId: string }, ctx: Context) => {
    return sessionService.resetSessionDatabase(
      args.sessionId,
      requireOrgContext(ctx),
      ctx.actorType,
      ctx.userId,
    );
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
};

export const sessionTypeResolvers = {
  SessionGroup: {
    status: async (group: {
      id: string;
      prUrl?: string | null;
      archivedAt?: string | Date | null;
      sessions?: SessionGroupStatusSource[];
    }, _args: unknown, ctx: Context) => {
      const sessions = Array.isArray(group.sessions)
        ? group.sessions
        : ((await ctx.sessionGroupLoader.load(group.id)) as { sessions?: SessionGroupStatusSource[] } | null)?.sessions ?? [];
      return deriveSessionGroupStatus(sessions, group.prUrl ?? null, group.archivedAt ?? null);
    },
    sessions: async (group: { id: string; sessions?: unknown[] }, _args: unknown, ctx: Context) => {
      if (Array.isArray(group.sessions)) return group.sessions;
      return ((await ctx.sessionGroupLoader.load(group.id)) as { sessions?: unknown[] } | null)?.sessions ?? [];
    },
    gitCheckpoints: async (group: { id: string }) => {
      return sessionService.listGitCheckpointsForGroup(group.id);
    },
  },
  Session: {
    tickets: (session: { id: string }, _args: unknown, ctx: Context) =>
      ctx.sessionTicketsLoader.load(session.id),
    gitCheckpoints: async (session: { id: string }) => {
      return sessionService.listGitCheckpointsForSession(session.id);
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
    subscribe: (_: unknown, args: { sessionId: string; organizationId: string }) => {
      return pubsub.asyncIterator(topics.sessionPorts(args.sessionId));
    },
  },
  sessionStatusChanged: {
    subscribe: (_: unknown, args: { sessionId: string; organizationId: string }) => {
      return pubsub.asyncIterator(topics.sessionStatus(args.sessionId));
    },
  },
};
