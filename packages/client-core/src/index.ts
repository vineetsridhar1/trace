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

export type { AuthState, OrgMembership } from "./stores/auth.js";
export { getAuthHeaders, useAuthStore } from "./stores/auth.js";

export { generateUUID } from "./utils/uuid.js";

export { getSessionChannelId, getSessionGroupChannelId } from "./lib/session-group.js";

export * from "./mutations/index.js";
export {
  isOptimisticEvent,
  optimisticallyInsertChatMessage,
  optimisticallyInsertSessionMessage,
  reconcileOptimisticChatMessage,
  reconcileOptimisticSessionMessage,
  removeOptimisticChatMessage,
  removeOptimisticSessionMessage,
  takePendingOptimisticChat,
  takePendingOptimisticSession,
  upsertFetchedChatMessagesWithOptimisticResolution,
  upsertFetchedSessionEventsWithOptimisticResolution,
  upsertSessionEventWithOptimisticResolution,
} from "./mutations/optimistic-message.js";
export type {
  OptimisticChatIds,
  OptimisticSessionIds,
  PendingChatEntry,
  PendingSessionEntry,
} from "./mutations/optimistic-message.js";

export { handleOrgEvent, handleSessionEvent } from "./events/handlers.js";
export {
  extractMessagePreview,
  mergeGitCheckpoints,
  rewriteGitCheckpoints,
  routeSessionOutput,
  sessionPatchFromOutput,
  shouldBumpSortTimestampForOutput,
} from "./events/session-output.js";
export type { OrgEventUIBindings } from "./events/ui-bindings.js";
export { getOrgEventUIBindings, setOrgEventUIBindings } from "./events/ui-bindings.js";

export type { NotificationHandler } from "./notifications/registry.js";
export { notifyForEvent, registerHandler } from "./notifications/registry.js";

export type { CreateGqlClientOptions, GqlClient } from "./gql/createClient.js";
export { createGqlClient } from "./gql/createClient.js";
