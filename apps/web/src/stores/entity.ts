import { create } from "zustand";

type EntityMap = Record<string, unknown>;

interface EntityState {
  organizations: EntityMap;
  repos: EntityMap;
  projects: EntityMap;
  channels: EntityMap;
  sessions: EntityMap;
  tickets: EntityMap;
  events: EntityMap;

  upsert: (entityType: string, id: string, data: unknown) => void;
  upsertMany: (entityType: string, items: Array<{ id: string }>) => void;
  remove: (entityType: string, id: string) => void;
}

function getTable(state: EntityState, entityType: string): EntityMap {
  return (state as unknown as Record<string, EntityMap>)[entityType] ?? {};
}

export const useEntityStore = create<EntityState>((set) => ({
  organizations: {},
  repos: {},
  projects: {},
  channels: {},
  sessions: {},
  tickets: {},
  events: {},

  upsert: (entityType, id, data) =>
    set((state) => ({
      [entityType]: { ...getTable(state, entityType), [id]: data },
    })),

  upsertMany: (entityType, items) =>
    set((state) => {
      const merged = { ...getTable(state, entityType) };
      for (const item of items) {
        merged[item.id] = item;
      }
      return { [entityType]: merged };
    }),

  remove: (entityType, id) =>
    set((state) => {
      const merged = { ...getTable(state, entityType) };
      delete merged[id];
      return { [entityType]: merged };
    }),
}));
