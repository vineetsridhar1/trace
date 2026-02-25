import { gql } from 'urql';

export const THREADS_QUERY = gql`
  query Threads($channelId: ID!, $messageId: ID!) {
    threads(channelId: $channelId, messageId: $messageId) {
      id
      messageId
      createdAt
      eventCount
    }
  }
`;

export const THREAD_EVENTS_QUERY = gql`
  query ThreadEvents($channelId: ID!, $messageId: ID!, $threadId: ID!, $limit: Int, $offset: Int, $after: String) {
    threadEvents(channelId: $channelId, messageId: $messageId, threadId: $threadId, limit: $limit, offset: $offset, after: $after) {
      events {
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
      total
      limit
      offset
    }
  }
`;
