import { toast } from "sonner";
import type { Event, EventType, SessionStatus } from "@trace/gql";
import type { SessionEntity } from "../stores/entity";
import { useEntityStore } from "../stores/entity";
import { useAuthStore } from "../stores/auth";

/**
 * Notification handler for a specific event type.
 * Return `true` to indicate a notification was shown, `false` to skip.
 */
type NotificationHandler = (event: Event) => boolean;

const handlers = new Map<EventType, NotificationHandler[]>();

/** Register a notification handler for a given event type. */
export function registerHandler(eventType: EventType, handler: NotificationHandler) {
  const existing = handlers.get(eventType) ?? [];
  existing.push(handler);
  handlers.set(eventType, existing);
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

const STATUS_LABELS: Partial<Record<SessionStatus, string>> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
  needs_input: "Needs Input",
  pending: "Pending",
  creating: "Creating",
  unreachable: "Unreachable",
};

function handleSessionStatusChange(event: Event): boolean {
  const currentUserId = useAuthStore.getState().user?.id;
  if (!currentUserId) return false;

  const payload = event.payload as Record<string, unknown>;
  const newStatus = payload.status as SessionStatus | undefined;
  if (!newStatus) return false;

  // Look up the session to check ownership and get the name
  const session = useEntityStore.getState().sessions[event.scopeId] as SessionEntity | undefined;
  if (!session) return false;

  // Only notify for sessions the current user owns
  const ownerId =
    typeof session.createdBy === "object" && session.createdBy !== null
      ? (session.createdBy as { id: string }).id
      : undefined;
  if (ownerId !== currentUserId) return false;

  const sessionName = session.name || "Untitled session";
  const statusLabel = STATUS_LABELS[newStatus] ?? newStatus;

  toast(`"${sessionName}" moved to "${statusLabel}"`, {
    dismissible: true,
  });

  return true;
}

// Register the built-in handlers
for (const eventType of ["session_paused", "session_resumed", "session_terminated"] as EventType[]) {
  registerHandler(eventType, handleSessionStatusChange);
}
