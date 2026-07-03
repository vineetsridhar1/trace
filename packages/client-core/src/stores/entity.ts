import { useStore } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { Event, Message } from "@trace/gql";
import { EMPTY_IDS, useEntityStore as entityStore } from "./entity-store.js";
import type { EntityState, EntityTableMap, EntityType } from "./entity-store.js";

export {
  StoreBatchWriter,
  eventScopeKey,
  messageScopeKey,
  removeEventIdByScope,
  upsertEventIdByScope,
} from "./entity-store.js";
export type {
  EntityState,
  EntityTableMap,
  EntityType,
  SessionEntity,
  SessionGroupEntity,
} from "./entity-store.js";

/** React binding over the vanilla store from entity-store.ts — mirrors what
 *  zustand's `create` produces, so `useEntityStore(selector)` and
 *  `useEntityStore.getState()` call sites behave exactly as before. */
function useEntityStoreHook<T>(selector: (state: EntityState) => T): T {
  return useStore(entityStore, selector);
}

export const useEntityStore = Object.assign(useEntityStoreHook, entityStore) as UseBoundStore<
  StoreApi<EntityState>
>;

/** Fine-grained selector: subscribe to a single field of a single entity */
export function useEntityField<T extends EntityType, F extends keyof EntityTableMap[T]>(
  type: T,
  id: string,
  field: F,
): EntityTableMap[T][F] | undefined {
  return useEntityStore((state: EntityState) => {
    const entity = state[type][id] as EntityTableMap[T] | undefined;
    return entity?.[field];
  });
}

/** Typed selector for message fields — avoids `as` casts at call sites */
export function useMessageField<F extends keyof Message>(
  messageId: string,
  field: F,
): Message[F] | undefined {
  return useEntityField("messages", messageId, field) as Message[F] | undefined;
}

/** Subscribe to sorted IDs of an entity table, optionally filtered.
 *  Uses shallow comparison to avoid spurious re-renders. */
export function useEntityIds<T extends EntityType>(
  type: T,
  filter?: (entity: EntityTableMap[T]) => boolean,
  sort?: (a: EntityTableMap[T], b: EntityTableMap[T]) => number,
): string[] {
  return useEntityStore(
    useShallow((state: EntityState) => {
      const table = state[type] as Record<string, EntityTableMap[T]>;
      let entries = Object.entries(table);
      if (filter) entries = entries.filter(([, e]) => filter(e));
      if (sort) entries.sort(([, a], [, b]) => sort(a, b));
      return entries.map(([id]) => id);
    }),
  );
}

export function useEntitiesByIds<T extends EntityType>(
  type: T,
  ids: string[],
): Array<EntityTableMap[T] | null> {
  return useEntityStore(
    useShallow(
      (state: EntityState) =>
        ids.map((id) => state[type][id] ?? null) as Array<EntityTableMap[T] | null>,
    ),
  );
}

/** Subscribe to sorted event IDs within a single scoped bucket.
 *  Uses the maintained timestamp index when no custom comparator is needed. */
export function useScopedEventIds(
  scopeKey: string,
  sort?: (a: Event, b: Event) => number,
): string[] {
  if (!sort) {
    return useEntityStore((state: EntityState) => state._eventIdsByScope[scopeKey] ?? EMPTY_IDS);
  }
  return useEntityStore(
    useShallow((state: EntityState) => {
      const bucket = state.eventsByScope[scopeKey];
      if (!bucket) return EMPTY_IDS;
      const orderedIds = state._eventIdsByScope[scopeKey] ?? Object.keys(bucket);
      const entries = orderedIds
        .map((id) => {
          const event = bucket[id];
          return event ? ([id, event] as const) : null;
        })
        .filter((entry): entry is readonly [string, Event] => entry !== null);
      if (sort) entries.sort(([, a], [, b]) => sort(a, b));
      return entries.map(([id]) => id);
    }),
  );
}

export function useMessageIdsForScope(
  scopeKey: string,
  filter?: (message: Message) => boolean,
  sort?: (a: Message, b: Message) => number,
): string[] {
  return useEntityStore(
    useShallow((state: EntityState) => {
      const scopeIds = state._messageIdsByScope[scopeKey];
      if (!scopeIds) return EMPTY_IDS;

      const messages = scopeIds
        .map((id: string) => {
          const message = state.messages[id];
          return message ? ([id, message] as const) : null;
        })
        .filter(
          (entry: readonly [string, Message] | null): entry is readonly [string, Message] =>
            entry !== null,
        );

      let filtered = messages;
      if (filter) {
        filtered = filtered.filter(([, message]: readonly [string, Message]) => filter(message));
      }
      if (sort) {
        filtered = [...filtered].sort(
          ([, a]: readonly [string, Message], [, b]: readonly [string, Message]) => sort(a, b),
        );
      }

      return filtered.map(([id]: readonly [string, Message]) => id);
    }),
  );
}

/** Subscribe to event IDs whose parentId matches the given value.
 *  Backed by a reverse index — O(1) lookup, no bucket scan.
 *  Used by SubagentRow to surface nested child events belonging to a specific tool_use. */
export function useScopedEventIdsByParentId(
  _scopeKey: string,
  parentId: string | null | undefined,
): string[] {
  return useEntityStore(
    useShallow((state: EntityState) => {
      if (!parentId) return EMPTY_IDS;
      return state._eventIdsByParentId[parentId] ?? EMPTY_IDS;
    }),
  );
}

/** Subscribe to the full scoped event bucket (e.g. for passing to buildSessionNodes).
 *  NOTE: Do NOT wrap this with useShallow — the raw bucket reference is stable
 *  (only replaced when this scope's events change) and downstream useMemo deps
 *  rely on referential equality to avoid recomputing buildSessionNodes. */
export function useScopedEvents(scopeKey: string): Record<string, Event> {
  return useEntityStore((state: EntityState) => state.eventsByScope[scopeKey] ?? EMPTY_EVENTS);
}

const EMPTY_EVENTS: Record<string, Event> = {};

/** Fine-grained selector for a single field of a scoped event */
export function useScopedEventField<F extends keyof Event>(
  scopeKey: string,
  id: string,
  field: F,
): Event[F] | undefined {
  return useEntityStore((state: EntityState) => {
    const bucket = state.eventsByScope[scopeKey];
    return bucket?.[id]?.[field];
  });
}

/** Subscribe to queued message IDs for a session, sorted by position */
export function useQueuedMessageIdsForSession(sessionId: string): string[] {
  return useEntityStore(
    useShallow((state: EntityState) => {
      const ids = state._queuedMessageIdsBySession[sessionId];
      if (!ids || ids.length === 0) return EMPTY_IDS;
      return [...ids].sort((a, b) => {
        const qa = state.queuedMessages[a];
        const qb = state.queuedMessages[b];
        return (qa?.position ?? 0) - (qb?.position ?? 0);
      });
    }),
  );
}

/** Subscribe to session IDs belonging to a specific group via the reverse index.
 *  Uses shallow comparison — only re-renders when the list of IDs changes. */
export function useSessionIdsByGroup(groupId: string | undefined): string[] {
  return useEntityStore(
    useShallow((state: EntityState) => {
      if (!groupId) return EMPTY_IDS;
      return state._sessionIdsByGroup[groupId] ?? EMPTY_IDS;
    }),
  );
}
