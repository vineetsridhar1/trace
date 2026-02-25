import { gql } from 'urql';

const MESSAGE_FIELDS = gql`
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
  }
`;

export const MESSAGES_QUERY = gql`
  query Messages($channelId: ID!, $limit: Int, $offset: Int) {
    messages(channelId: $channelId, limit: $limit, offset: $offset) {
      messages {
        ...MessageFields
      }
      total
      limit
      offset
    }
  }
  ${MESSAGE_FIELDS}
`;

export const CREATE_MESSAGE_MUTATION = gql`
  mutation CreateMessage($channelId: ID!, $text: String!, $attachmentIds: [String!]) {
    createMessage(channelId: $channelId, text: $text, attachmentIds: $attachmentIds) {
      message {
        ...MessageFields
      }
      thread {
        id
        messageId
        createdAt
        eventCount
      }
      event {
        id
        sessionId
        hookEventName
        timestamp
        threadId
        importance
      }
    }
  }
  ${MESSAGE_FIELDS}
`;

export const APPEND_PROMPT_MUTATION = gql`
  mutation AppendPrompt($channelId: ID!, $messageId: ID!, $text: String!, $attachmentIds: [String!]) {
    appendPrompt(channelId: $channelId, messageId: $messageId, text: $text, attachmentIds: $attachmentIds) {
      message {
        ...MessageFields
      }
      thread {
        id
        messageId
        createdAt
        eventCount
      }
      event {
        id
        sessionId
        hookEventName
        timestamp
        threadId
        importance
      }
    }
  }
  ${MESSAGE_FIELDS}
`;

export const UPDATE_PREVIEW_MUTATION = gql`
  mutation UpdateMessagePreview($channelId: ID!, $messageId: ID!, $preview: String!) {
    updateMessagePreview(channelId: $channelId, messageId: $messageId, preview: $preview) {
      ...MessageFields
    }
  }
  ${MESSAGE_FIELDS}
`;

export const UPDATE_STATUS_MUTATION = gql`
  mutation UpdateMessageStatus($channelId: ID!, $messageId: ID!, $status: String!) {
    updateMessageStatus(channelId: $channelId, messageId: $messageId, status: $status) {
      ...MessageFields
    }
  }
  ${MESSAGE_FIELDS}
`;
