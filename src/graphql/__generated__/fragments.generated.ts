import * as Types from './schema-types';

import { gql } from '@apollo/client';
export type MessageFieldsFragment = { __typename?: 'Message', id: string, channelId: string, sessionId: string, preview?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, claudeSessionId?: string | null, createdAt: string, threadCount: number, session?: { __typename?: 'MessageSession', sessionId: string, cwd?: string | null, status: string } | null };

export const MessageFieldsFragmentDoc = gql`
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