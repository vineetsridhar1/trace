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
  AiConversation,
  AgentObservability,
  Branch,
  Turn,
} from "@trace/gql";

/** Client-side session entity with extra fields not in the GQL schema */
export type SessionEntity = Session & {
  _lastEventPreview?: string;
  _lastMessageAt?: string;
  /** Timestamp of the last user-sent message or session start — used for agent working-time display */
  _lastUserMessageAt?: string;
  _sortTimestamp?: string;
  _optimistic?: boolean;
};

export type SessionGroupEntity = SessionGroup & {
  _sortTimestamp?: string;
  _optimistic?: boolean;
};

/** Client-side AI conversation entity with denormalized IDs for fast lookups */
export type AiConversationEntity = Omit<AiConversation, "rootBranch" | "branches" | "createdBy"> & {
  rootBranchId: string;
  branchIds: string[];
  createdById: string;
};

/** Client-side branch entity with ordered turn IDs and child branch IDs */
export type AiBranchEntity = Omit<
  Branch,
  "conversation" | "parentBranch" | "forkTurn" | "turns" | "childBranches" | "createdBy"
> & {
  conversationId: string;
  parentBranchId: string | null;
  forkTurnId: string | null;
  turnIds: string[];
  childBranchIds: string[];
  createdById: string;
};

/** Client-side turn entity with denormalized IDs */
export type AiTurnEntity = Omit<Turn, "branch" | "parentTurn" | "childBranches"> & {
  branchId: string;
  parentTurnId: string | null;
  _optimistic?: boolean;
  _clientMutationId?: string;
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
  aiConversations: AiConversationEntity;
  aiBranches: AiBranchEntity;
  aiTurns: AiTurnEntity;
};

export type EntityType = keyof EntityTableMap;

type Tables = { [K in EntityType]: Record<string, EntityTableMap[K]> };

/** Events are partitioned by scope key (`${scopeType}:${scopeId}`) for O(1) scoped lookups */
type EventsByScope = Record<string, Record<string, Event>>;
type MessageIdsByScope = Record<string, string[]>;

interface EntityActions {
  upsert: <T extends EntityType>(entityType: T, id: string, data: EntityTableMap[T]) => void;
  upsertMany: <T extends EntityType>(
    entityType: T,
    items: Array<EntityTableMap[T] & { id: string }>,
  ) => void;
  /** Shallow-merge a partial update into an existing entity */
  patch: <T extends EntityType>(
    entityType: T,
    id: string,
    data: Partial<EntityTableMap[T]>,
  ) => void;
  remove: (entityType: EntityType, id: string) => void;
  /** Upsert a single event into its scoped bucket */
  upsertScopedEvent: (scopeKey: string, id: string, event: Event) => void;
  /** Batch-upsert events into a scoped bucket */
  upsertManyScopedEvents: (scopeKey: string, items: Array<Event & { id: string }>) => void;
  /** Remove an entire scoped bucket (for eviction) */
  removeScopedEvents: (scopeKey: string) => void;
}

export type EntityState = Tables & {
  eventsByScope: EventsByScope;
  /** Reverse index: sessionGroupId → session IDs belonging to that group */
  _sessionIdsByGroup: Record<string, string[]>;
  /** Reverse index: scope key → message IDs belonging to that scope */
  _messageIdsByScope: MessageIdsByScope;
} & EntityActions;

type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void;

export const useEntityStore = create<EntityState>((set: SetState<EntityState>) => ({
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
  aiConversations: {},
  aiBranches: {},
  aiTurns: {},
  eventsByScope: {},
  _sessionIdsByGroup: {},
  _messageIdsByScope: {},

  upsert: <T extends EntityType>(entityType: T, id: string, data: EntityTableMap[T]) =>
    set((state: EntityState) => {
      const table = { ...(state[entityType] as Record<string, unknown>) };
      const previous = table[id];
      table[id] = data;
      const update: Record<string, unknown> = { [entityType]: table };

      if (entityType === "sessions") {
        const groupId = (data as unknown as SessionEntity).sessionGroupId as string | undefined;
        const idx = { ...state._sessionIdsByGroup };
        // Remove from any old bucket
        for (const gid of Object.keys(idx)) {
          const arr = idx[gid];
          if (arr.includes(id)) {
            idx[gid] = arr.filter((x: string) => x !== id);
            break;
          }
        }
        // Add to new bucket
        if (groupId) {
          idx[groupId] = [...(idx[groupId] ?? []).filter((x: string) => x !== id), id];
        }
        update._sessionIdsByGroup = idx;
      }

      if (entityType === "messages") {
        const nextIndex = updateMessageIdsByScope(
          state._messageIdsByScope,
          id,
          getMessageEntityScopeKey(previous as Message | undefined),
          getMessageEntityScopeKey(data as unknown as Message),
        );
        if (nextIndex !== state._messageIdsByScope) {
          update._messageIdsByScope = nextIndex;
        }
      }
      return update;
    }),

  upsertMany: <T extends EntityType>(entityType: T, items: Array<EntityTableMap[T] & { id: string }>) =>
    set((state: EntityState) => {
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
              idx[gid] = arr.filter((x: string) => x !== item.id);
              break;
            }
          }
          // Add to new bucket
          if (groupId) {
            idx[groupId] = [...(idx[groupId] ?? []).filter((x: string) => x !== item.id), item.id];
          }
        }
        update._sessionIdsByGroup = idx;
      }

      if (entityType === "messages") {
        let nextIndex = state._messageIdsByScope;
        for (const item of items) {
          nextIndex = updateMessageIdsByScope(
            nextIndex,
            item.id,
            getMessageEntityScopeKey(
              (state.messages[item.id] as Message | undefined) ?? undefined,
            ),
            getMessageEntityScopeKey(item as unknown as Message),
          );
        }
        if (nextIndex !== state._messageIdsByScope) {
          update._messageIdsByScope = nextIndex;
        }
      }
      return update;
    }),

  patch: <T extends EntityType>(entityType: T, id: string, data: Partial<EntityTableMap[T]>) =>
    set((state: EntityState) => {
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
        const newGroupId = (table[id] as unknown as SessionEntity).sessionGroupId as
          | string
          | undefined;
        if (oldGroupId !== newGroupId) {
          const idx = { ...state._sessionIdsByGroup };
          if (oldGroupId && idx[oldGroupId]) {
            idx[oldGroupId] = idx[oldGroupId].filter((x: string) => x !== id);
          }
          if (newGroupId) {
            idx[newGroupId] = [...(idx[newGroupId] ?? []).filter((x: string) => x !== id), id];
          }
          update._sessionIdsByGroup = idx;
        }
      }

      if (entityType === "messages") {
        const nextIndex = updateMessageIdsByScope(
          state._messageIdsByScope,
          id,
          getMessageEntityScopeKey(existing as Message | undefined),
          getMessageEntityScopeKey(table[id] as Message),
        );
        if (nextIndex !== state._messageIdsByScope) {
          update._messageIdsByScope = nextIndex;
        }
      }
      return update;
    }),

  remove: (entityType: EntityType, id: string) =>
    set((state: EntityState) => {
      const { [id]: removed, ...rest } = state[entityType] as Record<string, unknown>;
      const update: Record<string, unknown> = { [entityType]: rest };

      if (entityType === "sessions" && removed) {
        const groupId = (removed as unknown as SessionEntity).sessionGroupId as string | undefined;
        if (groupId) {
          const idx = { ...state._sessionIdsByGroup };
          if (idx[groupId]) {
            idx[groupId] = idx[groupId].filter((x: string) => x !== id);
          }
          update._sessionIdsByGroup = idx;
        }
      }

      if (entityType === "messages" && removed) {
        const nextIndex = updateMessageIdsByScope(
          state._messageIdsByScope,
          id,
          getMessageEntityScopeKey(removed as Message),
          null,
        );
        if (nextIndex !== state._messageIdsByScope) {
          update._messageIdsByScope = nextIndex;
        }
      }
      return update;
    }),

  upsertScopedEvent: (scopeKey: string, id: string, event: Event) =>
    set((state: EntityState) => {
      const bucket = state.eventsByScope[scopeKey];
      const updated = bucket ? { ...bucket, [id]: event } : { [id]: event };
      return { eventsByScope: { ...state.eventsByScope, [scopeKey]: updated } };
    }),

  upsertManyScopedEvents: (scopeKey: string, items: Array<Event & { id: string }>) =>
    set((state: EntityState) => {
      const bucket = { ...(state.eventsByScope[scopeKey] ?? {}) };
      for (const item of items) {
        bucket[item.id] = item;
      }
      return { eventsByScope: { ...state.eventsByScope, [scopeKey]: bucket } };
    }),

  removeScopedEvents: (scopeKey: string) =>
    set((state: EntityState) => {
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
  private _messageIdsByScope: MessageIdsByScope;
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
    this._messageIdsByScope = s._messageIdsByScope;
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
    const previous = table[id];
    table[id] = data;
    this.dirty.add(type);

    if (type === "sessions") {
      this.updateSessionIndex(id, data as unknown as SessionEntity);
    }
    if (type === "messages") {
      this.updateMessageScopeIndex(
        id,
        getMessageEntityScopeKey(previous as Message | undefined),
        getMessageEntityScopeKey(data as unknown as Message),
      );
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
    if (type === "messages") {
      this.updateMessageScopeIndex(
        id,
        getMessageEntityScopeKey(existing as Message | undefined),
        getMessageEntityScopeKey(table[id] as unknown as Message),
      );
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
    if (type === "messages") {
      const existing = table[id] as unknown as Message | undefined;
      this.updateMessageScopeIndex(id, getMessageEntityScopeKey(existing), null);
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

  /** Remove a single event from a scoped bucket (used for optimistic cleanup) */
  removeScopedEvent(scopeKey: string, id: string): void {
    const bucket = this.eventsByScope[scopeKey];
    if (!bucket || !bucket[id]) return;
    if (this.eventsByScope === useEntityStore.getState().eventsByScope) {
      this.eventsByScope = { ...this.eventsByScope };
    }
    const { [id]: _, ...rest } = bucket;
    this.eventsByScope[scopeKey] = rest;
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
      } else if (key === "_messageIdsByScope") {
        update._messageIdsByScope = this._messageIdsByScope;
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

  private updateMessageScopeIndex(
    id: string,
    previousScopeKey: string | null,
    nextScopeKey: string | null,
  ): void {
    const nextIndex = updateMessageIdsByScope(
      this._messageIdsByScope,
      id,
      previousScopeKey,
      nextScopeKey,
    );
    if (nextIndex !== this._messageIdsByScope) {
      this._messageIdsByScope = nextIndex;
      this.dirty.add("_messageIdsByScope");
    }
  }
}

const ENTITY_KEYS: EntityType[] = [
  "organizations",
  "users",
  "repos",
  "projects",
  "channels",
  "channelGroups",
  "sessionGroups",
  "chats",
  "sessions",
  "tickets",
  "inboxItems",
  "messages",
];

function getMessageEntityScopeKey(
  message: Pick<Message, "chatId" | "channelId"> | null | undefined,
): string | null {
  if (!message) return null;
  if (message.chatId) return messageScopeKey("chat", message.chatId);
  if (message.channelId) return messageScopeKey("channel", message.channelId);
  return null;
}

function updateMessageIdsByScope(
  index: MessageIdsByScope,
  messageId: string,
  previousScopeKey: string | null,
  nextScopeKey: string | null,
): MessageIdsByScope {
  if (previousScopeKey === nextScopeKey) {
    return index;
  }

  let nextIndex = index;

  if (previousScopeKey) {
    const previousIds = nextIndex[previousScopeKey];
    if (previousIds?.includes(messageId)) {
      if (nextIndex === index) {
        nextIndex = { ...nextIndex };
      }
      const filtered = previousIds.filter((id) => id !== messageId);
      if (filtered.length > 0) {
        nextIndex[previousScopeKey] = filtered;
      } else {
        delete nextIndex[previousScopeKey];
      }
    }
  }

  if (nextScopeKey) {
    const nextIds = nextIndex[nextScopeKey];
    if (!nextIds?.includes(messageId)) {
      if (nextIndex === index) {
        nextIndex = { ...nextIndex };
      }
      nextIndex[nextScopeKey] = [...(nextIds ?? []), messageId];
    }
  }

  return nextIndex;
}

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
      (state: EntityState) => ids.map((id) => state[type][id] ?? null) as Array<EntityTableMap[T] | null>,
    ),
  );
}

/** Build a scope key for event partitioning */
export function eventScopeKey(scopeType: string, scopeId: string): string {
  return `${scopeType}:${scopeId}`;
}

export function messageScopeKey(scopeType: "chat" | "channel", scopeId: string): string {
  return `${scopeType}:${scopeId}`;
}

/** Subscribe to sorted event IDs within a single scoped bucket.
 *  Only re-evaluates when that bucket changes — O(bucket) not O(all events). */
export function useScopedEventIds(
  scopeKey: string,
  sort?: (a: Event, b: Event) => number,
): string[] {
  return useEntityStore(
    useShallow((state: EntityState) => {
      const bucket = state.eventsByScope[scopeKey];
      if (!bucket) return [];
      const entries = Object.entries(bucket);
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
        .filter((entry: readonly [string, Message] | null): entry is readonly [string, Message] => entry !== null);

      let filtered = messages;
      if (filter) {
        filtered = filtered.filter(([, message]: readonly [string, Message]) => filter(message));
      }
      if (sort) {
        filtered = [...filtered].sort(([, a]: readonly [string, Message], [, b]: readonly [string, Message]) => sort(a, b));
      }

      return filtered.map(([id]: readonly [string, Message]) => id);
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

const EMPTY_IDS: string[] = [];

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
