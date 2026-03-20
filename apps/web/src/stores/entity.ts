import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type {
  Organization,
  User,
  Repo,
  Project,
  Channel,
  Chat,
  Session,
  Ticket,
  Event,
  InboxItem,
} from "@trace/gql";

/** Client-side session entity with extra fields not in the GQL schema */
export type SessionEntity = Session & {
  _lastEventPreview?: string;
  _lastMessageAt?: string;
};

export type ThreadReplierEntity = {
  id?: string;
  name?: string;
  avatarUrl?: string;
  latestReplyAt: string;
};

export type ThreadSummaryEntity = {
  rootEventId: string;
  replyCount: number;
  latestReplyAt: string;
  repliers: ThreadReplierEntity[];
};

/** Entity types that the store manages, keyed by ID */
export type EntityTableMap = {
  organizations: Organization;
  users: User;
  repos: Repo;
  projects: Project;
  channels: Channel;
  chats: Chat;
  sessions: SessionEntity;
  tickets: Ticket;
  events: Event;
  threadSummaries: ThreadSummaryEntity;
  inboxItems: InboxItem;
};

export type EntityType = keyof EntityTableMap;

type Tables = { [K in EntityType]: Record<string, EntityTableMap[K]> };

interface EntityActions {
  upsert: <T extends EntityType>(entityType: T, id: string, data: EntityTableMap[T]) => void;
  upsertMany: <T extends EntityType>(
    entityType: T,
    items: Array<EntityTableMap[T] & { id: string }>,
  ) => void;
  /** Shallow-merge a partial update into an existing entity */
  patch: <T extends EntityType>(entityType: T, id: string, data: Partial<EntityTableMap[T]>) => void;
  remove: (entityType: EntityType, id: string) => void;
}

type EntityState = Tables & EntityActions;

function threadReplierKey(replier: {
  id?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}): string | null {
  if (replier.id) return `id:${replier.id}`;
  if (replier.name) return `name:${replier.name}`;
  if (replier.avatarUrl) return `avatar:${replier.avatarUrl}`;
  return null;
}

function applyReplyToThreadSummaries(
  threadSummaries: Record<string, ThreadSummaryEntity>,
  event: Event,
) {
  if (!event.parentId) return;

  const existing = threadSummaries[event.parentId] ?? {
    rootEventId: event.parentId,
    replyCount: 0,
    latestReplyAt: "",
    repliers: [],
  };

  const replierKey = threadReplierKey(event.actor);
  let repliers = existing.repliers;

  if (replierKey) {
    const current = existing.repliers.find((replier) => threadReplierKey(replier) === replierKey);
    const nextReplier: ThreadReplierEntity = {
      id: event.actor.id ?? undefined,
      name: event.actor.name ?? undefined,
      avatarUrl: event.actor.avatarUrl ?? undefined,
      latestReplyAt:
        current && current.latestReplyAt > event.timestamp ? current.latestReplyAt : event.timestamp,
    };

    repliers = [
      ...existing.repliers.filter((replier) => threadReplierKey(replier) !== replierKey),
      nextReplier,
    ]
      .sort((a, b) => b.latestReplyAt.localeCompare(a.latestReplyAt))
      .slice(0, 3);
  }

  threadSummaries[event.parentId] = {
    rootEventId: event.parentId,
    replyCount: existing.replyCount + 1,
    latestReplyAt:
      existing.latestReplyAt > event.timestamp ? existing.latestReplyAt : event.timestamp,
    repliers,
  };
}

export const useEntityStore = create<EntityState>((set) => ({
  organizations: {},
  users: {},
  repos: {},
  projects: {},
  channels: {},
  chats: {},
  sessions: {},
  tickets: {},
  events: {},
  threadSummaries: {},
  inboxItems: {},

  upsert: (entityType, id, data) =>
    set((state) => {
      if (entityType === "events") {
        const events = { ...state.events };
        const threadSummaries = { ...state.threadSummaries };
        const existing = events[id];
        const event = data as EntityTableMap["events"];

        events[id] = event;
        if (!existing) {
          applyReplyToThreadSummaries(threadSummaries, event);
        }

        return { events, threadSummaries };
      }

      const table = { ...(state[entityType] as Record<string, unknown>) };
      table[id] = data;
      return { [entityType]: table } as Partial<Tables>;
    }),

  upsertMany: (entityType, items) =>
    set((state) => {
      if (entityType === "events") {
        const events = { ...state.events };
        const threadSummaries = { ...state.threadSummaries };

        for (const item of items) {
          const existing = events[item.id];
          const event = item as EntityTableMap["events"] & { id: string };
          events[item.id] = event;
          if (!existing) {
            applyReplyToThreadSummaries(threadSummaries, event);
          }
        }

        return { events, threadSummaries };
      }

      const table = { ...(state[entityType] as Record<string, unknown>) };
      for (const item of items) {
        table[item.id] = item;
      }
      return { [entityType]: table } as Partial<Tables>;
    }),

  patch: (entityType, id, data) =>
    set((state) => {
      const table = { ...(state[entityType] as Record<string, unknown>) };
      const existing = table[id];
      if (existing) {
        table[id] = { ...(existing as object), ...data };
      }
      return { [entityType]: table } as Partial<Tables>;
    }),

  remove: (entityType, id) =>
    set((state) => {
      const { [id]: _, ...rest } = state[entityType] as Record<string, unknown>;
      return { [entityType]: rest } as Partial<Tables>;
    }),
}));

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
