export type { Platform } from "./platform.js";
export { getPlatform, setPlatform } from "./platform.js";

export type {
  EntityState,
  EntityTableMap,
  EntityType,
  SessionEntity,
  SessionGroupEntity,
} from "./stores/entity.js";
export {
  StoreBatchWriter,
  eventScopeKey,
  messageScopeKey,
  useEntitiesByIds,
  useEntityField,
  useEntityIds,
  useEntityStore,
  useMessageField,
  useMessageIdsForScope,
  useQueuedMessageIdsForSession,
  useScopedEventField,
  useScopedEventIds,
  useScopedEventIdsByParentId,
  useScopedEvents,
  useSessionIdsByGroup,
} from "./stores/entity.js";
