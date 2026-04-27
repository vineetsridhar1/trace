import type { Event as PrismaEvent, EventType } from "@prisma/client";
import { asJsonObject } from "@trace/shared";
import { prisma } from "../lib/db.js";
import { pushTokenService } from "./pushTokenService.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_CHUNK_SIZE = 100;

const SESSION_STATUS_EVENTS = new Set<EventType>([
  "session_terminated",
  "session_pr_merged",
]);

const agentStatusLabel: Record<string, string> = {
  active: "Active",
  done: "Done",
  failed: "Failed",
  not_started: "Creating...",
  stopped: "Stopped",
};

interface PushMessage {
  to: string;
  title: string;
  body?: string;
  data: { deepLink: string };
}

interface NotificationContent {
  title: string;
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

function statusLabel(payload: unknown, fallback: string | null): string {
  const data = asJsonObject(payload);
  const status =
    typeof data?.agentStatus === "string"
      ? data.agentStatus
      : typeof data?.sessionStatus === "string"
        ? data.sessionStatus
        : fallback;
  return status ? (agentStatusLabel[status] ?? status) : "updated";
}

export class PushNotificationService {
  async notifyForEvent(event: PrismaEvent): Promise<void> {
    if (event.eventType === "bridge_access_requested") {
      await this.notifyBridgeAccessRequested(event);
      return;
    }

    if (SESSION_STATUS_EVENTS.has(event.eventType) && event.scopeType === "session") {
      await this.notifySessionStatus(event);
    }
  }

  private async notifySessionStatus(event: PrismaEvent): Promise<void> {
    const session = await prisma.session.findUnique({
      where: { id: event.scopeId },
      select: {
        createdById: true,
        name: true,
        sessionGroupId: true,
        agentStatus: true,
      },
    });
    if (!session?.createdById || !session.sessionGroupId) return;
    if (event.actorType === "user" && event.actorId === session.createdById) return;

    const name = session.name?.trim() || "Untitled session";
    await this.sendToUser(session.createdById, event.organizationId, {
      title: `"${name}" is now ${statusLabel(event.payload, session.agentStatus)}`,
      deepLink: `trace://sessions/${session.sessionGroupId}/${event.scopeId}`,
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
