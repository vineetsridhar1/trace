import { gql } from "@urql/core";

const ASSISTANT_SESSION_FIELDS = gql`
  fragment AssistantSessionFields on Session {
    id
    name
    kind
    agentStatus
    sessionStatus
    tool
    model
    reasoningEffort
    hosting
    repo {
      id
      name
      remoteUrl
    }
    branch
    workdir
    prUrl
    worktreeDeleted
    lastUserMessageAt
    lastMessageAt
    connection {
      state
      runtimeInstanceId
      runtimeLabel
      lastError
      retryCount
      canRetry
      canMove
      autoRetryable
    }
    createdBy {
      id
      name
      avatarUrl
    }
    sessionGroupId
    channel {
      id
    }
    queuedMessages {
      id
      sessionId
      text
      imageKeys: attachmentKeys
      interactionMode
      position
      createdAt
    }
    createdAt
    updatedAt
  }
`;

export const ORG_ASSISTANT_SESSIONS_QUERY = gql`
  ${ASSISTANT_SESSION_FIELDS}
  query OrgAssistantSessions($organizationId: ID!) {
    orgAssistantSessions(organizationId: $organizationId) {
      ...AssistantSessionFields
    }
    orgAssistantSession(organizationId: $organizationId) {
      ...AssistantSessionFields
    }
  }
`;

export const CREATE_ORG_ASSISTANT_SESSION_MUTATION = gql`
  ${ASSISTANT_SESSION_FIELDS}
  mutation CreateOrgAssistantSession($organizationId: ID!) {
    createOrgAssistantSession(organizationId: $organizationId) {
      ...AssistantSessionFields
    }
  }
`;
