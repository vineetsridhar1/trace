import { Prisma } from "@prisma/client";
import type { ActorType } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { ValidationError } from "../lib/errors.js";
import { eventService } from "./event.js";
import { sessionService } from "./session.js";
import { orgMemberService } from "./org-member.js";

type SuggestedActionInput = Record<string, unknown>;

function jsonRecord(value: unknown): SuggestedActionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Suggested action input must be an object");
  }
  return value as SuggestedActionInput;
}

function validateInput(actionType: string, input: SuggestedActionInput): void {
  if (actionType === "send_session_message") {
    if (typeof input.body !== "string" || input.body.trim().length === 0) {
      throw new ValidationError("send_session_message requires input.body");
    }
    return;
  }

  if (actionType === "create_session") {
    if (typeof input.prompt !== "string" || input.prompt.trim().length === 0) {
      throw new ValidationError("create_session requires input.prompt");
    }
    if (input.title != null && typeof input.title !== "string") {
      throw new ValidationError("create_session input.title must be a string");
    }
    return;
  }

  throw new ValidationError(`Unsupported suggested action type: ${actionType}`);
}

function serializeActor(type: ActorType | null, id: string | null) {
  if (!type || !id) return null;
  return { type, id };
}

function serializeSuggestedAction(action: {
  id: string;
  organizationId: string;
  assistantSessionId: string;
  status: string;
  actionType: string;
  targetType: string;
  targetId: string | null;
  input: Prisma.JsonValue;
  rationale: string | null;
  proposedByActorType: ActorType;
  proposedByActorId: string;
  approvedByActorType: ActorType | null;
  approvedByActorId: string | null;
  approvedAt: Date | null;
  dismissedByActorType: ActorType | null;
  dismissedByActorId: string | null;
  dismissedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: action.id,
    organizationId: action.organizationId,
    assistantSessionId: action.assistantSessionId,
    status: action.status,
    actionType: action.actionType,
    targetType: action.targetType,
    targetId: action.targetId,
    input: action.input,
    rationale: action.rationale,
    proposedBy: serializeActor(action.proposedByActorType, action.proposedByActorId),
    approvedBy: serializeActor(action.approvedByActorType, action.approvedByActorId),
    approvedAt: action.approvedAt?.toISOString() ?? null,
    dismissedBy: serializeActor(action.dismissedByActorType, action.dismissedByActorId),
    dismissedAt: action.dismissedAt?.toISOString() ?? null,
    createdAt: action.createdAt.toISOString(),
    updatedAt: action.updatedAt.toISOString(),
  };
}

export class SuggestedActionService {
  async get(id: string, organizationId: string, userId: string) {
    await orgMemberService.assertAdmin(userId, organizationId);
    return prisma.suggestedAction.findFirst({ where: { id, organizationId } });
  }

  async create(input: {
    organizationId: string;
    assistantSessionId: string;
    actionType: "send_session_message" | "create_session";
    targetType: "session" | "organization";
    targetId?: string | null;
    actionInput: unknown;
    rationale?: string | null;
    proposedByActorType: ActorType;
    proposedByActorId: string;
  }) {
    const assistantSession = await prisma.session.findFirst({
      where: {
        id: input.assistantSessionId,
        organizationId: input.organizationId,
        kind: "org_assistant",
      },
      select: { id: true },
    });
    if (!assistantSession) throw new ValidationError("Assistant session not found");

    if (input.actionType === "send_session_message") {
      if (input.targetType !== "session" || !input.targetId) {
        throw new ValidationError("send_session_message must target a session");
      }
      const target = await prisma.session.findFirst({
        where: { id: input.targetId, organizationId: input.organizationId },
        select: { id: true },
      });
      if (!target) throw new ValidationError("Target session not found");
    }
    if (input.actionType === "create_session" && input.targetType !== "organization") {
      throw new ValidationError("create_session must target the organization");
    }

    const actionInput = jsonRecord(input.actionInput);
    validateInput(input.actionType, actionInput);

    const action = await prisma.suggestedAction.create({
      data: {
        organizationId: input.organizationId,
        assistantSessionId: input.assistantSessionId,
        actionType: input.actionType,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        input: actionInput as Prisma.InputJsonValue,
        rationale: input.rationale ?? null,
        proposedByActorType: input.proposedByActorType,
        proposedByActorId: input.proposedByActorId,
      },
    });

    await eventService.create({
      organizationId: input.organizationId,
      scopeType: "session",
      scopeId: input.assistantSessionId,
      eventType: "suggested_action_created",
      payload: { suggestedAction: serializeSuggestedAction(action) } as Prisma.InputJsonValue,
      actorType: input.proposedByActorType,
      actorId: input.proposedByActorId,
    });

    return action;
  }

  async approve(id: string, organizationId: string, userId: string) {
    await orgMemberService.assertAdmin(userId, organizationId);

    const claimed = await prisma.suggestedAction.updateMany({
      where: { id, organizationId, status: "pending" },
      data: {
        status: "approved",
        approvedByActorType: "user",
        approvedByActorId: userId,
        approvedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      const existing = await prisma.suggestedAction.findFirst({ where: { id, organizationId } });
      if (!existing) throw new ValidationError("Suggested action not found");
      throw new ValidationError("Suggested action is not pending");
    }

    const action = await prisma.suggestedAction.findFirst({ where: { id, organizationId } });
    if (!action) throw new ValidationError("Suggested action not found");

    const input = jsonRecord(action.input);
    validateInput(action.actionType, input);

    if (action.actionType === "send_session_message") {
      if (!action.targetId) throw new ValidationError("Target session missing");
      await sessionService.sendMessage({
        sessionId: action.targetId,
        text: String(input.body),
        actorType: "user",
        actorId: userId,
      });
    } else if (action.actionType === "create_session") {
      const title = typeof input.title === "string" ? input.title.trim() : "";
      await sessionService.start({
        organizationId,
        createdById: userId,
        actorType: "user",
        prompt: String(input.prompt),
        name: title || undefined,
        channelId: typeof input.channelId === "string" ? input.channelId : undefined,
        repoId: typeof input.repoId === "string" ? input.repoId : undefined,
      });
    }

    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: action.assistantSessionId,
      eventType: "suggested_action_approved",
      payload: { suggestedAction: serializeSuggestedAction(action) } as Prisma.InputJsonValue,
      actorType: "user",
      actorId: userId,
    });

    return action;
  }

  async dismiss(id: string, organizationId: string, userId: string) {
    await orgMemberService.assertAdmin(userId, organizationId);

    const claimed = await prisma.suggestedAction.updateMany({
      where: { id, organizationId, status: "pending" },
      data: {
        status: "dismissed",
        dismissedByActorType: "user",
        dismissedByActorId: userId,
        dismissedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      const existing = await prisma.suggestedAction.findFirst({ where: { id, organizationId } });
      if (!existing) throw new ValidationError("Suggested action not found");
      throw new ValidationError("Suggested action is not pending");
    }

    const action = await prisma.suggestedAction.findFirst({ where: { id, organizationId } });
    if (!action) throw new ValidationError("Suggested action not found");

    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: action.assistantSessionId,
      eventType: "suggested_action_dismissed",
      payload: { suggestedAction: serializeSuggestedAction(action) } as Prisma.InputJsonValue,
      actorType: "user",
      actorId: userId,
    });

    return action;
  }
}

export const suggestedActionService = new SuggestedActionService();
