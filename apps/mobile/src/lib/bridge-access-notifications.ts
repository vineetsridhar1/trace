import * as Notifications from "expo-notifications";
import { registerHandler, useAuthStore } from "@trace/client-core";
import type { Event } from "@trace/gql";

const FOREGROUND_BRIDGE_ACCESS_KEY = "bridge_access_requested";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function bridgeAccessNotification(event: Event): {
  title: string;
  body: string;
  requestId: string;
} | null {
  const currentUserId = useAuthStore.getState().user?.id;
  if (!currentUserId) return null;

  const payload = asRecord(event.payload);
  if (!payload) return null;
  if (payload.status !== "pending") return null;
  if (payload.ownerUserId !== currentUserId) return null;
  if (typeof payload.requestId !== "string") return null;

  const requesterUser = asRecord(payload.requesterUser);
  const requesterName =
    typeof requesterUser?.name === "string" && requesterUser.name.trim()
      ? requesterUser.name.trim()
      : event.actor.name?.trim() || "A teammate";
  const runtimeLabel =
    typeof payload.runtimeLabel === "string" && payload.runtimeLabel.trim()
      ? payload.runtimeLabel.trim()
      : "your bridge";

  return {
    title: `${requesterName} requested bridge access`,
    body: `Review access for ${runtimeLabel}`,
    requestId: payload.requestId,
  };
}

async function handleBridgeAccessRequested(event: Event): Promise<void> {
  const notification = bridgeAccessNotification(event);
  if (!notification) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: notification.title,
      body: notification.body,
      data: {
        deepLink: "trace://connections",
        foregroundPresentation: FOREGROUND_BRIDGE_ACCESS_KEY,
        requestId: notification.requestId,
      },
    },
    trigger: null,
  });
}

registerHandler("bridge_access_requested", (event) => {
  void handleBridgeAccessRequested(event).catch((err: unknown) => {
    console.warn("[bridge-access-notifications] failed to show notification", err);
  });
});
