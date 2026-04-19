import type { Event, EventType } from "@trace/gql";

/** Notification handler for a specific event type. */
export type NotificationHandler = (event: Event) => void;

const handlers = new Map<EventType, NotificationHandler[]>();

/** Register a notification handler for a given event type. */
export function registerHandler(eventType: EventType, handler: NotificationHandler): void {
  handlers.set(eventType, [...(handlers.get(eventType) ?? []), handler]);
}

/** Run all registered handlers for an event. Called from useOrgEvents. */
export function notifyForEvent(event: Event): void {
  const eventHandlers = handlers.get(event.eventType);
  if (!eventHandlers) return;
  for (const handler of eventHandlers) {
    handler(event);
  }
}

/** Test-only: clear all registered handlers. */
export function _clearHandlers(): void {
  handlers.clear();
}
