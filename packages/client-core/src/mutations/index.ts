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
    $imageKeys: [String!]
    $interactionMode: String
    $clientMutationId: String
  ) {
    sendSessionMessage(
      sessionId: $sessionId
      text: $text
      imageKeys: $imageKeys
      interactionMode: $interactionMode
      clientMutationId: $clientMutationId
    ) {
      id
    }
  }
`;

export const QUEUE_SESSION_MESSAGE_MUTATION = gql`
  mutation QueueSessionMessage(
    $sessionId: ID!
    $text: String!
    $interactionMode: String
  ) {
    queueSessionMessage(
      sessionId: $sessionId
      text: $text
      interactionMode: $interactionMode
    ) {
      id
      sessionId
      text
      interactionMode
      position
      createdAt
    }
  }
`;

export const REMOVE_QUEUED_MESSAGE_MUTATION = gql`
  mutation RemoveQueuedMessage($id: ID!) {
    removeQueuedMessage(id: $id)
  }
`;

export const CLEAR_QUEUED_MESSAGES_MUTATION = gql`
  mutation ClearQueuedMessages($sessionId: ID!) {
    clearQueuedMessages(sessionId: $sessionId)
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

export const RETRY_SESSION_GROUP_SETUP_MUTATION = gql`
  mutation RetrySessionGroupSetup($id: ID!) {
    retrySessionGroupSetup(id: $id) {
      id
      setupStatus
      setupError
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
  query AvailableRuntimes($tool: CodingTool!, $sessionGroupId: ID) {
    availableRuntimes(tool: $tool, sessionGroupId: $sessionGroupId) {
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

export const BRIDGE_RUNTIME_ACCESS_QUERY = gql`
  query BridgeRuntimeAccess($runtimeInstanceId: ID!, $sessionGroupId: ID) {
    bridgeRuntimeAccess(runtimeInstanceId: $runtimeInstanceId, sessionGroupId: $sessionGroupId) {
      runtimeInstanceId
      bridgeRuntimeId
      label
      hostingMode
      connected
      allowed
      isOwner
      scopeType
      sessionGroupId
      capabilities
      expiresAt
      ownerUser {
        id
        name
        avatarUrl
      }
      pendingRequest {
        id
        scopeType
        requestedExpiresAt
        requestedCapabilities
        status
        sessionGroup {
          id
          name
        }
      }
    }
  }
`;

export const MY_BRIDGE_RUNTIMES_QUERY = gql`
  query MyBridgeRuntimes {
    myBridgeRuntimes {
      id
      instanceId
      label
      hostingMode
      lastSeenAt
      connectedAt
      disconnectedAt
      connected
      ownerUser {
        id
        name
      }
      accessRequests {
        id
        scopeType
        requestedExpiresAt
        requestedCapabilities
        status
        createdAt
        requesterUser {
          id
          name
          email
          avatarUrl
        }
        sessionGroup {
          id
          name
        }
      }
      accessGrants {
        id
        scopeType
        capabilities
        expiresAt
        revokedAt
        createdAt
        granteeUser {
          id
          name
          email
        }
        grantedByUser {
          id
          name
        }
        sessionGroup {
          id
          name
        }
      }
    }
  }
`;

export const REQUEST_BRIDGE_ACCESS_MUTATION = gql`
  mutation RequestBridgeAccess(
    $runtimeInstanceId: ID!
    $scopeType: BridgeAccessScopeType!
    $sessionGroupId: ID
    $requestedExpiresAt: DateTime
    $requestedCapabilities: [BridgeAccessCapability!]
  ) {
    requestBridgeAccess(
      runtimeInstanceId: $runtimeInstanceId
      scopeType: $scopeType
      sessionGroupId: $sessionGroupId
      requestedExpiresAt: $requestedExpiresAt
      requestedCapabilities: $requestedCapabilities
    ) {
      id
      status
      scopeType
      requestedCapabilities
      requestedExpiresAt
    }
  }
`;

export const APPROVE_BRIDGE_ACCESS_REQUEST_MUTATION = gql`
  mutation ApproveBridgeAccessRequest(
    $requestId: ID!
    $scopeType: BridgeAccessScopeType
    $sessionGroupId: ID
    $expiresAt: DateTime
    $capabilities: [BridgeAccessCapability!]
  ) {
    approveBridgeAccessRequest(
      requestId: $requestId
      scopeType: $scopeType
      sessionGroupId: $sessionGroupId
      expiresAt: $expiresAt
      capabilities: $capabilities
    ) {
      id
      scopeType
      capabilities
      expiresAt
      revokedAt
    }
  }
`;

export const DENY_BRIDGE_ACCESS_REQUEST_MUTATION = gql`
  mutation DenyBridgeAccessRequest($requestId: ID!) {
    denyBridgeAccessRequest(requestId: $requestId) {
      id
      status
      resolvedAt
    }
  }
`;

export const REVOKE_BRIDGE_ACCESS_GRANT_MUTATION = gql`
  mutation RevokeBridgeAccessGrant($grantId: ID!) {
    revokeBridgeAccessGrant(grantId: $grantId) {
      id
      revokedAt
    }
  }
`;

export const UPDATE_BRIDGE_ACCESS_GRANT_MUTATION = gql`
  mutation UpdateBridgeAccessGrant(
    $grantId: ID!
    $capabilities: [BridgeAccessCapability!]!
  ) {
    updateBridgeAccessGrant(grantId: $grantId, capabilities: $capabilities) {
      id
      capabilities
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
  query RepoBranches($repoId: ID!, $runtimeInstanceId: ID, $sessionGroupId: ID) {
    repoBranches(
      repoId: $repoId
      runtimeInstanceId: $runtimeInstanceId
      sessionGroupId: $sessionGroupId
    )
  }
`;

const LINKED_CHECKOUT_STATUS_FIELDS = `
  repoId
  repoPath
  isAttached
  attachedSessionGroupId
  targetBranch
  autoSyncEnabled
  currentBranch
  currentCommitSha
  lastSyncedCommitSha
  lastSyncError
  restoreBranch
  restoreCommitSha
`;

export const LINKED_CHECKOUT_STATUS_QUERY = gql`
  query LinkedCheckoutStatus($sessionGroupId: ID!, $repoId: ID!) {
    linkedCheckoutStatus(sessionGroupId: $sessionGroupId, repoId: $repoId) {
      ${LINKED_CHECKOUT_STATUS_FIELDS}
    }
  }
`;

export const LINK_LINKED_CHECKOUT_REPO_MUTATION = gql`
  mutation LinkLinkedCheckoutRepo($sessionGroupId: ID!, $repoId: ID!, $localPath: String!) {
    linkLinkedCheckoutRepo(
      sessionGroupId: $sessionGroupId
      repoId: $repoId
      localPath: $localPath
    ) {
      ok
      error
      status {
        ${LINKED_CHECKOUT_STATUS_FIELDS}
      }
    }
  }
`;

export const SYNC_LINKED_CHECKOUT_MUTATION = gql`
  mutation SyncLinkedCheckout(
    $sessionGroupId: ID!
    $repoId: ID!
    $branch: String!
    $commitSha: String
    $autoSyncEnabled: Boolean
  ) {
    syncLinkedCheckout(
      sessionGroupId: $sessionGroupId
      repoId: $repoId
      branch: $branch
      commitSha: $commitSha
      autoSyncEnabled: $autoSyncEnabled
    ) {
      ok
      error
      status {
        ${LINKED_CHECKOUT_STATUS_FIELDS}
      }
    }
  }
`;

export const RESTORE_LINKED_CHECKOUT_MUTATION = gql`
  mutation RestoreLinkedCheckout($sessionGroupId: ID!, $repoId: ID!) {
    restoreLinkedCheckout(sessionGroupId: $sessionGroupId, repoId: $repoId) {
      ok
      error
      status {
        ${LINKED_CHECKOUT_STATUS_FIELDS}
      }
    }
  }
`;

export const SET_LINKED_CHECKOUT_AUTO_SYNC_MUTATION = gql`
  mutation SetLinkedCheckoutAutoSync($sessionGroupId: ID!, $repoId: ID!, $enabled: Boolean!) {
    setLinkedCheckoutAutoSync(
      sessionGroupId: $sessionGroupId
      repoId: $repoId
      enabled: $enabled
    ) {
      ok
      error
      status {
        ${LINKED_CHECKOUT_STATUS_FIELDS}
      }
    }
  }
`;

export const SESSION_SLASH_COMMANDS_QUERY = gql`
  query SessionSlashCommands($sessionId: ID!) {
    sessionSlashCommands(sessionId: $sessionId) {
      name
      description
      source
      category
    }
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

export const UPDATE_CHANNEL_MUTATION = gql`
  mutation UpdateChannel($id: ID!, $input: UpdateChannelInput!) {
    updateChannel(id: $id, input: $input) {
      id
      name
      baseBranch
      setupScript
      runScripts
    }
  }
`;

export const DELETE_CHANNEL_MUTATION = gql`
  mutation DeleteChannel($id: ID!) {
    deleteChannel(id: $id)
  }
`;
