import { useEntityStore } from "@trace/client-core";
import type { EntityTableMap, EntityType } from "@trace/client-core";

type PatchSpec<T extends EntityType> = {
  type: T;
  id: string;
  data: Partial<EntityTableMap[T]>;
};

type Snapshot<T extends EntityType> = {
  type: T;
  id: string;
  previous: EntityTableMap[T] | undefined;
};

export function applyOptimisticPatch<T extends EntityType>(
  type: T,
  id: string,
  data: Partial<EntityTableMap[T]>,
): () => void {
  return applyOptimisticPatches([{ type, id, data }]);
}

export function applyOptimisticPatches(patches: PatchSpec<EntityType>[]): () => void {
  const store = useEntityStore.getState();
  const snapshots: Snapshot<EntityType>[] = patches.map(({ type, id }) => ({
    type,
    id,
    previous: store[type][id],
  }));

  for (const patch of patches) {
    store.patch(patch.type, patch.id, patch.data as Partial<EntityTableMap[typeof patch.type]>);
  }

  return () => {
    const currentStore = useEntityStore.getState();
    for (const snapshot of snapshots.reverse()) {
      if (snapshot.previous) {
        currentStore.upsert(snapshot.type, snapshot.id, snapshot.previous);
      } else {
        currentStore.remove(snapshot.type, snapshot.id);
      }
    }
  };
}
