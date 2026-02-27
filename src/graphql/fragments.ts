import { gql } from '@apollo/client';

export const MESSAGE_FIELDS = gql`
  fragment MessageFields on Message {
    id
    channelId
    sessionId
    preview
    importance
    status
    summary
    branch
    claudeSessionId
    createdAt
    session {
      sessionId
      cwd
      status
    }
    threadCount
    queuedRunConfig
  }
`;

export const THREAD_EVENT_PAYLOAD_FIELDS = gql`
  fragment ThreadEventPayloadFields on ThreadEventPayload {
    channelId
    messageId
    threadId
    event {
      id
      sessionId
      hookEventName
      timestamp
      toolName
      toolInput
      toolResponse
      toolUseId
      stopHookActive
      lastAssistantMessage
      rawPayload
      threadId
      importance
    }
  }
`;
