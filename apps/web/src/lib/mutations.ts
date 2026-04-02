import { gql } from "@urql/core";

export const START_SESSION_MUTATION = gql`
  mutation StartSession($input: StartSessionInput!) {
    startSession(input: $input) {
      id
      sessionGroupId
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
  mutation SendSessionMessage(
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
    ) {
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

export const DISMISS_SESSION_MUTATION = gql`
  mutation DismissSession($id: ID!) {
    dismissSession(id: $id) {
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

export const MOVE_SESSION_TO_CLOUD_MUTATION = gql`
  mutation MoveSessionToCloud($sessionId: ID!) {
    moveSessionToCloud(sessionId: $sessionId) {
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

export const DELETE_CHANNEL_MUTATION = gql`
  mutation DeleteChannel($id: ID!) {
    deleteChannel(id: $id)
  }
`;

export const DELETE_SESSION_GROUP_MUTATION = gql`
  mutation DeleteSessionGroup($id: ID!) {
    deleteSessionGroup(id: $id)
  }
`;

export const ARCHIVE_SESSION_GROUP_MUTATION = gql`
  mutation ArchiveSessionGroup($id: ID!) {
    archiveSessionGroup(id: $id) {
      id
      archivedAt
      worktreeDeleted
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

export const ACCEPT_AGENT_SUGGESTION_MUTATION = gql`
  mutation AcceptAgentSuggestion($inboxItemId: ID!, $edits: JSON) {
    acceptAgentSuggestion(inboxItemId: $inboxItemId, edits: $edits) {
      id
      status
      resolvedAt
    }
  }
`;

export const DISMISS_AGENT_SUGGESTION_MUTATION = gql`
  mutation DismissAgentSuggestion($inboxItemId: ID!) {
    dismissAgentSuggestion(inboxItemId: $inboxItemId) {
      id
      status
      resolvedAt
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

export const UPDATE_SESSION_CONFIG_MUTATION = gql`
  mutation UpdateSessionConfig(
    $sessionId: ID!
    $tool: CodingTool
    $model: String
    $hosting: HostingMode
    $runtimeInstanceId: ID
  ) {
    updateSessionConfig(
      sessionId: $sessionId
      tool: $tool
      model: $model
      hosting: $hosting
      runtimeInstanceId: $runtimeInstanceId
    ) {
      id
      tool
      model
      hosting
      connection {
        state
        runtimeInstanceId
        runtimeLabel
      }
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

export const REGISTER_REPO_WEBHOOK_MUTATION = gql`
  mutation RegisterRepoWebhook($repoId: ID!) {
    registerRepoWebhook(repoId: $repoId) {
      id
    }
  }
`;

export const UNREGISTER_REPO_WEBHOOK_MUTATION = gql`
  mutation UnregisterRepoWebhook($repoId: ID!) {
    unregisterRepoWebhook(repoId: $repoId) {
      id
    }
  }
`;

export const REPO_BRANCHES_QUERY = gql`
  query RepoBranches($repoId: ID!, $runtimeInstanceId: ID) {
    repoBranches(repoId: $repoId, runtimeInstanceId: $runtimeInstanceId)
  }
`;

export const SESSION_TERMINALS_QUERY = gql`
  query SessionTerminals($sessionId: ID!) {
    sessionTerminals(sessionId: $sessionId) {
      id
      sessionId
    }
  }
`;

export const CREATE_TERMINAL_MUTATION = gql`
  mutation CreateTerminal($sessionId: ID!, $cols: Int!, $rows: Int!) {
    createTerminal(sessionId: $sessionId, cols: $cols, rows: $rows) {
      id
      sessionId
    }
  }
`;

export const DESTROY_TERMINAL_MUTATION = gql`
  mutation DestroyTerminal($terminalId: ID!) {
    destroyTerminal(terminalId: $terminalId)
  }
`;

export const ORG_MEMBERS_QUERY = gql`
  query OrgMembers($id: ID!) {
    organization(id: $id) {
      id
      members {
        user {
          id
          name
          email
          avatarUrl
        }
        role
        joinedAt
      }
    }
  }
`;

export const EDIT_CHAT_MESSAGE_MUTATION = gql`
  mutation EditChatMessage($messageId: ID!, $html: String!) {
    editChatMessage(messageId: $messageId, html: $html) {
      id
    }
  }
`;

export const DELETE_CHAT_MESSAGE_MUTATION = gql`
  mutation DeleteChatMessage($messageId: ID!) {
    deleteChatMessage(messageId: $messageId) {
      id
    }
  }
`;

export const EDIT_CHANNEL_MESSAGE_MUTATION = gql`
  mutation EditChannelMessage($messageId: ID!, $html: String!) {
    editChannelMessage(messageId: $messageId, html: $html) {
      id
    }
  }
`;

export const DELETE_CHANNEL_MESSAGE_MUTATION = gql`
  mutation DeleteChannelMessage($messageId: ID!) {
    deleteChannelMessage(messageId: $messageId) {
      id
    }
  }
`;
