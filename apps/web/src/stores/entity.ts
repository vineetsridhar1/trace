import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { useShallow } from "zustand/react/shallow";
import type { Draft } from "immer";
import type {
  Organization,
  User,
  Repo,
  Project,
  Channel,
  ChannelGroup,
  SessionGroup,
  Chat,
  Session,
  Ticket,
  Event,
  InboxItem,
  Message,
} from "@trace/gql";

/** Client-side session entity with extra fields not in the GQL schema */
export type SessionEntity = Session & {
  _lastEventPreview?: string;
  _lastMessageAt?: string;
  _sortTimestamp?: string;
};

export type SessionGroupEntity = SessionGroup & {
  _sortTimestamp?: string;
};

/** Entity types that the store manages, keyed by ID */
export type EntityTableMap = {
  organizations: Organization;
  users: User;
  repos: Repo;
  projects: Project;
  channels: Channel;
  channelGroups: ChannelGroup;
  sessionGroups: SessionGroupEntity;
  chats: Chat;
  sessions: SessionEntity;
  tickets: Ticket;
  inboxItems: InboxItem;
  messages: Message;
};

export type EntityType = keyof EntityTableMap;

type Tables = { [K in EntityType]: Record<string, EntityTableMap[K]> };

/** Events are partitioned by scope key (`${scopeType}:${scopeId}`) for O(1) scoped lookups */
type EventsByScope = Record<string, Record<string, Event>>;

/** Derived index: sessionGroupId → Set of session IDs for O(1) lookups */
type SessionIdsByGroup = Record<string, Set<string>>;

interface EntityActions {
  upsert: <T extends EntityType>(entityType: T, id: string, data: EntityTableMap[T]) => void;
  upsertMany: <T extends EntityType>(
    entityType: T,
    items: Array<EntityTableMap[T] & { id: string }>,
  ) => void;
  /** Shallow-merge a partial update into an existing entity */
  patch: <T extends EntityType>(entityType: T, id: string, data: Partial<EntityTableMap[T]>) => void;
  remove: (entityType: EntityType, id: string) => void;
  /** Upsert a single event into its scoped bucket */
  upsertScopedEvent: (scopeKey: string, id: string, event: Event) => void;
  /** Batch-upsert events into a scoped bucket */
  upsertManyScopedEvents: (scopeKey: string, items: Array<Event & { id: string }>) => void;
  /** Remove an entire scoped bucket (for eviction) */
  removeScopedEvents: (scopeKey: string) => void;
  /** Apply multiple mutations in a single state update (reduces re-renders) */
  batch: (fn: (state: Draft<EntityState>) => void) => void;
}

type EntityState = Tables & {
  eventsByScope: EventsByScope;
  _sessionIdsByGroup: SessionIdsByGroup;
} & EntityActions;

/** Maintain the sessionIdsByGroup index when a session is upserted or patched */
function updateSessionGroupIndex(state: Draft<EntityState>, sessionId: string, groupId: string | null | undefined) {
  if (!groupId) return;
  if (!state._sessionIdsByGroup[groupId]) {
    state._sessionIdsByGroup[groupId] = new Set();
  }
  state._sessionIdsByGroup[groupId].add(sessionId);
}

/** Remove a session from its group index */
function removeFromSessionGroupIndex(state: Draft<EntityState>, sessionId: string) {
  const session = state.sessions[sessionId];
  if (session?.sessionGroupId) {
    state._sessionIdsByGroup[session.sessionGroupId]?.delete(sessionId);
  }
}

export const useEntityStore = create<EntityState>()(immer((set) => ({
  organizations: {},
  users: {},
  repos: {},
  projects: {},
  channels: {},
  channelGroups: {},
  sessionGroups: {},
  chats: {},
  sessions: {},
  tickets: {},
  inboxItems: {},
  messages: {},
  eventsByScope: {},
  _sessionIdsByGroup: {},

  upsert: (entityType, id, data) =>
    set((state) => {
      (state[entityType] as Record<string, unknown>)[id] = data;
      if (entityType === "sessions") {
        const session = data as unknown as SessionEntity;
        updateSessionGroupIndex(state, id, session.sessionGroupId);
      }
    }),

  upsertMany: (entityType, items) =>
    set((state) => {
      for (const item of items) {
        (state[entityType] as Record<string, unknown>)[item.id] = item;
        if (entityType === "sessions") {
          const session = item as unknown as SessionEntity;
          updateSessionGroupIndex(state, item.id, session.sessionGroupId);
        }
      }
    }),

  patch: (entityType, id, data) =>
    set((state) => {
      const table = state[entityType] as Record<string, unknown>;
      const existing = table[id];
      if (existing) {
        Object.assign(existing as object, data);
        if (entityType === "sessions") {
          const session = existing as SessionEntity;
          updateSessionGroupIndex(state, id, session.sessionGroupId);
        }
      }
    }),

  remove: (entityType, id) =>
    set((state) => {
      if (entityType === "sessions") {
        removeFromSessionGroupIndex(state, id);
      }
      delete (state[entityType] as Record<string, unknown>)[id];
    }),

  upsertScopedEvent: (scopeKey, id, event) =>
    set((state) => {
      if (!state.eventsByScope[scopeKey]) {
        state.eventsByScope[scopeKey] = {};
      }
      state.eventsByScope[scopeKey][id] = event;
    }),

  upsertManyScopedEvents: (scopeKey, items) =>
    set((state) => {
      if (!state.eventsByScope[scopeKey]) {
        state.eventsByScope[scopeKey] = {};
      }
      const bucket = state.eventsByScope[scopeKey];
      for (const item of items) {
        bucket[item.id] = item;
      }
    }),

  removeScopedEvents: (scopeKey) =>
    set((state) => {
      delete state.eventsByScope[scopeKey];
    }),

  batch: (fn) => set(fn),
})));

/** Fine-grained selector: subscribe to a single field of a single entity */
export function useEntityField<T extends EntityType, F extends keyof EntityTableMap[T]>(
  type: T,
  id: string,
  field: F,
): EntityTableMap[T][F] | undefined {
  return useEntityStore((state) => {
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
    useShallow((state) => {
      const table = state[type] as Record<string, EntityTableMap[T]>;
      let entries = Object.entries(table);
      if (filter) entries = entries.filter(([, e]) => filter(e));
      if (sort) entries.sort(([, a], [, b]) => sort(a, b));
      return entries.map(([id]) => id);
    }),
  );
}

/** Build a scope key for event partitioning */
export function eventScopeKey(scopeType: string, scopeId: string): string {
  return `${scopeType}:${scopeId}`;
}

/** Subscribe to sorted event IDs within a single scoped bucket.
 *  Only re-evaluates when that bucket changes — O(bucket) not O(all events). */
export function useScopedEventIds(
  scopeKey: string,
  sort?: (a: Event, b: Event) => number,
): string[] {
  return useEntityStore(
    useShallow((state) => {
      const bucket = state.eventsByScope[scopeKey];
      if (!bucket) return [];
      const entries = Object.entries(bucket);
      if (sort) entries.sort(([, a], [, b]) => sort(a, b));
      return entries.map(([id]) => id);
    }),
  );
}

/** Subscribe to the full scoped event bucket (e.g. for passing to buildSessionNodes).
 *  NOTE: Do NOT wrap this with useShallow — the raw bucket reference is stable
 *  (only replaced when this scope's events change) and downstream useMemo deps
 *  rely on referential equality to avoid recomputing buildSessionNodes. */
export function useScopedEvents(scopeKey: string): Record<string, Event> {
  return useEntityStore((state) => state.eventsByScope[scopeKey] ?? EMPTY_EVENTS);
}

const EMPTY_EVENTS: Record<string, Event> = {};

/** Fine-grained selector for a single field of a scoped event */
export function useScopedEventField<F extends keyof Event>(
  scopeKey: string,
  id: string,
  field: F,
): Event[F] | undefined {
  return useEntityStore((state) => {
    const bucket = state.eventsByScope[scopeKey];
    return bucket?.[id]?.[field];
  });
}

/** Get session IDs for a group from the derived index (O(1) lookup) */
export function useSessionIdsByGroup(groupId: string): Set<string> {
  return useEntityStore((state) => state._sessionIdsByGroup[groupId] ?? EMPTY_SET);
}

const EMPTY_SET: Set<string> = new Set();
