export const TRACE_CLI_CAPABILITIES = [
  "artifact:write",
  "resource:list",
  "app:control",
  "port:control",
  "session:list",
  "session:create",
  "session:convert",
  "session:read",
  "session:events",
  "session:send",
  "session:run",
  "session:stop",
  "session:archive",
  "session:link-pr",
  "terminal:control",
  "workspace:control",
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
  readonly sessionGroupArgumentPath?: string;
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
const TERMINAL_FIELDS = `id sessionId status cols rows connected`;
const SESSION_APPLICATION_PROCESS_FIELDS = `
  id sessionGroupId appConfigId processConfigId label status runtimeInstanceId
  startedAt stoppedAt exitCode lastError
  endpoints { id url label targetPort status accessMode }
`;
const SESSION_ENDPOINT_FIELDS = `
  id key url sessionGroupId source appConfigId processConfigId portConfigId label targetPort
  status accessMode trafficCaptureMode enabledAt disabledAt revokedAt
`;
const REPO_APPLICATION_FIELDS = `
  id name processes {
    id name command workingDirectory required
    ports { id label port protocol defaultForwardingEnabled healthPath }
  }
`;
export const traceCliOperations = {
  sessionApplicationState: operation({
    name: "TraceCliSessionApplicationState",
    type: "query",
    rootField: "sessionApplicationState",
    capability: "app:control",
    argumentPaths: ["sessionGroupId"],
    sessionGroupArgumentPath: "sessionGroupId",
    document: `query TraceCliSessionApplicationState($sessionGroupId: ID!) {
      sessionApplicationState(sessionGroupId: $sessionGroupId) {
        applications { ${REPO_APPLICATION_FIELDS} }
        processes { ${SESSION_APPLICATION_PROCESS_FIELDS} }
      }
    }`,
  }),
  sessionApplicationLogs: operation({
    name: "TraceCliSessionApplicationLogs",
    type: "query",
    rootField: "sessionApplicationLogs",
    capability: "app:control",
    argumentPaths: ["sessionGroupId", "processId", "limit"],
    sessionGroupArgumentPath: "sessionGroupId",
    document: `query TraceCliSessionApplicationLogs($sessionGroupId: ID!, $processId: ID!, $limit: Int) {
      sessionApplicationLogs(sessionGroupId: $sessionGroupId, processId: $processId, limit: $limit) {
        id processId stream data sequence timestamp
      }
    }`,
  }),
  startSessionApplication: operation({
    name: "TraceCliStartSessionApplication",
    type: "mutation",
    rootField: "startSessionApplication",
    capability: "app:control",
    argumentPaths: ["sessionGroupId", "appConfigId"],
    sessionGroupArgumentPath: "sessionGroupId",
    document: `mutation TraceCliStartSessionApplication($sessionGroupId: ID!, $appConfigId: ID!) {
      startSessionApplication(sessionGroupId: $sessionGroupId, appConfigId: $appConfigId) { ${SESSION_APPLICATION_PROCESS_FIELDS} }
    }`,
  }),
  stopSessionApplication: operation({
    name: "TraceCliStopSessionApplication",
    type: "mutation",
    rootField: "stopSessionApplication",
    capability: "app:control",
    argumentPaths: ["sessionGroupId", "appConfigId"],
    sessionGroupArgumentPath: "sessionGroupId",
    document: `mutation TraceCliStopSessionApplication($sessionGroupId: ID!, $appConfigId: ID!) {
      stopSessionApplication(sessionGroupId: $sessionGroupId, appConfigId: $appConfigId) { ${SESSION_APPLICATION_PROCESS_FIELDS} }
    }`,
  }),
  startSessionProcess: operation({
    name: "TraceCliStartSessionProcess",
    type: "mutation",
    rootField: "startSessionProcess",
    capability: "app:control",
    argumentPaths: ["sessionGroupId", "appConfigId", "processConfigId"],
    sessionGroupArgumentPath: "sessionGroupId",
    document: `mutation TraceCliStartSessionProcess($sessionGroupId: ID!, $appConfigId: ID!, $processConfigId: ID!) {
      startSessionProcess(sessionGroupId: $sessionGroupId, appConfigId: $appConfigId, processConfigId: $processConfigId) { ${SESSION_APPLICATION_PROCESS_FIELDS} }
    }`,
  }),
  stopSessionProcess: operation({
    name: "TraceCliStopSessionProcess",
    type: "mutation",
    rootField: "stopSessionProcess",
    capability: "app:control",
    argumentPaths: ["sessionGroupId", "appConfigId", "processConfigId"],
    sessionGroupArgumentPath: "sessionGroupId",
    document: `mutation TraceCliStopSessionProcess($sessionGroupId: ID!, $appConfigId: ID!, $processConfigId: ID!) {
      stopSessionProcess(sessionGroupId: $sessionGroupId, appConfigId: $appConfigId, processConfigId: $processConfigId) { ${SESSION_APPLICATION_PROCESS_FIELDS} }
    }`,
  }),
  restartSessionProcess: operation({
    name: "TraceCliRestartSessionProcess",
    type: "mutation",
    rootField: "restartSessionProcess",
    capability: "app:control",
    argumentPaths: ["sessionGroupId", "appConfigId", "processConfigId"],
    sessionGroupArgumentPath: "sessionGroupId",
    document: `mutation TraceCliRestartSessionProcess($sessionGroupId: ID!, $appConfigId: ID!, $processConfigId: ID!) {
      restartSessionProcess(sessionGroupId: $sessionGroupId, appConfigId: $appConfigId, processConfigId: $processConfigId) { ${SESSION_APPLICATION_PROCESS_FIELDS} }
    }`,
  }),
  forwardSessionPort: operation({
    name: "TraceCliForwardSessionPort",
    type: "mutation",
    rootField: "forwardSessionPort",
    capability: "port:control",
    argumentPaths: ["sessionGroupId", "port", "label", "accessMode"],
    sessionGroupArgumentPath: "sessionGroupId",
    document: `mutation TraceCliForwardSessionPort($sessionGroupId: ID!, $port: Int!, $label: String, $accessMode: SessionEndpointAccessMode) {
      forwardSessionPort(sessionGroupId: $sessionGroupId, port: $port, label: $label, accessMode: $accessMode) { ${SESSION_ENDPOINT_FIELDS} }
    }`,
  }),
  sessionEndpoints: operation({
    name: "TraceCliSessionEndpoints",
    type: "query",
    rootField: "sessionEndpoints",
    capability: "port:control",
    argumentPaths: ["sessionGroupId"],
    sessionGroupArgumentPath: "sessionGroupId",
    document: `query TraceCliSessionEndpoints($sessionGroupId: ID!) {
      sessionEndpoints(sessionGroupId: $sessionGroupId) { ${SESSION_ENDPOINT_FIELDS} }
    }`,
  }),
  enableSessionEndpointForwarding: operation({
    name: "TraceCliEnableSessionEndpointForwarding",
    type: "mutation",
    rootField: "enableSessionEndpointForwarding",
    capability: "port:control",
    argumentPaths: ["sessionGroupId", "endpointId", "accessMode"],
    sessionGroupArgumentPath: "sessionGroupId",
    document: `mutation TraceCliEnableSessionEndpointForwarding($sessionGroupId: ID!, $endpointId: ID!, $accessMode: SessionEndpointAccessMode) {
      enableSessionEndpointForwarding(sessionGroupId: $sessionGroupId, endpointId: $endpointId, accessMode: $accessMode) { ${SESSION_ENDPOINT_FIELDS} }
    }`,
  }),
  disableSessionEndpointForwarding: operation({
    name: "TraceCliDisableSessionEndpointForwarding",
    type: "mutation",
    rootField: "disableSessionEndpointForwarding",
    capability: "port:control",
    argumentPaths: ["sessionGroupId", "endpointId"],
    sessionGroupArgumentPath: "sessionGroupId",
    document: `mutation TraceCliDisableSessionEndpointForwarding($sessionGroupId: ID!, $endpointId: ID!) {
      disableSessionEndpointForwarding(sessionGroupId: $sessionGroupId, endpointId: $endpointId) { ${SESSION_ENDPOINT_FIELDS} }
    }`,
  }),
  sessionTerminals: operation({
    name: "TraceCliSessionTerminals",
    type: "query",
    rootField: "sessionTerminals",
    capability: "terminal:control",
    argumentPaths: ["sessionId"],
    document: `query TraceCliSessionTerminals($sessionId: ID!) { sessionTerminals(sessionId: $sessionId) { ${TERMINAL_FIELDS} } }`,
  }),
  terminalCapture: operation({
    name: "TraceCliTerminalCapture",
    type: "query",
    rootField: "terminalCapture",
    capability: "terminal:control",
    argumentPaths: ["terminalId", "maxBytes", "plainText"],
    document: `query TraceCliTerminalCapture($terminalId: ID!, $maxBytes: Int, $plainText: Boolean) { terminalCapture(terminalId: $terminalId, maxBytes: $maxBytes, plainText: $plainText) { terminalId output byteCount truncated capturedAt closed connected } }`,
  }),
  createTerminal: operation({
    name: "TraceCliCreateTerminal",
    type: "mutation",
    rootField: "createTerminal",
    capability: "terminal:control",
    argumentPaths: ["sessionId", "cols", "rows"],
    document: `mutation TraceCliCreateTerminal($sessionId: ID!, $cols: Int!, $rows: Int!) { createTerminal(sessionId: $sessionId, cols: $cols, rows: $rows) { ${TERMINAL_FIELDS} } }`,
  }),
  openTerminal: operation({
    name: "TraceCliOpenTerminal",
    type: "mutation",
    rootField: "createTerminal",
    capability: "terminal:control",
    argumentPaths: ["sessionId", "cols", "rows"],
    document: `mutation TraceCliOpenTerminal($sessionId: ID!, $cols: Int!, $rows: Int!) { createTerminal(sessionId: $sessionId, cols: $cols, rows: $rows, openInWorkspace: true) { ${TERMINAL_FIELDS} } }`,
  }),
  openWorkspaceBrowser: operation({
    name: "TraceCliOpenWorkspaceBrowser",
    type: "mutation",
    rootField: "openWorkspaceBrowser",
    capability: "workspace:control",
    argumentPaths: ["sessionGroupId", "url"],
    sessionGroupArgumentPath: "sessionGroupId",
    document: `mutation TraceCliOpenWorkspaceBrowser($sessionGroupId: ID!, $url: String!) { openWorkspaceBrowser(sessionGroupId: $sessionGroupId, url: $url) }`,
  }),
  sendTerminalInput: operation({
    name: "TraceCliSendTerminalInput",
    type: "mutation",
    rootField: "sendTerminalInput",
    capability: "terminal:control",
    argumentPaths: ["terminalId", "data"],
    document: `mutation TraceCliSendTerminalInput($terminalId: ID!, $data: String!) { sendTerminalInput(terminalId: $terminalId, data: $data) }`,
  }),
  resizeTerminal: operation({
    name: "TraceCliResizeTerminal",
    type: "mutation",
    rootField: "resizeTerminal",
    capability: "terminal:control",
    argumentPaths: ["terminalId", "cols", "rows"],
    document: `mutation TraceCliResizeTerminal($terminalId: ID!, $cols: Int!, $rows: Int!) { resizeTerminal(terminalId: $terminalId, cols: $cols, rows: $rows) }`,
  }),
  destroyTerminal: operation({
    name: "TraceCliDestroyTerminal",
    type: "mutation",
    rootField: "destroyTerminal",
    capability: "terminal:control",
    argumentPaths: ["terminalId"],
    document: `mutation TraceCliDestroyTerminal($terminalId: ID!) { destroyTerminal(terminalId: $terminalId) }`,
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
  linkSessionPullRequest: operation({
    name: "TraceCliLinkSessionPullRequest",
    type: "mutation",
    rootField: "linkSessionPullRequest",
    capability: "session:link-pr",
    argumentPaths: ["sessionId", "prUrl"],
    document: `mutation TraceCliLinkSessionPullRequest($sessionId: ID!, $prUrl: String!) {
      linkSessionPullRequest(sessionId: $sessionId, prUrl: $prUrl) { id name status prUrl }
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
