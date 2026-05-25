import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { getSlackClient } from "../lib/slack/client.js";
import { buildTraceSessionLink } from "../lib/slack/event-bridge.js";
import { channelService } from "./channel.js";
import { inboxService } from "./inbox.js";

const SOURCE_TYPE = "slack_session_access_request";

export type SlackSessionAccessRequestValue = {
  slackTeamId: string;
  slackChannelId: string;
  slackThreadTs: string;
  requesterSlackUserId: string;
  inboxItemId?: string;
};

export type SlackSessionAccessRequestPayload = {
  kind: typeof SOURCE_TYPE;
  slackTeamId: string;
  slackChannelId: string;
  slackThreadTs: string;
  requesterSlackUserId: string;
  requesterUserId: string;
  requesterName: string | null;
  requesterEmail: string | null;
  ownerSlackUserId: string;
  sessionId: string;
  sessionGroupId: string | null;
  sessionName: string | null;
  traceChannelId: string;
};

type CreateResult =
  | { status: "requester_unlinked" }
  | { status: "thread_missing" }
  | { status: "already_has_access" }
  | { status: "owner_unlinked" }
  | {
      status: "created";
      inboxItemId: string;
      ownerSlackUserId: string;
      requesterLabel: string;
      traceLink: string | null;
      value: SlackSessionAccessRequestValue;
    };

function sourceId(sessionId: string, requesterUserId: string): string {
  return `${sessionId}:${requesterUserId}`;
}

function userLabel(user: { name: string | null; email: string | null } | null): string {
  return user?.name?.trim() || user?.email?.trim() || "A Trace user";
}

export function encodeSlackSessionAccessRequestValue(
  value: SlackSessionAccessRequestValue,
): string {
  return JSON.stringify(value);
}

export function decodeSlackSessionAccessRequestValue(
  value: string | undefined,
): SlackSessionAccessRequestValue | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SlackSessionAccessRequestValue>;
    if (
      typeof parsed.slackTeamId !== "string" ||
      typeof parsed.slackChannelId !== "string" ||
      typeof parsed.slackThreadTs !== "string" ||
      typeof parsed.requesterSlackUserId !== "string"
    ) {
      return null;
    }
    return {
      slackTeamId: parsed.slackTeamId,
      slackChannelId: parsed.slackChannelId,
      slackThreadTs: parsed.slackThreadTs,
      requesterSlackUserId: parsed.requesterSlackUserId,
      inboxItemId: typeof parsed.inboxItemId === "string" ? parsed.inboxItemId : undefined,
    };
  } catch {
    return null;
  }
}

function parsePayload(payload: Prisma.JsonValue): SlackSessionAccessRequestPayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as Record<string, unknown>;
  if (
    value.kind !== SOURCE_TYPE ||
    typeof value.slackTeamId !== "string" ||
    typeof value.slackChannelId !== "string" ||
    typeof value.slackThreadTs !== "string" ||
    typeof value.requesterSlackUserId !== "string" ||
    typeof value.requesterUserId !== "string" ||
    typeof value.ownerSlackUserId !== "string" ||
    typeof value.sessionId !== "string" ||
    typeof value.traceChannelId !== "string"
  ) {
    return null;
  }
  return {
    kind: SOURCE_TYPE,
    slackTeamId: value.slackTeamId,
    slackChannelId: value.slackChannelId,
    slackThreadTs: value.slackThreadTs,
    requesterSlackUserId: value.requesterSlackUserId,
    requesterUserId: value.requesterUserId,
    requesterName: typeof value.requesterName === "string" ? value.requesterName : null,
    requesterEmail: typeof value.requesterEmail === "string" ? value.requesterEmail : null,
    ownerSlackUserId: value.ownerSlackUserId,
    sessionId: value.sessionId,
    sessionGroupId: typeof value.sessionGroupId === "string" ? value.sessionGroupId : null,
    sessionName: typeof value.sessionName === "string" ? value.sessionName : null,
    traceChannelId: value.traceChannelId,
  };
}

async function canAccessTraceChannel(input: {
  userId: string;
  organizationId: string;
  traceChannelId: string;
}): Promise<boolean> {
  const channel = await prisma.channel.findFirst({
    where: {
      id: input.traceChannelId,
      organizationId: input.organizationId,
      members: { some: { userId: input.userId, leftAt: null } },
    },
    select: { id: true },
  });
  return !!channel;
}

async function notifyRequester(payload: SlackSessionAccessRequestPayload, text: string): Promise<void> {
  const client = await getSlackClient(payload.slackTeamId);
  if (!client) return;
  await client.chat
    .postEphemeral({
      channel: payload.slackChannelId,
      user: payload.requesterSlackUserId,
      thread_ts: payload.slackThreadTs,
      text,
    })
    .catch(() => {});
}

export class SlackSessionAccessService {
  async createRequest(value: SlackSessionAccessRequestValue): Promise<CreateResult> {
    const requesterAccount = await prisma.slackAccount.findUnique({
      where: {
        slackUserId_slackTeamId: {
          slackTeamId: value.slackTeamId,
          slackUserId: value.requesterSlackUserId,
        },
      },
      select: { userId: true },
    });
    if (!requesterAccount) return { status: "requester_unlinked" };

    const thread = await prisma.slackThreadSession.findUnique({
      where: {
        slackTeamId_slackChannelId_slackThreadTs: {
          slackTeamId: value.slackTeamId,
          slackChannelId: value.slackChannelId,
          slackThreadTs: value.slackThreadTs,
        },
      },
      select: {
        sessionId: true,
        organizationId: true,
        session: {
          select: {
            channelId: true,
            createdById: true,
            name: true,
            sessionGroupId: true,
          },
        },
      },
    });
    const traceChannelId = thread?.session.channelId;
    if (!thread || !traceChannelId) return { status: "thread_missing" };

    if (
      await canAccessTraceChannel({
        userId: requesterAccount.userId,
        organizationId: thread.organizationId,
        traceChannelId,
      })
    ) {
      return { status: "already_has_access" };
    }

    const ownerAccount = await prisma.slackAccount.findFirst({
      where: { slackTeamId: value.slackTeamId, userId: thread.session.createdById },
      select: { slackUserId: true },
    });
    if (!ownerAccount) return { status: "owner_unlinked" };

    const requester = await prisma.user.findUnique({
      where: { id: requesterAccount.userId },
      select: { name: true, email: true },
    });
    const requesterLabel = userLabel(requester);
    const existing = await prisma.inboxItem.findFirst({
      where: {
        organizationId: thread.organizationId,
        userId: thread.session.createdById,
        sourceType: SOURCE_TYPE,
        sourceId: sourceId(thread.sessionId, requesterAccount.userId),
        status: "active",
      },
    });

    const payload: SlackSessionAccessRequestPayload = {
      kind: SOURCE_TYPE,
      slackTeamId: value.slackTeamId,
      slackChannelId: value.slackChannelId,
      slackThreadTs: value.slackThreadTs,
      requesterSlackUserId: value.requesterSlackUserId,
      requesterUserId: requesterAccount.userId,
      requesterName: requester?.name ?? null,
      requesterEmail: requester?.email ?? null,
      ownerSlackUserId: ownerAccount.slackUserId,
      sessionId: thread.sessionId,
      sessionGroupId: thread.session.sessionGroupId ?? null,
      sessionName: thread.session.name ?? null,
      traceChannelId,
    };

    const inboxItem =
      existing ??
      (await inboxService.createItem({
        orgId: thread.organizationId,
        userId: thread.session.createdById,
        itemType: "question",
        title: "Slack session access request",
        summary: `${requesterLabel} requested access to ${thread.session.name ?? "a Trace session"}.`,
        payload: payload as unknown as Prisma.InputJsonValue,
        sourceType: SOURCE_TYPE,
        sourceId: sourceId(thread.sessionId, requesterAccount.userId),
      }));

    return {
      status: "created",
      inboxItemId: inboxItem.id,
      ownerSlackUserId: ownerAccount.slackUserId,
      requesterLabel,
      traceLink: await buildTraceSessionLink(thread.sessionId),
      value: { ...value, inboxItemId: inboxItem.id },
    };
  }

  async approveInboxRequest(inboxItemId: string, actorUserId: string) {
    const item = await prisma.inboxItem.findFirstOrThrow({
      where: { id: inboxItemId, userId: actorUserId, status: "active" },
    });
    const payload = parsePayload(item.payload);
    if (!payload) throw new Error("Invalid Slack session access request");

    await channelService.addMember(payload.traceChannelId, payload.requesterUserId, "user", actorUserId);
    const resolved = await inboxService.resolve(item.id, actorUserId, item.organizationId, "approved");
    await notifyRequester(payload, "Access approved. You can reply in this Slack thread now.");
    return resolved;
  }

  async denyInboxRequest(inboxItemId: string, actorUserId: string) {
    const item = await prisma.inboxItem.findFirstOrThrow({
      where: { id: inboxItemId, userId: actorUserId, status: "active" },
    });
    const payload = parsePayload(item.payload);
    if (!payload) throw new Error("Invalid Slack session access request");

    const resolved = await inboxService.resolve(item.id, actorUserId, item.organizationId, "denied");
    await notifyRequester(payload, "Access request denied.");
    return resolved;
  }
}

export const slackSessionAccessService = new SlackSessionAccessService();
