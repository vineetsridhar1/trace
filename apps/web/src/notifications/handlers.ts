import { createElement } from "react";
import { toast } from "sonner";
import type { Event, EventType, ScopeType, AgentStatus, BridgeAccessCapability } from "@trace/gql";
import { asJsonObject } from "@trace/shared";
import { useEntityStore } from "@trace/client-core";
import { useAuthStore } from "@trace/client-core";
import { useUIStore, navigateToSession } from "../stores/ui";
import { agentStatusLabel } from "../components/session/sessionStatus";
import { showNativeNotification } from "./native";
import { formatCapabilities, getBridgeAccessRequestToastId } from "../lib/bridge-access";
import {
  BridgeAccessRequestToast,
  type BridgeAccessRequestToastData,
} from "./BridgeAccessRequestToast";

function parseCapabilityArray(value: unknown): BridgeAccessCapability[] {
  if (!Array.isArray(value)) return [];
  const caps: BridgeAccessCapability[] = [];
  for (const entry of value) {
    if (entry === "session" || entry === "terminal") {
      caps.push(entry);
    }
  }
  return caps;
}

/** Notification handler for a specific event type. */
type NotificationHandler = (event: Event) => void;

const handlers = new Map<EventType, NotificationHandler[]>();

/** Register a notification handler for a given event type. */
export function registerHandler(eventType: EventType, handler: NotificationHandler) {
  handlers.set(eventType, [...(handlers.get(eventType) ?? []), handler]);
}

/** Run all registered handlers for an event. Called from useOrgEvents. */
export function notifyForEvent(event: Event) {
  const eventHandlers = handlers.get(event.eventType);
  if (!eventHandlers) return;
  for (const handler of eventHandlers) {
    handler(event);
  }
}

/**
 * Show a notification via toast (foreground) or native OS notification (background).
 * When the app is hidden, native notification is shown and the toast is skipped.
 */
function notify(
  title: string,
  options?: { tag?: string; onClick?: () => void },
): void {
  const shown = showNativeNotification(title, {
    tag: options?.tag,
    onClick: options?.onClick,
  });
  // If native notification was shown (app hidden), skip the toast
  if (shown) return;

  toast(title, {
    action: options?.onClick
      ? { label: "View", onClick: options.onClick }
      : undefined,
  });
}

function parseBridgeAccessRequestPayload(payload: unknown): BridgeAccessRequestToastData | null {
  const data = asJsonObject(payload);
  if (!data) return null;
  if (typeof data.requestId !== "string") return null;
  if (typeof data.ownerUserId !== "string") return null;
  if (typeof data.runtimeInstanceId !== "string") return null;
  if (typeof data.runtimeLabel !== "string") return null;
  if (data.scopeType !== "all_sessions" && data.scopeType !== "session_group") return null;
  if (data.status !== "pending" && data.status !== "approved" && data.status !== "denied") {
    return null;
  }

  const requesterUser = asJsonObject(data.requesterUser);
  if (!requesterUser || typeof requesterUser.id !== "string") return null;

  const sessionGroup = data.sessionGroup ? asJsonObject(data.sessionGroup) : null;
  const grant = data.grant ? asJsonObject(data.grant) : null;

  return {
    ownerUserId: data.ownerUserId,
    requestId: data.requestId,
    runtimeInstanceId: data.runtimeInstanceId,
    runtimeLabel: data.runtimeLabel,
    scopeType: data.scopeType,
    requestedCapabilities: parseCapabilityArray(data.requestedCapabilities),
    requestedExpiresAt:
      typeof data.requestedExpiresAt === "string" || data.requestedExpiresAt === null
        ? (data.requestedExpiresAt ?? null)
        : null,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
    status: data.status,
    sessionGroup:
      sessionGroup && typeof sessionGroup.id === "string"
        ? {
            id: sessionGroup.id,
            name: typeof sessionGroup.name === "string" ? sessionGroup.name : null,
          }
        : null,
    requesterUser: {
      id: requesterUser.id,
      name: typeof requesterUser.name === "string" ? requesterUser.name : null,
      avatarUrl: typeof requesterUser.avatarUrl === "string" ? requesterUser.avatarUrl : null,
    },
    grant:
      grant && typeof grant.id === "string" && typeof grant.scopeType === "string"
        ? {
            id: grant.id,
            scopeType: grant.scopeType === "session_group" ? "session_group" : "all_sessions",
            sessionGroupId:
              typeof grant.sessionGroupId === "string" || grant.sessionGroupId === null
                ? (grant.sessionGroupId ?? null)
                : null,
            capabilities: parseCapabilityArray(grant.capabilities),
            expiresAt:
              typeof grant.expiresAt === "string" || grant.expiresAt === null
                ? (grant.expiresAt ?? null)
                : null,
            createdAt:
              typeof grant.createdAt === "string" ? grant.createdAt : new Date().toISOString(),
          }
        : null,
  };
}

// ---------------------------------------------------------------------------
// Built-in handler: Session status changes for sessions you own
// ---------------------------------------------------------------------------

/** Tracks recent toasts per session to prevent flooding during reconnection replays. */
const recentToasts = new Map<string, number>();
const DEBOUNCE_MS = 5000;

function handleSessionStatusChange(event: Event): void {
  const currentUserId = useAuthStore.getState().user?.id;
  if (!currentUserId) return;

  // Don't notify for your own actions
  if (event.actor.id === currentUserId) return;

  const payload = asJsonObject(event.payload);
  const newStatus = (payload?.agentStatus ?? payload?.sessionStatus) as string | undefined;
  if (!newStatus) return;

  // Look up the session to check ownership and get the name
  const session = useEntityStore.getState().sessions[event.scopeId];
  if (!session) return;

  // Only notify for sessions the current user owns
  if (session.createdBy?.id !== currentUserId) return;

  // Debounce per session to avoid toast flooding on reconnection replays
  const now = Date.now();
  const lastToast = recentToasts.get(event.scopeId);
  if (lastToast && now - lastToast < DEBOUNCE_MS) return;
  recentToasts.set(event.scopeId, now);

  const sessionName = session.name || "Untitled session";
  const label = agentStatusLabel[newStatus] ?? newStatus;
  const channelId = (session.channel as { id: string } | null)?.id ?? null;
  const sessionGroupId = session.sessionGroupId as string | undefined;
  const sessionId = event.scopeId;

  notify(`"${sessionName}" moved to "${label}"`, {
    tag: `session-status-${sessionId}`,
    onClick: () => {
      if (sessionGroupId) {
        navigateToSession(channelId, sessionGroupId, sessionId);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Built-in handler: New inbox items (plans / questions)
// ---------------------------------------------------------------------------

function handleInboxItemCreated(event: Event): void {
  const currentUserId = useAuthStore.getState().user?.id;
  if (!currentUserId) return;

  const payload = asJsonObject(event.payload);
  const item = asJsonObject(payload?.inboxItem);
  if (!item) return;

  // Only notify for items assigned to the current user
  if (item.userId !== currentUserId) return;

  const rawType = item.itemType as string;
  const isSuggestion = rawType?.endsWith("_suggestion");
  const itemType = rawType === "question" ? "Question" : isSuggestion ? "Suggestion" : "Plan";
  const title = (item.title as string) || "New item";

  notify(`${itemType}: ${title}`, {
    tag: `inbox-${item.id}`,
    onClick: () => {
      useUIStore.getState().setActivePage("inbox");
    },
  });
}

function handleBridgeAccessRequested(event: Event): void {
  const currentUserId = useAuthStore.getState().user?.id;
  if (!currentUserId) return;

  const request = parseBridgeAccessRequestPayload(event.payload);
  if (!request || request.ownerUserId !== currentUserId || request.status !== "pending") {
    return;
  }

  const requesterName =
    request.requesterUser.name?.trim() || event.actor.name || "A teammate";
  const runtimeLabel = request.runtimeLabel.trim() || "your bridge";
  const toastId = getBridgeAccessRequestToastId(request.requestId);

  showNativeNotification(`${requesterName} requested bridge access`, {
    body: `Review access for ${runtimeLabel}`,
    tag: toastId,
    onClick: () => {},
  });

  toast.custom(() => createElement(BridgeAccessRequestToast, { toastId, request }), {
    id: toastId,
    duration: Infinity,
  });

  useUIStore.getState().triggerRefresh();
}

function handleBridgeAccessResolved(event: Event): void {
  const request = parseBridgeAccessRequestPayload(event.payload);
  if (!request) return;
  toast.dismiss(getBridgeAccessRequestToastId(request.requestId));

  const currentUserId = useAuthStore.getState().user?.id;
  if (currentUserId && request.requesterUser.id === currentUserId) {
    useUIStore.getState().triggerRefresh();
  }
}

function handleBridgeAccessUpdated(event: Event): void {
  const currentUserId = useAuthStore.getState().user?.id;
  if (!currentUserId) return;

  const payload = asJsonObject(event.payload);
  if (!payload) return;

  const granteeUserId = typeof payload.granteeUserId === "string" ? payload.granteeUserId : null;
  const ownerUserId = typeof payload.ownerUserId === "string" ? payload.ownerUserId : null;
  const runtimeLabel =
    typeof payload.runtimeLabel === "string" && payload.runtimeLabel.trim()
      ? payload.runtimeLabel.trim()
      : "the bridge";
  const nextCaps = parseCapabilityArray(payload.capabilities);
  const priorCaps = parseCapabilityArray(payload.priorCapabilities);

  if (granteeUserId === currentUserId) {
    const hadTerminal = priorCaps.includes("terminal");
    const hasTerminal = nextCaps.includes("terminal");
    if (hadTerminal && !hasTerminal) {
      notify(`Terminal access to ${runtimeLabel} was removed`);
    } else if (!hadTerminal && hasTerminal) {
      notify(`Terminal access to ${runtimeLabel} was granted`);
    } else {
      notify(`Your access to ${runtimeLabel} is now ${formatCapabilities(nextCaps)}`);
    }
    useUIStore.getState().triggerRefresh();
  } else if (ownerUserId === currentUserId) {
    useUIStore.getState().triggerRefresh();
  }
}

function handleBridgeAccessRevoked(event: Event): void {
  const currentUserId = useAuthStore.getState().user?.id;
  if (!currentUserId) return;

  const payload = asJsonObject(event.payload);
  if (!payload) return;

  const granteeUserId = typeof payload.granteeUserId === "string" ? payload.granteeUserId : null;
  const ownerUserId = typeof payload.ownerUserId === "string" ? payload.ownerUserId : null;
  const runtimeLabel =
    typeof payload.runtimeLabel === "string" && payload.runtimeLabel.trim()
      ? payload.runtimeLabel.trim()
      : "the bridge";

  if (granteeUserId === currentUserId) {
    notify(`Your access to ${runtimeLabel} was revoked`);
    useUIStore.getState().triggerRefresh();
  } else if (ownerUserId === currentUserId) {
    useUIStore.getState().triggerRefresh();
  }
}

// ---------------------------------------------------------------------------
// Built-in handler: Mention notifications
// ---------------------------------------------------------------------------

function handleMentionNotification(event: Event): void {
  const currentUserId = useAuthStore.getState().user?.id;
  if (!currentUserId) return;

  // Don't notify for your own messages
  if (event.actor.id === currentUserId) return;

  const payload = asJsonObject(event.payload);
  if (!payload) return;

  const mentions = Array.isArray(payload.mentions)
    ? (payload.mentions as Array<{ userId: string; name: string }>)
    : undefined;
  if (!mentions?.some((m) => m.userId === currentUserId)) return;

  const actorName = event.actor.name ?? "Someone";
  notify(`${actorName} mentioned you`, {
    tag: `mention-${event.id}`,
    onClick: () => {
      if (event.scopeType === ("chat" as string)) {
        useUIStore.getState().setActiveChatId(event.scopeId);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Built-in handler: PR lifecycle events (open / close without merge)
// ---------------------------------------------------------------------------

function handlePrEvent(event: Event): void {
  const currentUserId = useAuthStore.getState().user?.id;
  if (!currentUserId) return;

  const session = useEntityStore.getState().sessions[event.scopeId];
  if (!session) return;
  if (session.createdBy?.id !== currentUserId) return;

  const now = Date.now();
  const lastToast = recentToasts.get(event.scopeId);
  if (lastToast && now - lastToast < DEBOUNCE_MS) return;
  recentToasts.set(event.scopeId, now);

  const sessionName = session.name || "Untitled session";
  const channelId = (session.channel as { id: string } | null)?.id ?? null;
  const sessionGroupId = session.sessionGroupId as string | undefined;
  const sessionId = event.scopeId;
  const label = event.eventType === "session_pr_opened" ? "PR opened" : "PR closed";

  notify(`"${sessionName}" — ${label}`, {
    tag: `session-pr-${sessionId}`,
    onClick: () => {
      if (sessionGroupId) {
        navigateToSession(channelId, sessionGroupId, sessionId);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Built-in handler: DM message notifications
// ---------------------------------------------------------------------------

function handleDmMessage(event: Event): void {
  const currentUserId = useAuthStore.getState().user?.id;
  if (!currentUserId) return;

  // Don't notify for your own messages
  if (event.actor.id === currentUserId) return;

  // Only handle chat-scoped messages (DMs / group chats)
  if (event.scopeType !== ("chat" satisfies ScopeType)) return;

  const chatId = event.scopeId;

  // Don't mark as unread or notify if the user is already viewing this chat
  const activeChatId = useUIStore.getState().activeChatId;
  if (activeChatId === chatId) return;

  // Mark the chat as unread
  useUIStore.getState().markChatUnread(chatId);

  const payload = asJsonObject(event.payload);
  const actorName = event.actor.name ?? "Someone";
  const text = typeof payload?.text === "string" ? payload.text : "";
  const preview = text.length > 80 ? text.slice(0, 80) + "…" : text;

  const title = preview ? `${actorName}: ${preview}` : `New message from ${actorName}`;

  notify(title, {
    tag: `dm-${chatId}`,
    onClick: () => {
      useUIStore.getState().setActiveChatId(chatId);
    },
  });
}

// Register the built-in handlers
const sessionStatusEventTypes: EventType[] = [
  "session_paused",
  "session_resumed",
  "session_terminated",
  "session_pr_merged",
];
for (const eventType of sessionStatusEventTypes) {
  registerHandler(eventType, handleSessionStatusChange);
}
registerHandler("session_pr_opened", handlePrEvent);
registerHandler("session_pr_closed", handlePrEvent);
registerHandler("bridge_access_requested", handleBridgeAccessRequested);
registerHandler("bridge_access_request_resolved", handleBridgeAccessResolved);
registerHandler("bridge_access_revoked", handleBridgeAccessRevoked);
registerHandler("bridge_access_updated", handleBridgeAccessUpdated);
registerHandler("inbox_item_created", handleInboxItemCreated);
registerHandler("message_sent", handleMentionNotification);
registerHandler("message_sent", handleDmMessage);
