import { gql } from "@apollo/client";

export const WORKSPACE_FIELDS = gql`
  fragment WorkspaceFields on Workspace {
    id
    channelId
    cliSessionId
    userId
    preview
    ticketTitle
    importance
    status
    summary
    branch
    agentSessionId
    agentType
    createdAt
    cliSession {
      sessionId
      cwd
      status
      permissionMode
    }
    user {
      id
      name
      avatarUrl
    }
    sessionCount
    queuedRunConfig
    isProductDoc
  }
`;

export const SESSION_EVENT_PAYLOAD_FIELDS = gql`
  fragment SessionEventPayloadFields on SessionEventPayload {
    channelId
    workspaceId
    sessionId
    event {
      id
      cliSessionId
      hookEventName
      timestamp
      toolName
      toolInput
      toolResponse
      toolUseId
      stopHookActive
      lastAssistantMessage
      rawPayload
      sessionId
      importance
    }
  }
`;
