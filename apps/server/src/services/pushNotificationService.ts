import type { Event as PrismaEvent, EventType } from "@prisma/client";
import { asJsonObject } from "@trace/shared";
import { prisma } from "../lib/db.js";
import { pushTokenService } from "./pushTokenService.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_CHUNK_SIZE = 100;

interface PushMessage {
  to: string;
  title: string;
  subtitle?: string;
  body?: string;
  data: { deepLink: string };
}

interface NotificationContent {
  title: string;
  subtitle?: string;
  body?: string;
  deepLink: string;
}

function isExpoPushToken(token: string): boolean {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function bridgeAccessNotification(payload: unknown): {
  ownerUserId: string;
  content: NotificationContent;
} | null {
  const data = asJsonObject(payload);
  if (!data) return null;
  if (data.status !== "pending") return null;
  if (typeof data.ownerUserId !== "string") return null;

  const requesterUser = asJsonObject(data.requesterUser);
  const requesterName =
    typeof requesterUser?.name === "string" && requesterUser.name.trim()
      ? requesterUser.name.trim()
      : "A teammate";
  const runtimeLabel =
    typeof data.runtimeLabel === "string" && data.runtimeLabel.trim()
      ? data.runtimeLabel.trim()
      : "your bridge";

  return {
    ownerUserId: data.ownerUserId,
    content: {
      title: `${requesterName} requested bridge access`,
      body: `Review access for ${runtimeLabel}`,
      deepLink: "trace://connections",
    },
  };
}

function truncatePreview(text: string, max = 140): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function extractAssistantPreview(eventType: EventType, payload: unknown): string | null {
  const data = asJsonObject(payload);
  if (!data) return null;

  if (eventType === "message_sent") {
    return typeof data.text === "string" && data.text.trim() ? data.text : null;
  }

  if (eventType !== "session_output" || data.type !== "assistant") return null;

  const message = asJsonObject(data.message);
  const content = message?.content;
  if (!Array.isArray(content)) return null;

  for (const block of content) {
    const candidate = asJsonObject(block);
    if (candidate?.type === "text" && typeof candidate.text === "string" && candidate.text.trim()) {
      return candidate.text;
    }
  }

  return null;
}

function isNeedsInputOutput(eventType: EventType, payload: unknown): boolean {
  const data = asJsonObject(payload);
  if (eventType !== "session_output") return false;
  return data?.type === "question_pending" || data?.type === "plan_pending";
}

function isCompletedTermination(payload: unknown): boolean {
  const data = asJsonObject(payload);
  if (!data) return false;
  if (data.sessionStatus === "needs_input") return false;
  return data.agentStatus === "done" || data.sessionStatus === "merged";
}

function completionNotification(sessionName: string, sessionGroupId: string, sessionId: string) {
  return {
    title: sessionName,
    subtitle: "",
    body: "AI completed this session",
    deepLink: `trace://sessions/${sessionGroupId}/${sessionId}`,
  } satisfies NotificationContent;
}

function needsInputNotification(sessionName: string, sessionGroupId: string, sessionId: string) {
  return {
    title: sessionName,
    subtitle: "",
    body: "AI is awaiting your input",
    deepLink: `trace://sessions/${sessionGroupId}/${sessionId}`,
  } satisfies NotificationContent;
}

interface SessionNotificationContext {
  createdById: string;
  name: string;
  channelName: string;
  sessionGroupId: string;
}

async function loadLatestRunClientSource(sessionId: string, before: Date): Promise<string | null> {
  const events = await prisma.event.findMany({
    where: {
      scopeType: "session",
      scopeId: sessionId,
      timestamp: { lt: before },
      eventType: { in: ["session_started", "session_resumed"] },
    },
    orderBy: { timestamp: "desc" },
    take: 10,
  });

  for (const event of events) {
    const data = asJsonObject(event.payload);
    if (typeof data?.clientSource === "string" && data.clientSource.trim()) {
      return data.clientSource.trim();
    }
  }

  return null;
}

async function loadSessionNotificationContext(
  sessionId: string,
): Promise<SessionNotificationContext | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      createdById: true,
      name: true,
      sessionGroupId: true,
      channel: { select: { name: true } },
    },
  });
  if (!session?.createdById || !session.sessionGroupId) return null;
  return {
    createdById: session.createdById,
    name: session.name?.trim() || "Untitled session",
    channelName: session.channel?.name?.trim()
      ? `#${session.channel.name.trim()}`
      : "#unknown-channel",
    sessionGroupId: session.sessionGroupId,
  };
}

async function loadLatestAssistantPreview(sessionId: string, before: Date): Promise<string | null> {
  const events = await prisma.event.findMany({
    where: {
      scopeType: "session",
      scopeId: sessionId,
      timestamp: { lt: before },
      eventType: { in: ["session_output", "message_sent"] },
    },
    orderBy: { timestamp: "desc" },
    take: 20,
  });

  for (const candidate of events) {
    const preview = extractAssistantPreview(candidate.eventType, candidate.payload);
    if (preview) return truncatePreview(preview);
  }

  return null;
}

export class PushNotificationService {
  async notifyForEvent(event: PrismaEvent): Promise<void> {
    if (event.eventType === "bridge_access_requested") {
      await this.notifyBridgeAccessRequested(event);
      return;
    }

    if (event.scopeType !== "session") return;

    if (
      event.eventType === "session_output" &&
      isNeedsInputOutput(event.eventType, event.payload)
    ) {
      await this.notifyNeedsInput(event);
      return;
    }

    if (event.eventType === "session_terminated" && isCompletedTermination(event.payload)) {
      await this.notifyCompleted(event);
      return;
    }

    if (event.eventType === "session_pr_merged") {
      await this.notifyCompleted(event);
    }
  }

  private async notifyCompleted(event: PrismaEvent): Promise<void> {
    const [session, preview, clientSource] = await Promise.all([
      loadSessionNotificationContext(event.scopeId),
      loadLatestAssistantPreview(event.scopeId, event.timestamp),
      loadLatestRunClientSource(event.scopeId, event.timestamp),
    ]);
    if (!session) return;
    if (clientSource !== "mobile") return;
    if (event.actorType === "user" && event.actorId === session.createdById) return;

    const content = completionNotification(session.name, session.sessionGroupId, event.scopeId);
    await this.sendToUser(session.createdById, event.organizationId, {
      ...content,
      subtitle: session.channelName,
      body: preview ?? content.body,
    });
  }

  private async notifyNeedsInput(event: PrismaEvent): Promise<void> {
    const [session, preview, clientSource] = await Promise.all([
      loadSessionNotificationContext(event.scopeId),
      loadLatestAssistantPreview(event.scopeId, event.timestamp),
      loadLatestRunClientSource(event.scopeId, event.timestamp),
    ]);
    if (!session) return;
    if (clientSource !== "mobile") return;
    if (event.actorType === "user" && event.actorId === session.createdById) return;

    const content = needsInputNotification(session.name, session.sessionGroupId, event.scopeId);
    await this.sendToUser(session.createdById, event.organizationId, {
      ...content,
      subtitle: session.channelName,
      body: preview ?? content.body,
    });
  }

  private async notifyBridgeAccessRequested(event: PrismaEvent): Promise<void> {
    const notification = bridgeAccessNotification(event.payload);
    if (!notification) return;
    if (event.actorType === "user" && event.actorId === notification.ownerUserId) return;

    await this.sendToUser(notification.ownerUserId, event.organizationId, notification.content);
  }

  private async sendToUser(
    userId: string,
    organizationId: string,
    content: NotificationContent,
  ): Promise<void> {
    const tokens = await pushTokenService.listActiveTokensForUser(userId, organizationId);
    const messages: PushMessage[] = tokens
      .map((row) => row.token)
      .filter(isExpoPushToken)
      .map((token) => ({
        to: token,
        title: content.title,
        subtitle: content.subtitle,
        body: content.body,
        data: { deepLink: content.deepLink },
      }));

    for (const chunk of chunks(messages, EXPO_CHUNK_SIZE)) {
      if (chunk.length === 0) continue;
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      });
      if (!response.ok) {
        throw new Error(`Expo push send failed with ${response.status}`);
      }
    }
  }
}

export const pushNotificationService = new PushNotificationService();
