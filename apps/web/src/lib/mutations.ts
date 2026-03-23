import { graphql } from "@trace/gql/client";

export const START_SESSION_MUTATION = graphql(`
  mutation StartSession($input: StartSessionInput!) {
    startSession(input: $input) {
      id
    }
  }
`);

export const RUN_SESSION_MUTATION = graphql(`
  mutation RunSession($id: ID!, $prompt: String, $interactionMode: String) {
    runSession(id: $id, prompt: $prompt, interactionMode: $interactionMode) {
      id
    }
  }
`);

export const SEND_SESSION_MESSAGE_MUTATION = graphql(`
  mutation SendSessionMessage($sessionId: ID!, $text: String!, $interactionMode: String) {
    sendSessionMessage(sessionId: $sessionId, text: $text, interactionMode: $interactionMode) {
      id
    }
  }
`);

export const TERMINATE_SESSION_MUTATION = graphql(`
  mutation TerminateSession($id: ID!) {
    terminateSession(id: $id) {
      id
    }
  }
`);

export const DISMISS_SESSION_MUTATION = graphql(`
  mutation DismissSession($id: ID!) {
    dismissSession(id: $id) {
      id
    }
  }
`);

export const RETRY_SESSION_CONNECTION_MUTATION = graphql(`
  mutation RetrySessionConnection($sessionId: ID!) {
    retrySessionConnection(sessionId: $sessionId) {
      id
    }
  }
`);

export const MOVE_SESSION_TO_RUNTIME_MUTATION = graphql(`
  mutation MoveSessionToRuntime($sessionId: ID!, $runtimeInstanceId: ID!) {
    moveSessionToRuntime(sessionId: $sessionId, runtimeInstanceId: $runtimeInstanceId) {
      id
    }
  }
`);

export const MOVE_SESSION_TO_CLOUD_MUTATION = graphql(`
  mutation MoveSessionToCloud($sessionId: ID!) {
    moveSessionToCloud(sessionId: $sessionId) {
      id
    }
  }
`);

export const DELETE_SESSION_MUTATION = graphql(`
  mutation DeleteSession($id: ID!) {
    deleteSession(id: $id) {
      id
    }
  }
`);

export const AVAILABLE_SESSION_RUNTIMES_QUERY = graphql(`
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
`);

export const DISMISS_INBOX_ITEM_MUTATION = graphql(`
  mutation DismissInboxItem($id: ID!) {
    dismissInboxItem(id: $id) {
      id
    }
  }
`);

export const AVAILABLE_RUNTIMES_QUERY = graphql(`
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
`);

export const UPDATE_REPO_MUTATION = graphql(`
  mutation UpdateRepo($id: ID!, $input: UpdateRepoInput!) {
    updateRepo(id: $id, input: $input) {
      id
    }
  }
`);

export const REGISTER_REPO_WEBHOOK_MUTATION = graphql(`
  mutation RegisterRepoWebhook($repoId: ID!) {
    registerRepoWebhook(repoId: $repoId) {
      id
    }
  }
`);

export const UNREGISTER_REPO_WEBHOOK_MUTATION = graphql(`
  mutation UnregisterRepoWebhook($repoId: ID!) {
    unregisterRepoWebhook(repoId: $repoId) {
      id
    }
  }
`);

export const REPO_BRANCHES_QUERY = graphql(`
  query RepoBranches($repoId: ID!, $runtimeInstanceId: ID) {
    repoBranches(repoId: $repoId, runtimeInstanceId: $runtimeInstanceId)
  }
`);

export const SESSION_TERMINALS_QUERY = graphql(`
  query SessionTerminals($sessionId: ID!) {
    sessionTerminals(sessionId: $sessionId) {
      id
      sessionId
    }
  }
`);

export const CREATE_TERMINAL_MUTATION = graphql(`
  mutation CreateTerminal($sessionId: ID!, $cols: Int!, $rows: Int!) {
    createTerminal(sessionId: $sessionId, cols: $cols, rows: $rows) {
      id
      sessionId
    }
  }
`);

export const DESTROY_TERMINAL_MUTATION = graphql(`
  mutation DestroyTerminal($terminalId: ID!) {
    destroyTerminal(terminalId: $terminalId)
  }
`);

export const ORG_MEMBERS_QUERY = graphql(`
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
`);

export const EDIT_CHAT_MESSAGE_MUTATION = graphql(`
  mutation EditChatMessage($messageId: ID!, $html: String!) {
    editChatMessage(messageId: $messageId, html: $html) {
      id
    }
  }
`);

export const DELETE_CHAT_MESSAGE_MUTATION = graphql(`
  mutation DeleteChatMessage($messageId: ID!) {
    deleteChatMessage(messageId: $messageId) {
      id
    }
  }
`);

export const EDIT_CHANNEL_MESSAGE_MUTATION = graphql(`
  mutation EditChannelMessage($messageId: ID!, $html: String!) {
    editChannelMessage(messageId: $messageId, html: $html) {
      id
    }
  }
`);

export const DELETE_CHANNEL_MESSAGE_MUTATION = graphql(`
  mutation DeleteChannelMessage($messageId: ID!) {
    deleteChannelMessage(messageId: $messageId) {
      id
    }
  }
`);
