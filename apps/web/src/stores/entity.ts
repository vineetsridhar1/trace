import { create } from "zustand";
import type {
  Organization,
  User,
  Repo,
  Project,
  Channel,
  Session,
  Ticket,
  Event,
} from "@trace/gql";

/** Entity types that the store manages, keyed by ID */
export type EntityTableMap = {
  organizations: Organization;
  users: User;
  repos: Repo;
  projects: Project;
  channels: Channel;
  sessions: Session;
  tickets: Ticket;
  events: Event;
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

export const useEntityStore = create<EntityState>((set) => ({
  organizations: {},
  users: {},
  repos: {},
  projects: {},
  channels: {},
  sessions: {},
  tickets: {},
  events: {},

  upsert: (entityType, id, data) =>
    set((state) => {
      const table = { ...(state[entityType] as Record<string, unknown>) };
      table[id] = data;
      return { [entityType]: table } as Partial<Tables>;
    }),

  upsertMany: (entityType, items) =>
    set((state) => {
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
