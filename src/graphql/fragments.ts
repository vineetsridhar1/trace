import { gql } from '@apollo/client';

export const WORKSPACE_FIELDS = gql`
  fragment WorkspaceFields on Workspace {
    id
    channelId
    cliSessionId
    preview
    importance
    status
    summary
    branch
    claudeSessionId
    createdAt
    cliSession {
      sessionId
      cwd
      status
    }
    sessionCount
    queuedRunConfig
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
