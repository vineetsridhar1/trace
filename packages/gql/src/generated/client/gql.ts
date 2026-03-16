/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query Channels($organizationId: ID!) {\n    channels(organizationId: $organizationId) {\n      id\n      name\n      type\n    }\n  }\n": typeof types.ChannelsDocument,
    "\n  query Repos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n    }\n  }\n": typeof types.ReposDocument,
    "\n  query Sessions($organizationId: ID!, $filters: SessionFilters) {\n    sessions(organizationId: $organizationId, filters: $filters) {\n      id\n      name\n      status\n      tool\n      model\n      hosting\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n      }\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      channel {\n        id\n      }\n      parentSession {\n        id\n        name\n      }\n      childSessions {\n        id\n        name\n      }\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.SessionsDocument,
    "\n  query SessionDetail($id: ID!) {\n    session(id: $id) {\n      id\n      name\n      status\n      tool\n      model\n      hosting\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n      }\n      createdBy { id name avatarUrl }\n      channel { id }\n      parentSession { id name status }\n      childSessions { id name status }\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.SessionDetailDocument,
    "\n  mutation UpdateSessionConfig($sessionId: ID!, $tool: CodingTool, $model: String) {\n    updateSessionConfig(sessionId: $sessionId, tool: $tool, model: $model) {\n      id\n      tool\n      model\n    }\n  }\n": typeof types.UpdateSessionConfigDocument,
    "\n  mutation CreateRepo($input: CreateRepoInput!) {\n    createRepo(input: $input) {\n      id\n    }\n  }\n": typeof types.CreateRepoDocument,
    "\n  mutation CreateChannel($input: CreateChannelInput!) {\n    createChannel(input: $input) {\n      id\n    }\n  }\n": typeof types.CreateChannelDocument,
    "\n  subscription OrgEvents($organizationId: ID!) {\n    orgEvents(organizationId: $organizationId) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": typeof types.OrgEventsDocument,
    "\n  query SessionEvents($organizationId: ID!, $scope: ScopeInput, $limit: Int, $before: DateTime) {\n    events(organizationId: $organizationId, scope: $scope, limit: $limit, before: $before) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": typeof types.SessionEventsDocument,
    "\n  mutation StartSession($input: StartSessionInput!) {\n    startSession(input: $input) {\n      id\n    }\n  }\n": typeof types.StartSessionDocument,
    "\n  mutation RunSession($id: ID!, $prompt: String, $interactionMode: String) {\n    runSession(id: $id, prompt: $prompt, interactionMode: $interactionMode) {\n      id\n    }\n  }\n": typeof types.RunSessionDocument,
    "\n  mutation SendSessionMessage($sessionId: ID!, $text: String!, $interactionMode: String) {\n    sendSessionMessage(sessionId: $sessionId, text: $text, interactionMode: $interactionMode) {\n      id\n    }\n  }\n": typeof types.SendSessionMessageDocument,
    "\n  mutation TerminateSession($id: ID!) {\n    terminateSession(id: $id) {\n      id\n    }\n  }\n": typeof types.TerminateSessionDocument,
    "\n  mutation RetrySessionConnection($sessionId: ID!) {\n    retrySessionConnection(sessionId: $sessionId) {\n      id\n    }\n  }\n": typeof types.RetrySessionConnectionDocument,
    "\n  mutation MoveSessionToRuntime($sessionId: ID!, $runtimeInstanceId: ID!) {\n    moveSessionToRuntime(sessionId: $sessionId, runtimeInstanceId: $runtimeInstanceId) {\n      id\n    }\n  }\n": typeof types.MoveSessionToRuntimeDocument,
    "\n  query AvailableSessionRuntimes($sessionId: ID!) {\n    availableSessionRuntimes(sessionId: $sessionId) {\n      id\n      label\n      hostingMode\n      supportedTools\n      connected\n      sessionCount\n    }\n  }\n": typeof types.AvailableSessionRuntimesDocument,
    "\n  query AvailableRuntimes($tool: CodingTool!) {\n    availableRuntimes(tool: $tool) {\n      id\n      label\n      hostingMode\n      supportedTools\n      connected\n      sessionCount\n    }\n  }\n": typeof types.AvailableRuntimesDocument,
};
const documents: Documents = {
    "\n  query Channels($organizationId: ID!) {\n    channels(organizationId: $organizationId) {\n      id\n      name\n      type\n    }\n  }\n": types.ChannelsDocument,
    "\n  query Repos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n    }\n  }\n": types.ReposDocument,
    "\n  query Sessions($organizationId: ID!, $filters: SessionFilters) {\n    sessions(organizationId: $organizationId, filters: $filters) {\n      id\n      name\n      status\n      tool\n      model\n      hosting\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n      }\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      channel {\n        id\n      }\n      parentSession {\n        id\n        name\n      }\n      childSessions {\n        id\n        name\n      }\n      createdAt\n      updatedAt\n    }\n  }\n": types.SessionsDocument,
    "\n  query SessionDetail($id: ID!) {\n    session(id: $id) {\n      id\n      name\n      status\n      tool\n      model\n      hosting\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n      }\n      createdBy { id name avatarUrl }\n      channel { id }\n      parentSession { id name status }\n      childSessions { id name status }\n      createdAt\n      updatedAt\n    }\n  }\n": types.SessionDetailDocument,
    "\n  mutation UpdateSessionConfig($sessionId: ID!, $tool: CodingTool, $model: String) {\n    updateSessionConfig(sessionId: $sessionId, tool: $tool, model: $model) {\n      id\n      tool\n      model\n    }\n  }\n": types.UpdateSessionConfigDocument,
    "\n  mutation CreateRepo($input: CreateRepoInput!) {\n    createRepo(input: $input) {\n      id\n    }\n  }\n": types.CreateRepoDocument,
    "\n  mutation CreateChannel($input: CreateChannelInput!) {\n    createChannel(input: $input) {\n      id\n    }\n  }\n": types.CreateChannelDocument,
    "\n  subscription OrgEvents($organizationId: ID!) {\n    orgEvents(organizationId: $organizationId) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": types.OrgEventsDocument,
    "\n  query SessionEvents($organizationId: ID!, $scope: ScopeInput, $limit: Int, $before: DateTime) {\n    events(organizationId: $organizationId, scope: $scope, limit: $limit, before: $before) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": types.SessionEventsDocument,
    "\n  mutation StartSession($input: StartSessionInput!) {\n    startSession(input: $input) {\n      id\n    }\n  }\n": types.StartSessionDocument,
    "\n  mutation RunSession($id: ID!, $prompt: String, $interactionMode: String) {\n    runSession(id: $id, prompt: $prompt, interactionMode: $interactionMode) {\n      id\n    }\n  }\n": types.RunSessionDocument,
    "\n  mutation SendSessionMessage($sessionId: ID!, $text: String!, $interactionMode: String) {\n    sendSessionMessage(sessionId: $sessionId, text: $text, interactionMode: $interactionMode) {\n      id\n    }\n  }\n": types.SendSessionMessageDocument,
    "\n  mutation TerminateSession($id: ID!) {\n    terminateSession(id: $id) {\n      id\n    }\n  }\n": types.TerminateSessionDocument,
    "\n  mutation RetrySessionConnection($sessionId: ID!) {\n    retrySessionConnection(sessionId: $sessionId) {\n      id\n    }\n  }\n": types.RetrySessionConnectionDocument,
    "\n  mutation MoveSessionToRuntime($sessionId: ID!, $runtimeInstanceId: ID!) {\n    moveSessionToRuntime(sessionId: $sessionId, runtimeInstanceId: $runtimeInstanceId) {\n      id\n    }\n  }\n": types.MoveSessionToRuntimeDocument,
    "\n  query AvailableSessionRuntimes($sessionId: ID!) {\n    availableSessionRuntimes(sessionId: $sessionId) {\n      id\n      label\n      hostingMode\n      supportedTools\n      connected\n      sessionCount\n    }\n  }\n": types.AvailableSessionRuntimesDocument,
    "\n  query AvailableRuntimes($tool: CodingTool!) {\n    availableRuntimes(tool: $tool) {\n      id\n      label\n      hostingMode\n      supportedTools\n      connected\n      sessionCount\n    }\n  }\n": types.AvailableRuntimesDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Channels($organizationId: ID!) {\n    channels(organizationId: $organizationId) {\n      id\n      name\n      type\n    }\n  }\n"): (typeof documents)["\n  query Channels($organizationId: ID!) {\n    channels(organizationId: $organizationId) {\n      id\n      name\n      type\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Repos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n    }\n  }\n"): (typeof documents)["\n  query Repos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Sessions($organizationId: ID!, $filters: SessionFilters) {\n    sessions(organizationId: $organizationId, filters: $filters) {\n      id\n      name\n      status\n      tool\n      model\n      hosting\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n      }\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      channel {\n        id\n      }\n      parentSession {\n        id\n        name\n      }\n      childSessions {\n        id\n        name\n      }\n      createdAt\n      updatedAt\n    }\n  }\n"): (typeof documents)["\n  query Sessions($organizationId: ID!, $filters: SessionFilters) {\n    sessions(organizationId: $organizationId, filters: $filters) {\n      id\n      name\n      status\n      tool\n      model\n      hosting\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n      }\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      channel {\n        id\n      }\n      parentSession {\n        id\n        name\n      }\n      childSessions {\n        id\n        name\n      }\n      createdAt\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SessionDetail($id: ID!) {\n    session(id: $id) {\n      id\n      name\n      status\n      tool\n      model\n      hosting\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n      }\n      createdBy { id name avatarUrl }\n      channel { id }\n      parentSession { id name status }\n      childSessions { id name status }\n      createdAt\n      updatedAt\n    }\n  }\n"): (typeof documents)["\n  query SessionDetail($id: ID!) {\n    session(id: $id) {\n      id\n      name\n      status\n      tool\n      model\n      hosting\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n      }\n      createdBy { id name avatarUrl }\n      channel { id }\n      parentSession { id name status }\n      childSessions { id name status }\n      createdAt\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateSessionConfig($sessionId: ID!, $tool: CodingTool, $model: String) {\n    updateSessionConfig(sessionId: $sessionId, tool: $tool, model: $model) {\n      id\n      tool\n      model\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateSessionConfig($sessionId: ID!, $tool: CodingTool, $model: String) {\n    updateSessionConfig(sessionId: $sessionId, tool: $tool, model: $model) {\n      id\n      tool\n      model\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateRepo($input: CreateRepoInput!) {\n    createRepo(input: $input) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation CreateRepo($input: CreateRepoInput!) {\n    createRepo(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateChannel($input: CreateChannelInput!) {\n    createChannel(input: $input) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation CreateChannel($input: CreateChannelInput!) {\n    createChannel(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription OrgEvents($organizationId: ID!) {\n    orgEvents(organizationId: $organizationId) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"): (typeof documents)["\n  subscription OrgEvents($organizationId: ID!) {\n    orgEvents(organizationId: $organizationId) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SessionEvents($organizationId: ID!, $scope: ScopeInput, $limit: Int, $before: DateTime) {\n    events(organizationId: $organizationId, scope: $scope, limit: $limit, before: $before) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"): (typeof documents)["\n  query SessionEvents($organizationId: ID!, $scope: ScopeInput, $limit: Int, $before: DateTime) {\n    events(organizationId: $organizationId, scope: $scope, limit: $limit, before: $before) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation StartSession($input: StartSessionInput!) {\n    startSession(input: $input) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation StartSession($input: StartSessionInput!) {\n    startSession(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RunSession($id: ID!, $prompt: String, $interactionMode: String) {\n    runSession(id: $id, prompt: $prompt, interactionMode: $interactionMode) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation RunSession($id: ID!, $prompt: String, $interactionMode: String) {\n    runSession(id: $id, prompt: $prompt, interactionMode: $interactionMode) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SendSessionMessage($sessionId: ID!, $text: String!, $interactionMode: String) {\n    sendSessionMessage(sessionId: $sessionId, text: $text, interactionMode: $interactionMode) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation SendSessionMessage($sessionId: ID!, $text: String!, $interactionMode: String) {\n    sendSessionMessage(sessionId: $sessionId, text: $text, interactionMode: $interactionMode) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation TerminateSession($id: ID!) {\n    terminateSession(id: $id) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation TerminateSession($id: ID!) {\n    terminateSession(id: $id) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RetrySessionConnection($sessionId: ID!) {\n    retrySessionConnection(sessionId: $sessionId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation RetrySessionConnection($sessionId: ID!) {\n    retrySessionConnection(sessionId: $sessionId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation MoveSessionToRuntime($sessionId: ID!, $runtimeInstanceId: ID!) {\n    moveSessionToRuntime(sessionId: $sessionId, runtimeInstanceId: $runtimeInstanceId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation MoveSessionToRuntime($sessionId: ID!, $runtimeInstanceId: ID!) {\n    moveSessionToRuntime(sessionId: $sessionId, runtimeInstanceId: $runtimeInstanceId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AvailableSessionRuntimes($sessionId: ID!) {\n    availableSessionRuntimes(sessionId: $sessionId) {\n      id\n      label\n      hostingMode\n      supportedTools\n      connected\n      sessionCount\n    }\n  }\n"): (typeof documents)["\n  query AvailableSessionRuntimes($sessionId: ID!) {\n    availableSessionRuntimes(sessionId: $sessionId) {\n      id\n      label\n      hostingMode\n      supportedTools\n      connected\n      sessionCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AvailableRuntimes($tool: CodingTool!) {\n    availableRuntimes(tool: $tool) {\n      id\n      label\n      hostingMode\n      supportedTools\n      connected\n      sessionCount\n    }\n  }\n"): (typeof documents)["\n  query AvailableRuntimes($tool: CodingTool!) {\n    availableRuntimes(tool: $tool) {\n      id\n      label\n      hostingMode\n      supportedTools\n      connected\n      sessionCount\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;