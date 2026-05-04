export type { Platform } from "./platform.js";
export { getPlatform, setPlatform } from "./platform.js";

export type {
  EntityState,
  EntityTableMap,
  EntityType,
  SessionEntity,
  SessionGroupEntity,
  StreamingSessionOutput,
} from "./stores/entity.js";
export {
  StoreBatchWriter,
  appendStreamingSessionOutput,
  clearStreamingSessionOutput,
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
  useStreamingSessionOutput,
} from "./stores/entity.js";

export type { AuthState, OrgMembership } from "./stores/auth.js";
export { getAuthHeaders, LOCAL_LOGIN_NAME_KEY, useAuthStore } from "./stores/auth.js";

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
export {
  insertOptimisticSessionPair,
  reconcileOptimisticSessionPair,
  rollbackOptimisticSessionPair,
} from "./mutations/optimistic-session.js";
export type {
  InsertOptimisticSessionPairParams,
  OptimisticSessionShape,
  ReconcileOptimisticSessionPairParams,
  RollbackOptimisticSessionPairParams,
} from "./mutations/optimistic-session.js";

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

export {
  HIDDEN_SESSION_PAYLOAD_TYPES,
  HIDDEN_SESSION_PAYLOAD_TYPE_SET,
} from "./session/event-filters.js";
export { buildSessionNodes } from "./session/nodes.js";
export type {
  AgentToolResult,
  BuildSessionNodesResult,
  ReadGlobItem,
  SessionNode,
} from "./session/nodes.js";
export {
  ASK_PREFIX,
  PLAN_PREFIX,
  formatCommandLabel,
  formatTime,
  getCommandPrefix,
  serializeUnknown,
  stripPromptWrapping,
  truncate,
  wrapPrompt,
} from "./session/messages.js";
export type { InteractionMode } from "./session/messages.js";
export { useQuestionState } from "./session/question-state.js";
