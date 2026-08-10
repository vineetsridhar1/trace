export const TRACE_CLI_CAPABILITIES = [
  "artifact:write",
  "resource:list",
  "integration:read",
  "integration:connect",
  "integration:configure",
  "session:list",
  "session:create",
  "session:convert",
  "session:read",
  "session:events",
  "session:send",
  "session:run",
  "session:stop",
  "session:archive",
] as const;

export const TRACE_CLI_ARTIFACT_MAX_BYTES = 64 * 1024 * 1024;

export type TraceCliCapability = (typeof TRACE_CLI_CAPABILITIES)[number];
export type TraceCliOperationType = "query" | "mutation" | "subscription";

export type TraceCliOperation = {
  readonly name: string;
  readonly type: TraceCliOperationType;
  readonly rootField: string;
  readonly capability: TraceCliCapability;
  readonly argumentPaths: readonly string[];
  readonly document: string;
};

function operation<const T extends TraceCliOperation>(definition: T): T {
  return definition;
}

const SESSION_FIELDS = `
  id name agentStatus sessionStatus tool model reasoningEffort hosting branch sessionGroupId
  createdAt updatedAt channel { id name } repo { id name }
`;
const EVENT_FIELDS = `id eventType scopeType scopeId timestamp payload`;

export const traceCliOperations = {
  integrationCatalog: operation({
    name: "TraceCliIntegrationCatalog",
    type: "query",
    rootField: "supportedAppIntegrations",
    capability: "integration:read",
    argumentPaths: [],
    document: `query TraceCliIntegrationCatalog {
      supportedAppIntegrations {
        id name provider providerConfigKey description guide
        capabilities { id name description guide allowedMethods allowedPathPrefixes }
      }
    }`,
  }),
  integrationConnections: operation({
    name: "TraceCliIntegrationConnections",
    type: "query",
    rootField: "integrationConnections",
    capability: "integration:read",
    argumentPaths: [],
    document: `query TraceCliIntegrationConnections {
      integrationConnections {
        id ownerUserId provider providerConfigKey displayName kind status lastError
      }
    }`,
  }),
  appIntegrationBindings: operation({
    name: "TraceCliAppIntegrationBindings",
    type: "query",
    rootField: "appIntegrationBindings",
    capability: "integration:read",
    argumentPaths: ["sessionGroupId"],
    document: `query TraceCliAppIntegrationBindings($sessionGroupId: ID!) {
      appIntegrationBindings(sessionGroupId: $sessionGroupId) {
        id integrationId sessionGroupId label provider providerConfigKey executionIdentity sharedConnectionId
        allowedMethods allowedPathPrefixes
      }
    }`,
  }),
  createIntegrationConnectSession: operation({
    name: "TraceCliCreateIntegrationConnectSession",
    type: "mutation",
    rootField: "createNangoConnectSession",
    capability: "integration:connect",
    argumentPaths: ["input.integrationId", "input.kind"],
    document: `mutation TraceCliCreateIntegrationConnectSession($input: CreateNangoConnectSessionInput!) {
      createNangoConnectSession(input: $input) { connectLink expiresAt }
    }`,
  }),
  upsertAppIntegrationBinding: operation({
    name: "TraceCliUpsertAppIntegrationBinding",
    type: "mutation",
    rootField: "upsertAppIntegrationBinding",
    capability: "integration:configure",
    argumentPaths: [
      "input.sessionGroupId",
      "input.id",
      "input.integrationId",
      "input.capabilityIds",
      "input.executionIdentity",
      "input.sharedConnectionId",
    ],
    document: `mutation TraceCliUpsertAppIntegrationBinding($input: UpsertAppIntegrationBindingInput!) {
      upsertAppIntegrationBinding(input: $input) {
        id integrationId sessionGroupId label provider providerConfigKey executionIdentity sharedConnectionId
        allowedMethods allowedPathPrefixes
      }
    }`,
  }),
  deleteAppIntegrationBinding: operation({
    name: "TraceCliDeleteAppIntegrationBinding",
    type: "mutation",
    rootField: "deleteAppIntegrationBinding",
    capability: "integration:configure",
    argumentPaths: ["id", "sessionGroupId"],
    document: `mutation TraceCliDeleteAppIntegrationBinding($id: ID!, $sessionGroupId: ID!) {
      deleteAppIntegrationBinding(id: $id, sessionGroupId: $sessionGroupId)
    }`,
  }),
  channels: operation({
    name: "TraceCliChannels",
    type: "query",
    rootField: "channels",
    capability: "resource:list",
    argumentPaths: ["organizationId", "memberOnly"],
    document: `query TraceCliChannels($organizationId: ID!, $memberOnly: Boolean) {
      channels(organizationId: $organizationId, memberOnly: $memberOnly) {
        id name type visibility baseBranch viewerIsMember
        repo { id name }
      }
    }`,
  }),
  repos: operation({
    name: "TraceCliRepos",
    type: "query",
    rootField: "repos",
    capability: "resource:list",
    argumentPaths: ["organizationId"],
    document: `query TraceCliRepos($organizationId: ID!) {
      repos(organizationId: $organizationId) { id name provider remoteUrl defaultBranch }
    }`,
  }),
  session: operation({
    name: "TraceCliSession",
    type: "query",
    rootField: "session",
    capability: "session:read",
    argumentPaths: ["id"],
    document: `query TraceCliSession($id: ID!) { session(id: $id) { ${SESSION_FIELDS} } }`,
  }),
  startContextSession: operation({
    name: "TraceCliStartContextSession",
    type: "query",
    rootField: "session",
    capability: "session:read",
    argumentPaths: ["id"],
    document: `query TraceCliStartContextSession($id: ID!) {
      session(id: $id) {
        id tool model reasoningEffort hosting
        channel { id name repo { id name } }
        repo { id name }
        connection { environmentId runtimeInstanceId }
        sessionGroup { kind visibility }
      }
    }`,
  }),
  startChannel: operation({
    name: "TraceCliStartChannel",
    type: "query",
    rootField: "channel",
    capability: "resource:list",
    argumentPaths: ["id"],
    document: `query TraceCliStartChannel($id: ID!) {
      channel(id: $id) { id name repo { id name } }
    }`,
  }),
  sessions: operation({
    name: "TraceCliSessions",
    type: "query",
    rootField: "sessions",
    capability: "session:list",
    argumentPaths: [
      "organizationId",
      "filters.agentStatus",
      "filters.tool",
      "filters.repoId",
      "filters.channelId",
      "filters.includeArchived",
      "filters.includeMerged",
      "filters.limit",
    ],
    document: `query TraceCliSessions($organizationId: ID!, $filters: SessionFilters) {
      sessions(organizationId: $organizationId, filters: $filters) { ${SESSION_FIELDS} }
    }`,
  }),
  startSession: operation({
    name: "TraceCliStartSession",
    type: "mutation",
    rootField: "startSession",
    capability: "session:create",
    argumentPaths: [
      "input.clientMutationId",
      "input.kind",
      "input.tool",
      "input.model",
      "input.reasoningEffort",
      "input.visibility",
      "input.environmentId",
      "input.hosting",
      "input.runtimeInstanceId",
      "input.deferRuntimeSelection",
      "input.repoId",
      "input.branch",
      "input.ticketId",
      "input.channelId",
      "input.sessionGroupId",
      "input.prompt",
      "input.interactionMode",
    ],
    document: `mutation TraceCliStartSession($input: StartSessionInput!) {
      startSession(input: $input) { ${SESSION_FIELDS} }
    }`,
  }),
  convertSessionGroup: operation({
    name: "TraceCliConvertSessionGroup",
    type: "mutation",
    rootField: "convertSessionGroup",
    capability: "session:convert",
    argumentPaths: [
      "input.sessionGroupId",
      "input.kind",
      "input.channelId",
      "input.repoId",
      "input.tool",
      "input.model",
      "input.reasoningEffort",
    ],
    document: `mutation TraceCliConvertSessionGroup($input: ConvertSessionGroupInput!) {
      convertSessionGroup(input: $input) { ${SESSION_FIELDS} }
    }`,
  }),
  queueSessionMessage: operation({
    name: "TraceCliQueueSessionMessage",
    type: "mutation",
    rootField: "queueSessionMessage",
    capability: "session:send",
    argumentPaths: ["sessionId", "text", "interactionMode"],
    document: `mutation TraceCliQueueSessionMessage($sessionId: ID!, $text: String!, $interactionMode: String) {
      queueSessionMessage(sessionId: $sessionId, text: $text, interactionMode: $interactionMode) {
        id sessionId text position createdAt
      }
    }`,
  }),
  sendSessionMessage: operation({
    name: "TraceCliSendSessionMessage",
    type: "mutation",
    rootField: "sendSessionMessage",
    capability: "session:send",
    argumentPaths: ["sessionId", "text", "interactionMode", "clientMutationId"],
    document: `mutation TraceCliSendSessionMessage(
      $sessionId: ID!
      $text: String!
      $interactionMode: String
      $clientMutationId: String
    ) {
      sendSessionMessage(
        sessionId: $sessionId
        text: $text
        interactionMode: $interactionMode
        clientMutationId: $clientMutationId
      ) { ${EVENT_FIELDS} }
    }`,
  }),
  runSession: operation({
    name: "TraceCliRunSession",
    type: "mutation",
    rootField: "runSession",
    capability: "session:run",
    argumentPaths: ["id", "prompt", "interactionMode"],
    document: `mutation TraceCliRunSession($id: ID!, $prompt: String, $interactionMode: String) {
      runSession(id: $id, prompt: $prompt, interactionMode: $interactionMode) { ${SESSION_FIELDS} }
    }`,
  }),
  stopSession: operation({
    name: "TraceCliStopSession",
    type: "mutation",
    rootField: "terminateSession",
    capability: "session:stop",
    argumentPaths: ["id"],
    document: `mutation TraceCliStopSession($id: ID!) {
      terminateSession(id: $id) { ${SESSION_FIELDS} }
    }`,
  }),
  archiveSession: operation({
    name: "TraceCliArchiveSession",
    type: "mutation",
    rootField: "archiveSessionGroup",
    capability: "session:archive",
    argumentPaths: ["id"],
    document: `mutation TraceCliArchiveSession($id: ID!) {
      archiveSessionGroup(id: $id) { id name status archivedAt }
    }`,
  }),
  sessionEvents: operation({
    name: "TraceCliSessionEvents",
    type: "query",
    rootField: "events",
    capability: "session:events",
    argumentPaths: ["organizationId", "scope.type", "scope.id", "limit", "before"],
    document: `query TraceCliSessionEvents(
      $organizationId: ID!
      $scope: ScopeInput!
      $limit: Int
      $before: DateTime
    ) {
      events(organizationId: $organizationId, scope: $scope, limit: $limit, before: $before) {
        ${EVENT_FIELDS}
      }
    }`,
  }),
  followSession: operation({
    name: "TraceCliFollowSession",
    type: "subscription",
    rootField: "sessionEvents",
    capability: "session:events",
    argumentPaths: ["sessionId", "organizationId", "after", "afterEventId"],
    document: `subscription TraceCliFollowSession(
      $sessionId: ID!
      $organizationId: ID!
      $after: DateTime
      $afterEventId: ID
    ) {
      sessionEvents(
        sessionId: $sessionId
        organizationId: $organizationId
        after: $after
        afterEventId: $afterEventId
      ) { ${EVENT_FIELDS} }
    }`,
  }),
} as const satisfies Readonly<Record<string, TraceCliOperation>>;

const operationsByName = new Map<string, TraceCliOperation>(
  Object.values(traceCliOperations).map((definition) => [definition.name, definition]),
);

export function traceCliOperationByName(name: string): TraceCliOperation | undefined {
  return operationsByName.get(name);
}
