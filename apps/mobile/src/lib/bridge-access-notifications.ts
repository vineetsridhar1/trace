import * as Notifications from "expo-notifications";
import { registerHandler, useAuthStore } from "@trace/client-core";
import type { Event } from "@trace/gql";

const FOREGROUND_BRIDGE_ACCESS_REQUESTED_KEY = "bridge_access_requested";
const FOREGROUND_BRIDGE_ACCESS_RESOLVED_KEY = "bridge_access_resolved";
const FOREGROUND_BRIDGE_ACCESS_REVOKED_KEY = "bridge_access_revoked";

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

function bridgeAccessResolvedNotification(event: Event): {
  title: string;
  body: string;
  requestId: string;
} | null {
  const currentUserId = useAuthStore.getState().user?.id;
  if (!currentUserId) return null;

  const payload = asRecord(event.payload);
  if (!payload) return null;
  if (payload.status !== "approved" && payload.status !== "denied") return null;
  if (typeof payload.requestId !== "string") return null;

  const requesterUser = asRecord(payload.requesterUser);
  if (requesterUser?.id !== currentUserId) return null;

  const runtimeLabel =
    typeof payload.runtimeLabel === "string" && payload.runtimeLabel.trim()
      ? payload.runtimeLabel.trim()
      : "the bridge";

  return {
    title:
      payload.status === "approved" ? "Bridge access approved" : "Bridge access request denied",
    body:
      payload.status === "approved"
        ? `You can now use ${runtimeLabel}.`
        : `Your request to use ${runtimeLabel} was denied.`,
    requestId: payload.requestId,
  };
}

function bridgeAccessRevokedNotification(event: Event): {
  title: string;
  body: string;
} | null {
  const currentUserId = useAuthStore.getState().user?.id;
  if (!currentUserId) return null;

  const payload = asRecord(event.payload);
  if (!payload) return null;
  if (payload.granteeUserId !== currentUserId) return null;

  const runtimeLabel =
    typeof payload.runtimeLabel === "string" && payload.runtimeLabel.trim()
      ? payload.runtimeLabel.trim()
      : "the bridge";

  return {
    title: "Bridge access revoked",
    body: `Your access to ${runtimeLabel} was revoked.`,
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
        deepLink: `trace://connections?requestId=${encodeURIComponent(notification.requestId)}`,
        foregroundPresentation: FOREGROUND_BRIDGE_ACCESS_REQUESTED_KEY,
        requestId: notification.requestId,
      },
    },
    trigger: null,
  });
}

async function handleBridgeAccessResolved(event: Event): Promise<void> {
  const notification = bridgeAccessResolvedNotification(event);
  if (!notification) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: notification.title,
      body: notification.body,
      data: {
        deepLink: "trace://connections",
        foregroundPresentation: FOREGROUND_BRIDGE_ACCESS_RESOLVED_KEY,
        requestId: notification.requestId,
      },
    },
    trigger: null,
  });
}

async function handleBridgeAccessRevoked(event: Event): Promise<void> {
  const notification = bridgeAccessRevokedNotification(event);
  if (!notification) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: notification.title,
      body: notification.body,
      data: {
        deepLink: "trace://connections",
        foregroundPresentation: FOREGROUND_BRIDGE_ACCESS_REVOKED_KEY,
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

registerHandler("bridge_access_request_resolved", (event) => {
  void handleBridgeAccessResolved(event).catch((err: unknown) => {
    console.warn("[bridge-access-notifications] failed to show resolved notification", err);
  });
});

registerHandler("bridge_access_revoked", (event) => {
  void handleBridgeAccessRevoked(event).catch((err: unknown) => {
    console.warn("[bridge-access-notifications] failed to show revoked notification", err);
  });
});
