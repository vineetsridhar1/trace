import { useEntityStore, type EntityType } from "@trace/client-core";

type SnapshotEntityType = Extract<
  EntityType,
  "channels" | "channelGroups" | "sessionGroups" | "sessions"
>;

const snapshotIdsByKey = new Map<string, Set<string>>();
const snapshotOwnersByEntity = new Map<string, Set<string>>();

function qualifiedSnapshotKey(entityType: SnapshotEntityType, snapshotKey: string): string {
  return `${entityType}:${snapshotKey}`;
}

function entityOwnerKey(entityType: SnapshotEntityType, id: string): string {
  return `${entityType}:${id}`;
}

export function reconcileEntitySnapshot(
  entityType: SnapshotEntityType,
  snapshotKey: string,
  nextIds: string[],
): void {
  const store = useEntityStore.getState();
  const qualifiedKey = qualifiedSnapshotKey(entityType, snapshotKey);
  const previousIds = snapshotIdsByKey.get(qualifiedKey) ?? new Set<string>();
  const nextIdSet = new Set(nextIds);

  for (const id of nextIdSet) {
    const ownerKey = entityOwnerKey(entityType, id);
    const owners = snapshotOwnersByEntity.get(ownerKey) ?? new Set<string>();
    owners.add(qualifiedKey);
    snapshotOwnersByEntity.set(ownerKey, owners);
  }

  for (const id of previousIds) {
    if (nextIdSet.has(id)) continue;
    const ownerKey = entityOwnerKey(entityType, id);
    const owners = snapshotOwnersByEntity.get(ownerKey);
    if (!owners) continue;
    owners.delete(qualifiedKey);
    if (owners.size === 0) {
      snapshotOwnersByEntity.delete(ownerKey);
      store.remove(entityType, id);
    } else {
      snapshotOwnersByEntity.set(ownerKey, owners);
    }
  }

  snapshotIdsByKey.set(qualifiedKey, nextIdSet);
}

export function resetEntitySnapshots(): void {
  snapshotIdsByKey.clear();
  snapshotOwnersByEntity.clear();
}
