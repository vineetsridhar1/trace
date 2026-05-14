import { Prisma } from "@prisma/client";
import type { CodingTool } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { orgMemberService } from "./org-member.js";
import { eventService } from "./event.js";
import { sessionRouter } from "../lib/session-router.js";
import { TRACE_AI_USER_ID } from "../lib/ai-user.js";

const DEFAULT_ASSISTANT_NAME = "Org Assistant";
const DEFAULT_ASSISTANT_TOOL: CodingTool = "claude_code";

function defaultConnection(input?: {
  runtimeInstanceId?: string;
  runtimeLabel?: string;
}): Prisma.InputJsonValue {
  return {
    state: input?.runtimeInstanceId ? "connected" : "pending",
    retryCount: 0,
    canRetry: true,
    canMove: true,
    autoRetryable: true,
    version: 0,
    ...(input?.runtimeInstanceId ? { runtimeInstanceId: input.runtimeInstanceId } : {}),
    ...(input?.runtimeLabel ? { runtimeLabel: input.runtimeLabel } : {}),
  } satisfies Prisma.InputJsonObject;
}

function orgAssistantWorkdir(): string {
  return process.env.HOME || process.cwd();
}

type OrgAssistantSessionPayload = Prisma.SessionGetPayload<{
  include: {
    createdBy: true;
    repo: true;
    channel: true;
    sessionGroup: true;
  };
}>;

function serializeSession(session: OrgAssistantSessionPayload) {
  return {
    id: session.id,
    name: session.name,
    kind: session.kind,
    agentStatus: session.agentStatus,
    sessionStatus: session.sessionStatus,
    tool: session.tool,
    model: session.model,
    reasoningEffort: session.reasoningEffort,
    hosting: session.hosting,
    createdBy: {
      id: session.createdBy.id,
      name: session.createdBy.name,
      email: session.createdBy.email,
      avatarUrl: session.createdBy.avatarUrl,
    },
    repo: null,
    repoId: null,
    branch: null,
    workdir: session.workdir,
    channel: null,
    channelId: null,
    sessionGroupId: null,
    sessionGroup: null,
    connection: session.connection,
    worktreeDeleted: session.worktreeDeleted,
    lastUserMessageAt: null,
    lastMessageAt: null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export class OrgAssistantService {
  async listOrgAssistantSessions(orgId: string, userId: string) {
    await orgMemberService.assertAdmin(userId, orgId);

    return prisma.session.findMany({
      where: {
        organizationId: orgId,
        kind: "org_assistant",
        channelId: null,
        repoId: null,
        sessionGroupId: null,
      },
      orderBy: { updatedAt: "desc" },
      include: {
        createdBy: true,
        repo: true,
        channel: true,
        sessionGroup: true,
      },
    });
  }

  async getOrCreateOrgAssistantSession(orgId: string, userId: string) {
    const existing = await this.listOrgAssistantSessions(orgId, userId);
    if (existing[0]) return existing[0];
    return this.createOrgAssistantSession(orgId, userId);
  }

  async createOrgAssistantSession(orgId: string, userId: string) {
    await orgMemberService.assertAdmin(userId, orgId);

    const defaults = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        defaultSessionTool: true,
        defaultSessionModel: true,
        defaultSessionReasoningEffort: true,
      },
    });
    const tool = defaults?.defaultSessionTool ?? DEFAULT_ASSISTANT_TOOL;
    const runtime = sessionRouter
      .listRuntimes()
      .find(
        (candidate) =>
          candidate.organizationId === orgId &&
          candidate.ws.readyState === candidate.ws.OPEN &&
          candidate.supportedTools.includes(tool),
      );

    const session = await prisma.session.create({
      data: {
        name: DEFAULT_ASSISTANT_NAME,
        kind: "org_assistant",
        agentStatus: "not_started",
        sessionStatus: "in_progress",
        tool,
        model: defaults?.defaultSessionModel ?? undefined,
        reasoningEffort: defaults?.defaultSessionReasoningEffort ?? undefined,
        hosting: runtime?.hostingMode ?? "local",
        organizationId: orgId,
        createdById: userId,
        workdir: orgAssistantWorkdir(),
        connection: defaultConnection(
          runtime ? { runtimeInstanceId: runtime.id, runtimeLabel: runtime.label } : undefined,
        ),
      },
      include: {
        createdBy: true,
        repo: true,
        channel: true,
        sessionGroup: true,
      },
    });

    if (runtime) {
      sessionRouter.bindSession(session.id, runtime.key);
    }

    await eventService.create({
      organizationId: orgId,
      scopeType: "session",
      scopeId: session.id,
      eventType: "session_started",
      payload: {
        session: serializeSession(session),
        sessionGroup: null,
        prompt: null,
        orgAssistant: true,
      } as Prisma.InputJsonValue,
      actorType: "system",
      actorId: TRACE_AI_USER_ID,
    });

    return session;
  }
}

export const orgAssistantService = new OrgAssistantService();
