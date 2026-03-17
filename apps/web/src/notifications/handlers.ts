import { toast } from "sonner";
import type { Event, EventType, SessionStatus } from "@trace/gql";
import { useEntityStore } from "../stores/entity";
import { useAuthStore } from "../stores/auth";
import { useUIStore, navigateToSession } from "../stores/ui";
import { statusLabel } from "../components/session/sessionStatus";

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

  const newStatus = (event.payload as Record<string, unknown>).status as SessionStatus | undefined;
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

  toast(`"${sessionName}" moved to "${label}"`, {
    action: {
      label: "View",
      onClick: () => navigateToSession(channelId, sessionId),
    },
  });
}

// ---------------------------------------------------------------------------
// Built-in handler: New inbox items (plans / questions)
// ---------------------------------------------------------------------------

function handleInboxItemCreated(event: Event): void {
  const currentUserId = useAuthStore.getState().user?.id;
  if (!currentUserId) return;

  const item = event.payload.inboxItem as Record<string, unknown> | undefined;
  if (!item) return;

  // Only notify for items assigned to the current user
  if (item.userId !== currentUserId) return;

  const itemType = item.itemType === "question" ? "Question" : "Plan";
  const title = (item.title as string) || "New item";

  toast(`${itemType}: ${title}`, {
    action: {
      label: "View",
      onClick: () => {
        useUIStore.getState().setActivePage("inbox");
      },
    },
  });
}

// Register the built-in handlers
const sessionStatusEventTypes: EventType[] = ["session_paused", "session_resumed", "session_terminated"];
for (const eventType of sessionStatusEventTypes) {
  registerHandler(eventType, handleSessionStatusChange);
}
registerHandler("inbox_item_created", handleInboxItemCreated);
