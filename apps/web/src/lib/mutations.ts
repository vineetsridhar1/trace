import { gql } from "@urql/core";

export const START_SESSION_MUTATION = gql`
  mutation StartSession($input: StartSessionInput!) {
    startSession(input: $input) {
      id
    }
  }
`;

export const RUN_SESSION_MUTATION = gql`
  mutation RunSession($id: ID!, $prompt: String, $interactionMode: String) {
    runSession(id: $id, prompt: $prompt, interactionMode: $interactionMode) {
      id
    }
  }
`;

export const SEND_SESSION_MESSAGE_MUTATION = gql`
  mutation SendSessionMessage($sessionId: ID!, $text: String!, $interactionMode: String) {
    sendSessionMessage(sessionId: $sessionId, text: $text, interactionMode: $interactionMode) {
      id
    }
  }
`;

export const TERMINATE_SESSION_MUTATION = gql`
  mutation TerminateSession($id: ID!) {
    terminateSession(id: $id) {
      id
    }
  }
`;

export const RETRY_SESSION_CONNECTION_MUTATION = gql`
  mutation RetrySessionConnection($sessionId: ID!) {
    retrySessionConnection(sessionId: $sessionId) {
      id
    }
  }
`;

export const MOVE_SESSION_TO_RUNTIME_MUTATION = gql`
  mutation MoveSessionToRuntime($sessionId: ID!, $runtimeInstanceId: ID!) {
    moveSessionToRuntime(sessionId: $sessionId, runtimeInstanceId: $runtimeInstanceId) {
      id
    }
  }
`;

export const DELETE_SESSION_MUTATION = gql`
  mutation DeleteSession($id: ID!) {
    deleteSession(id: $id) {
      id
    }
  }
`;

export const AVAILABLE_SESSION_RUNTIMES_QUERY = gql`
  query AvailableSessionRuntimes($sessionId: ID!) {
    availableSessionRuntimes(sessionId: $sessionId) {
      id
      label
      hostingMode
      supportedTools
      connected
      sessionCount
      registeredRepoIds
    }
  }
`;

export const DISMISS_INBOX_ITEM_MUTATION = gql`
  mutation DismissInboxItem($id: ID!) {
    dismissInboxItem(id: $id) {
      id
    }
  }
`;

export const AVAILABLE_RUNTIMES_QUERY = gql`
  query AvailableRuntimes($tool: CodingTool!) {
    availableRuntimes(tool: $tool) {
      id
      label
      hostingMode
      supportedTools
      connected
      sessionCount
      registeredRepoIds
    }
  }
`;

export const UPDATE_REPO_MUTATION = gql`
  mutation UpdateRepo($id: ID!, $input: UpdateRepoInput!) {
    updateRepo(id: $id, input: $input) {
      id
    }
  }
`;

export const REPO_BRANCHES_QUERY = gql`
  query RepoBranches($repoId: ID!, $runtimeInstanceId: ID) {
    repoBranches(repoId: $repoId, runtimeInstanceId: $runtimeInstanceId)
  }
`;
