import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
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
}

type EntityState = Tables & {
  eventsByScope: EventsByScope;
  /** Reverse index: sessionGroupId → session IDs belonging to that group */
  _sessionIdsByGroup: Record<string, string[]>;
} & EntityActions;

export const useEntityStore = create<EntityState>((set) => ({
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
      const table = { ...(state[entityType] as Record<string, unknown>) };
      table[id] = data;
      const update: Record<string, unknown> = { [entityType]: table };

      if (entityType === "sessions") {
        const groupId = (data as unknown as SessionEntity).sessionGroupId as string | undefined;
        const idx = { ...state._sessionIdsByGroup };
        // Remove from any old bucket
        for (const gid of Object.keys(idx)) {
          const arr = idx[gid];
          if (arr.includes(id)) {
            idx[gid] = arr.filter((x) => x !== id);
            break;
          }
        }
        // Add to new bucket
        if (groupId) {
          idx[groupId] = [...(idx[groupId] ?? []).filter((x) => x !== id), id];
        }
        update._sessionIdsByGroup = idx;
      }
      return update;
    }),

  upsertMany: (entityType, items) =>
    set((state) => {
      const table = { ...(state[entityType] as Record<string, unknown>) };
      for (const item of items) {
        table[item.id] = item;
      }
      const update: Record<string, unknown> = { [entityType]: table };

      if (entityType === "sessions") {
        const idx = { ...state._sessionIdsByGroup };
        for (const item of items) {
          const groupId = (item as unknown as SessionEntity).sessionGroupId as string | undefined;
          // Remove from any old bucket
          for (const gid of Object.keys(idx)) {
            const arr = idx[gid];
            if (arr.includes(item.id)) {
              idx[gid] = arr.filter((x) => x !== item.id);
              break;
            }
          }
          // Add to new bucket
          if (groupId) {
            idx[groupId] = [...(idx[groupId] ?? []).filter((x) => x !== item.id), item.id];
          }
        }
        update._sessionIdsByGroup = idx;
      }
      return update;
    }),

  patch: (entityType, id, data) =>
    set((state) => {
      const table = { ...(state[entityType] as Record<string, unknown>) };
      const existing = table[id];
      if (!existing) return {};
      const oldGroupId =
        entityType === "sessions"
          ? ((existing as unknown as SessionEntity).sessionGroupId as string | undefined)
          : undefined;
      table[id] = { ...(existing as object), ...data };
      const update: Record<string, unknown> = { [entityType]: table };

      if (entityType === "sessions") {
        const newGroupId = (table[id] as unknown as SessionEntity).sessionGroupId as string | undefined;
        if (oldGroupId !== newGroupId) {
          const idx = { ...state._sessionIdsByGroup };
          if (oldGroupId && idx[oldGroupId]) {
            idx[oldGroupId] = idx[oldGroupId].filter((x) => x !== id);
          }
          if (newGroupId) {
            idx[newGroupId] = [...(idx[newGroupId] ?? []).filter((x) => x !== id), id];
          }
          update._sessionIdsByGroup = idx;
        }
      }
      return update;
    }),

  remove: (entityType, id) =>
    set((state) => {
      const { [id]: removed, ...rest } = state[entityType] as Record<string, unknown>;
      const update: Record<string, unknown> = { [entityType]: rest };

      if (entityType === "sessions" && removed) {
        const groupId = (removed as unknown as SessionEntity).sessionGroupId as string | undefined;
        if (groupId) {
          const idx = { ...state._sessionIdsByGroup };
          if (idx[groupId]) {
            idx[groupId] = idx[groupId].filter((x) => x !== id);
          }
          update._sessionIdsByGroup = idx;
        }
      }
      return update;
    }),

  upsertScopedEvent: (scopeKey, id, event) =>
    set((state) => {
      const bucket = state.eventsByScope[scopeKey];
      const updated = bucket ? { ...bucket, [id]: event } : { [id]: event };
      return { eventsByScope: { ...state.eventsByScope, [scopeKey]: updated } };
    }),

  upsertManyScopedEvents: (scopeKey, items) =>
    set((state) => {
      const bucket = { ...(state.eventsByScope[scopeKey] ?? {}) };
      for (const item of items) {
        bucket[item.id] = item;
      }
      return { eventsByScope: { ...state.eventsByScope, [scopeKey]: bucket } };
    }),

  removeScopedEvents: (scopeKey) =>
    set((state) => {
      const { [scopeKey]: _, ...rest } = state.eventsByScope;
      return { eventsByScope: rest };
    }),
}));

// ---------------------------------------------------------------------------
// StoreBatchWriter — accumulate multiple mutations and flush as a single
// `setState`, so subscribers are notified exactly once per event.
// ---------------------------------------------------------------------------

export class StoreBatchWriter {
  private tables: { [K in EntityType]: Record<string, EntityTableMap[K]> };
  private eventsByScope: EventsByScope;
  private _sessionIdsByGroup: Record<string, string[]>;
  private dirty = new Set<string>();

  constructor() {
    const s = useEntityStore.getState();
    // Shallow-copy top-level references so we can mutate without affecting the
    // live store until flush().
    this.tables = {} as typeof this.tables;
    for (const key of ENTITY_KEYS) {
      (this.tables as Record<string, unknown>)[key] = s[key];
    }
    this.eventsByScope = s.eventsByScope;
    this._sessionIdsByGroup = s._sessionIdsByGroup;
  }

  /** Read the current (possibly batched) value of an entity */
  get<T extends EntityType>(type: T, id: string): EntityTableMap[T] | undefined {
    return (this.tables[type] as Record<string, EntityTableMap[T]>)[id];
  }

  /** Read all entities of a given type */
  getAll<T extends EntityType>(type: T): Record<string, EntityTableMap[T]> {
    return this.tables[type] as Record<string, EntityTableMap[T]>;
  }

  upsert<T extends EntityType>(type: T, id: string, data: EntityTableMap[T]): void {
    const table = this.ensureTable(type);
    table[id] = data;
    this.dirty.add(type);

    if (type === "sessions") {
      this.updateSessionIndex(id, data as unknown as SessionEntity);
    }
  }

  patch<T extends EntityType>(type: T, id: string, data: Partial<EntityTableMap[T]>): void {
    const table = this.ensureTable(type);
    const existing = table[id];
    if (!existing) return;

    const oldGroupId =
      type === "sessions" ? (existing as unknown as SessionEntity).sessionGroupId : undefined;
    table[id] = { ...(existing as object), ...data } as EntityTableMap[T];
    this.dirty.add(type);

    if (type === "sessions") {
      const newGroupId = (table[id] as unknown as SessionEntity).sessionGroupId;
      if (oldGroupId !== newGroupId) {
        this.removeFromGroupIndex(id, oldGroupId as string | undefined);
        this.addToGroupIndex(id, newGroupId as string | undefined);
      }
    }
  }

  remove(type: EntityType, id: string): void {
    const table = this.ensureTable(type);
    if (type === "sessions") {
      const existing = table[id] as unknown as SessionEntity | undefined;
      if (existing) {
        this.removeFromGroupIndex(id, existing.sessionGroupId as string | undefined);
      }
    }
    delete table[id];
    this.dirty.add(type);
  }

  upsertScopedEvent(scopeKey: string, id: string, event: Event): void {
    if (this.eventsByScope === useEntityStore.getState().eventsByScope) {
      this.eventsByScope = { ...this.eventsByScope };
    }
    const bucket = this.eventsByScope[scopeKey];
    this.eventsByScope[scopeKey] = bucket ? { ...bucket, [id]: event } : { [id]: event };
    this.dirty.add("eventsByScope");
  }

  flush(): void {
    if (this.dirty.size === 0) return;
    const update: Record<string, unknown> = {};
    for (const key of this.dirty) {
      if (key === "eventsByScope") {
        update.eventsByScope = this.eventsByScope;
      } else if (key === "_sessionIdsByGroup") {
        update._sessionIdsByGroup = this._sessionIdsByGroup;
      } else {
        update[key] = (this.tables as Record<string, unknown>)[key];
      }
    }
    useEntityStore.setState(update);
  }

  // -- internal helpers --

  private ensureTable<T extends EntityType>(type: T): Record<string, EntityTableMap[T]> {
    const storeState = useEntityStore.getState();
    if ((this.tables as Record<string, unknown>)[type] === storeState[type]) {
      (this.tables as Record<string, unknown>)[type] = { ...storeState[type] };
    }
    return this.tables[type] as Record<string, EntityTableMap[T]>;
  }

  private updateSessionIndex(id: string, session: SessionEntity): void {
    const groupId = session.sessionGroupId as string | undefined;
    // Remove from any old bucket first (in case of overwrite)
    this.removeFromGroupIndex(id);
    this.addToGroupIndex(id, groupId);
  }

  private removeFromGroupIndex(id: string, groupId?: string): void {
    // If groupId not provided, scan (rare — only on full upsert)
    if (!groupId) {
      for (const gid of Object.keys(this._sessionIdsByGroup)) {
        const arr = this._sessionIdsByGroup[gid];
        const idx = arr.indexOf(id);
        if (idx !== -1) {
          groupId = gid;
          break;
        }
      }
    }
    if (!groupId) return;
    this.ensureGroupBucket();
    const arr = this._sessionIdsByGroup[groupId];
    if (!arr) return;
    const idx = arr.indexOf(id);
    if (idx !== -1) {
      this._sessionIdsByGroup[groupId] = arr.filter((x) => x !== id);
      this.dirty.add("_sessionIdsByGroup");
    }
  }

  private addToGroupIndex(id: string, groupId?: string): void {
    if (!groupId) return;
    this.ensureGroupBucket();
    const arr = this._sessionIdsByGroup[groupId];
    if (!arr) {
      this._sessionIdsByGroup[groupId] = [id];
    } else if (!arr.includes(id)) {
      this._sessionIdsByGroup[groupId] = [...arr, id];
    }
    this.dirty.add("_sessionIdsByGroup");
  }

  private ensureGroupBucket(): void {
    if (this._sessionIdsByGroup === useEntityStore.getState()._sessionIdsByGroup) {
      this._sessionIdsByGroup = { ...this._sessionIdsByGroup };
    }
  }
}

const ENTITY_KEYS: EntityType[] = [
  "organizations", "users", "repos", "projects", "channels",
  "channelGroups", "sessionGroups", "chats", "sessions",
  "tickets", "inboxItems", "messages",
];

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

const EMPTY_IDS: string[] = [];

/** Subscribe to session IDs belonging to a specific group via the reverse index.
 *  Uses shallow comparison — only re-renders when the list of IDs changes. */
export function useSessionIdsByGroup(groupId: string | undefined): string[] {
  return useEntityStore(
    useShallow((state) => {
      if (!groupId) return EMPTY_IDS;
      return state._sessionIdsByGroup[groupId] ?? EMPTY_IDS;
    }),
  );
}
