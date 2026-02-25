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
  }
`;
