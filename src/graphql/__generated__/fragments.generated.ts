import * as Types from './schema-types';

import { gql } from '@apollo/client';
export type MessageFieldsFragment = { __typename?: 'Message', id: string, channelId: string, sessionId: string, preview?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, claudeSessionId?: string | null, createdAt: string, threadCount: number, session?: { __typename?: 'MessageSession', sessionId: string, cwd?: string | null, status: string } | null };

export type ThreadEventPayloadFieldsFragment = { __typename?: 'ThreadEventPayload', channelId: string, messageId: string, threadId: string, event: { __typename?: 'Event', id: string, sessionId: string, hookEventName: string, timestamp: string, toolName?: string | null, toolInput?: unknown | null, toolResponse?: unknown | null, toolUseId?: string | null, stopHookActive?: boolean | null, lastAssistantMessage?: string | null, rawPayload: unknown, threadId: string, importance: string } };

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
export const ThreadEventPayloadFieldsFragmentDoc = gql`
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