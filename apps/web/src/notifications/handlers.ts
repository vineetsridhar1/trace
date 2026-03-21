import { toast } from "sonner";
import type { Event, EventType, ScopeType, SessionStatus } from "@trace/gql";
import { asJsonObject } from "@trace/shared";
import { useEntityStore } from "../stores/entity";
import { useAuthStore } from "../stores/auth";
import { useUIStore, navigateToSession } from "../stores/ui";
import { statusLabel } from "../components/session/sessionStatus";
import { showNativeNotification } from "./native";

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
  const newStatus = payload?.status as SessionStatus | undefined;
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
  const label = statusLabel[newStatus] ?? newStatus;
  const channelId = (session.channel as { id: string } | null)?.id ?? null;
  const sessionId = event.scopeId;

  notify(`"${sessionName}" moved to "${label}"`, {
    tag: `session-status-${sessionId}`,
    onClick: () => navigateToSession(channelId, sessionId),
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

  const itemType = item.itemType === "question" ? "Question" : "Plan";
  const title = (item.title as string) || "New item";

  notify(`${itemType}: ${title}`, {
    tag: `inbox-${item.id}`,
    onClick: () => {
      useUIStore.getState().setActivePage("inbox");
    },
  });
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
  const sessionId = event.scopeId;
  const label = event.eventType === "session_pr_opened" ? "PR opened" : "PR closed";

  notify(`"${sessionName}" — ${label}`, {
    tag: `session-pr-${sessionId}`,
    onClick: () => navigateToSession(channelId, sessionId),
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
registerHandler("inbox_item_created", handleInboxItemCreated);
registerHandler("message_sent", handleMentionNotification);
registerHandler("message_sent", handleDmMessage);
