import { useEntityStore } from "@trace/client-core";
import type { EntityTableMap, EntityType } from "@trace/client-core";

export function applyOptimisticPatch<T extends EntityType>(
  type: T,
  id: string,
  data: Partial<EntityTableMap[T]>,
): () => void {
  const store = useEntityStore.getState();
  const previous = store[type][id] as EntityTableMap[T] | undefined;
  store.patch(type, id, data);
  return () => {
    const current = useEntityStore.getState();
    if (previous) current.upsert(type, id, previous);
    else current.remove(type, id);
  };
}
