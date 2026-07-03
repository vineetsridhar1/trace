// React-free surface for Node clients (CLI, daemon). Keep this list explicit —
// the guard test in headless.test.ts enforces that no module in this graph
// imports react or a react-bound entrypoint (urql, zustand's main entry).
export type { Platform } from "./platform.js";
export { getPlatform, setPlatform } from "./platform.js";

export type { CreateGqlClientOptions, GqlClient } from "./gql/createClient.js";
export { createGqlClient } from "./gql/createClient.js";

export type {
  EntityState,
  EntityTableMap,
  EntityType,
  SessionEntity,
  SessionGroupEntity,
} from "./stores/entity-store.js";
export { eventScopeKey, messageScopeKey, useEntityStore } from "./stores/entity-store.js";

export type { AuthState, OrgMembership } from "./stores/auth-store.js";
export { getAuthHeaders, LOCAL_LOGIN_NAME_KEY, useAuthStore } from "./stores/auth-store.js";

export { handleOrgEvent, handleSessionEvent } from "./events/handlers.js";
export { routeSessionOutput, sessionPatchFromOutput } from "./events/session-output.js";

export type {
  AgentToolResult,
  BuildSessionNodesResult,
  ReadGlobItem,
  SessionNode,
} from "./session/nodes.js";
export { buildSessionNodes } from "./session/nodes.js";

export {
  optimisticallyInsertSessionMessage,
  reconcileOptimisticSessionMessage,
} from "./mutations/optimistic-message.js";

export {
  QUEUE_SESSION_MESSAGE_MUTATION,
  SEND_SESSION_MESSAGE_MUTATION,
  START_SESSION_MUTATION,
  TERMINATE_SESSION_MUTATION,
} from "./mutations/index.js";
