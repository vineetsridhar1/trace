import * as Types from './schema-types';

import { gql } from '@apollo/client';
export type WorkspaceFieldsFragment = { __typename?: 'Workspace', id: string, channelId: string, cliSessionId: string, preview?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, claudeSessionId?: string | null, createdAt: string, sessionCount: number, queuedRunConfig?: unknown | null, cliSession?: { __typename?: 'WorkspaceCliSession', sessionId: string, cwd?: string | null, status: string } | null };

export type SessionEventPayloadFieldsFragment = { __typename?: 'SessionEventPayload', channelId: string, workspaceId: string, sessionId: string, event: { __typename?: 'Event', id: string, cliSessionId: string, hookEventName: string, timestamp: string, toolName?: string | null, toolInput?: unknown | null, toolResponse?: unknown | null, toolUseId?: string | null, stopHookActive?: boolean | null, lastAssistantMessage?: string | null, rawPayload: unknown, sessionId: string, importance: string } };

export const WorkspaceFieldsFragmentDoc = gql`
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
export const SessionEventPayloadFieldsFragmentDoc = gql`
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