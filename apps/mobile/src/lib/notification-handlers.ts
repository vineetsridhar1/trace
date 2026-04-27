import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import {
  registerHandler,
  useAuthStore,
  useEntityStore,
  type SessionEntity,
} from "@trace/client-core";
import type { Event, EventType } from "@trace/gql";
import {
  buildBridgeAccessRequestedNotification,
  buildSessionAgentStatusNotification,
  parseBridgeAccessNotificationPayload,
  type LocalNotificationContent,
} from "@/lib/notification-events";

const SESSION_STATUS_EVENT_TYPES: EventType[] = [
  "session_paused",
  "session_resumed",
  "session_terminated",
  "session_pr_merged",
];

const recentNotifications = new Map<string, number>();
const DEBOUNCE_MS = 5000;
const MAX_RECENT_NOTIFICATIONS = 200;

export function resetNotificationDebounceForTest(): void {
  recentNotifications.clear();
}

export function shouldDebounceNotification(key: string, now = Date.now()): boolean {
  const previous = recentNotifications.get(key);
  if (previous && now - previous < DEBOUNCE_MS) {
    return true;
  }
  for (const [entryKey, timestamp] of recentNotifications) {
    if (now - timestamp >= DEBOUNCE_MS) {
      recentNotifications.delete(entryKey);
    }
  }
  while (recentNotifications.size >= MAX_RECENT_NOTIFICATIONS) {
    const oldest = recentNotifications.keys().next().value;
    if (!oldest) break;
    recentNotifications.delete(oldest);
  }
  recentNotifications.set(key, now);
  return false;
}

async function presentLocalNotification(content: LocalNotificationContent): Promise<void> {
  if (AppState.currentState === "active") return;

  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== "granted") return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: content.title,
      body: content.body,
      data: { deepLink: content.deepLink },
    },
    trigger: null,
  });
}

export function handleSessionAgentStatusChange(event: Event): void {
  const currentUserId = useAuthStore.getState().user?.id;
  if (!currentUserId || event.actor.id === currentUserId) return;

  const session = useEntityStore.getState().sessions[event.scopeId] as SessionEntity | undefined;
  if (!session || session.createdBy?.id !== currentUserId || !session.agentStatus) return;
  if (!session.sessionGroupId) return;

  const dedupeKey = `session:${event.scopeId}:${session.agentStatus}`;
  if (shouldDebounceNotification(dedupeKey)) return;

  void presentLocalNotification(
    buildSessionAgentStatusNotification({
      sessionName: session.name,
      sessionGroupId: session.sessionGroupId,
      sessionId: event.scopeId,
      agentStatus: session.agentStatus,
    }),
  ).catch((error: unknown) => {
    console.warn("[notifications] session notification failed", error);
  });
}

export function handleBridgeAccessRequested(event: Event): void {
  const currentUserId = useAuthStore.getState().user?.id;
  if (!currentUserId) return;

  const request = parseBridgeAccessNotificationPayload(event.payload, event.actor.name);
  if (!request || request.ownerUserId !== currentUserId || request.status !== "pending") return;
  if (shouldDebounceNotification(`bridge:${request.requestId}`)) return;

  void presentLocalNotification(
    buildBridgeAccessRequestedNotification({
      requesterName: request.requesterName,
      runtimeLabel: request.runtimeLabel,
    }),
  ).catch((error: unknown) => {
    console.warn("[notifications] bridge request notification failed", error);
  });
}

for (const eventType of SESSION_STATUS_EVENT_TYPES) {
  registerHandler(eventType, handleSessionAgentStatusChange);
}
registerHandler("bridge_access_requested", handleBridgeAccessRequested);
