import type { Event as PrismaEvent, Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { TRACE_AI_USER_ID } from "../lib/ai-user.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

type SessionMessageSource = Pick<
  PrismaEvent,
  | "id"
  | "scopeType"
  | "scopeId"
  | "eventType"
  | "payload"
  | "actorType"
  | "actorId"
  | "organizationId"
  | "timestamp"
  | "parentId"
  | "metadata"
>;

type MessageData = {
  role: "user" | "assistant" | "system";
  text: string;
  content: Prisma.InputJsonValue;
  attachments?: Prisma.InputJsonValue;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((block) => {
      const value = asRecord(block);
      return value?.type === "text" && typeof value.text === "string" ? [value.text] : [];
    })
    .join("\n\n");
}

function userRole(actorType: PrismaEvent["actorType"]): MessageData["role"] {
  if (actorType === "agent") return "assistant";
  return actorType === "user" ? "user" : "system";
}

export function sessionMessageDataFromEvent(event: SessionMessageSource): MessageData | null {
  if (event.scopeType !== "session") return null;
  const payload = asRecord(event.payload);
  if (!payload) return null;

  if (event.eventType === "session_started") {
    if (typeof payload.prompt !== "string") {
      return { role: "system", text: "", content: event.payload as Prisma.InputJsonValue };
    }
    return {
      role: "user",
      text: payload.prompt,
      content: [{ type: "text", text: payload.prompt }],
      ...(stringArray(payload.imageKeys).length > 0 ? { attachments: stringArray(payload.imageKeys) } : {}),
    };
  }

  if (event.eventType === "message_sent") {
    if (typeof payload.text !== "string") {
      return { role: userRole(event.actorType), text: "", content: event.payload as Prisma.InputJsonValue };
    }
    const attachmentKeys = stringArray(payload.attachmentKeys);
    return {
      role: userRole(event.actorType),
      text: payload.text,
      content: [{ type: "text", text: payload.text }],
      ...(attachmentKeys.length > 0 ? { attachments: attachmentKeys } : {}),
    };
  }

  if (event.eventType !== "session_output" || payload.type !== "assistant") {
    return { role: "system", text: "", content: event.payload as Prisma.InputJsonValue };
  }
  const message = asRecord(payload.message);
  const content = message?.content;
  if (!Array.isArray(content)) {
    return { role: "system", text: "", content: event.payload as Prisma.InputJsonValue };
  }

  return {
    role: "assistant",
    text: textFromContent(content),
    content: content as Prisma.InputJsonValue,
  };
}

export function sessionMessageCreateDataFromEvent(
  event: SessionMessageSource,
): Prisma.SessionMessageCreateManyInput | null {
  const data = sessionMessageDataFromEvent(event);
  if (!data) return null;

  return {
    sessionId: event.scopeId,
    organizationId: event.organizationId,
    role: data.role,
    eventType: event.eventType,
    actorType: data.role === "assistant" ? "agent" : event.actorType,
    actorId: data.role === "assistant" ? TRACE_AI_USER_ID : event.actorId,
    text: data.text,
    content: data.content,
    payload: event.payload as Prisma.InputJsonValue,
    ...(event.metadata ? { metadata: event.metadata as Prisma.InputJsonValue } : {}),
    ...(event.parentId ? { parentEventId: event.parentId } : {}),
    ...(data.attachments ? { attachments: data.attachments } : {}),
    sourceEventId: event.id,
    createdAt: event.timestamp,
  };
}

export class SessionMessageService {
  async upsertFromEvent(event: SessionMessageSource, db: DbClient = prisma): Promise<void> {
    const data = sessionMessageCreateDataFromEvent(event);
    if (!data) return;

    await db.sessionMessage.upsert({
      where: { sourceEventId: event.id },
      create: data,
      update: {},
    });
  }

  async list(sessionId: string, before?: Date, beforeMessageId?: string, limit = 100) {
    if (before && !beforeMessageId) throw new Error("beforeMessageId is required with before");
    const messages = await prisma.sessionMessage.findMany({
      where: {
        sessionId,
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before } },
                { AND: [{ createdAt: before }, { id: { lt: beforeMessageId! } }] },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.max(1, Math.min(limit, 200)),
    });
    return messages.reverse();
  }
}

export const sessionMessageService = new SessionMessageService();
