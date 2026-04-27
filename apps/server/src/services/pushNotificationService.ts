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
    subtitle: "AI completed this session",
    body: "Open Trace to review the latest response",
    deepLink: `trace://sessions/${sessionGroupId}/${sessionId}`,
  } satisfies NotificationContent;
}

function needsInputNotification(sessionName: string, sessionGroupId: string, sessionId: string) {
  return {
    title: sessionName,
    subtitle: "AI is awaiting your input",
    body: "Open Trace to respond",
    deepLink: `trace://sessions/${sessionGroupId}/${sessionId}`,
  } satisfies NotificationContent;
}

interface SessionNotificationContext {
  createdById: string;
  name: string;
  sessionGroupId: string;
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
    },
  });
  if (!session?.createdById || !session.sessionGroupId) return null;
  return {
    createdById: session.createdById,
    name: session.name?.trim() || "Untitled session",
    sessionGroupId: session.sessionGroupId,
  };
}

export class PushNotificationService {
  async notifyForEvent(event: PrismaEvent): Promise<void> {
    if (event.eventType === "bridge_access_requested") {
      await this.notifyBridgeAccessRequested(event);
      return;
    }

    if (event.scopeType !== "session") return;

    if (event.eventType === "session_output" && isNeedsInputOutput(event.eventType, event.payload)) {
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
    const session = await loadSessionNotificationContext(event.scopeId);
    if (!session) return;
    if (event.actorType === "user" && event.actorId === session.createdById) return;

    await this.sendToUser(
      session.createdById,
      event.organizationId,
      completionNotification(session.name, session.sessionGroupId, event.scopeId),
    );
  }

  private async notifyNeedsInput(event: PrismaEvent): Promise<void> {
    const session = await loadSessionNotificationContext(event.scopeId);
    if (!session) return;
    if (event.actorType === "user" && event.actorId === session.createdById) return;

    await this.sendToUser(
      session.createdById,
      event.organizationId,
      needsInputNotification(session.name, session.sessionGroupId, event.scopeId),
    );
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
