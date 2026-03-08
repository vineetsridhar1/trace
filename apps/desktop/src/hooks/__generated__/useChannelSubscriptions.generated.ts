import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import { WorkspaceFieldsFragmentDoc, SessionEventPayloadFieldsFragmentDoc } from '../../graphql/__generated__/fragments.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type WorkspaceUpsertedSubscriptionVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
}>;


export type WorkspaceUpsertedSubscription = { __typename?: 'Subscription', workspaceUpserted: { __typename?: 'Workspace', id: string, channelId: string, cliSessionId: string, userId?: string | null, preview?: string | null, ticketTitle?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, agentSessionId?: string | null, agentType?: string | null, createdAt: string, sessionCount: number, queuedRunConfig?: unknown | null, isProductDoc: boolean, isOrchestrator: boolean, cliSession?: { __typename?: 'WorkspaceCliSession', sessionId: string, cwd?: string | null, status: string, permissionMode?: string | null } | null, user?: { __typename?: 'WorkspaceUser', id: string, name: string, avatarUrl?: string | null } | null } };

export type WorkspaceDeletedSubscriptionVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
}>;


export type WorkspaceDeletedSubscription = { __typename?: 'Subscription', workspaceDeleted: { __typename?: 'WorkspaceDeletedPayload', channelId: string, workspaceId: string } };

export type SessionEventCreatedSubscriptionVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
}>;


export type SessionEventCreatedSubscription = { __typename?: 'Subscription', sessionEventCreated: { __typename?: 'SessionEventPayload', channelId: string, workspaceId: string, sessionId: string, event: { __typename?: 'Event', id: string, cliSessionId: string, hookEventName: string, timestamp: string, toolName?: string | null, toolInput?: unknown | null, toolResponse?: unknown | null, toolUseId?: string | null, stopHookActive?: boolean | null, lastAssistantMessage?: string | null, rawPayload: unknown, sessionId: string, importance: string } } };

export type SessionEventUpdatedSubscriptionVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
}>;


export type SessionEventUpdatedSubscription = { __typename?: 'Subscription', sessionEventUpdated: { __typename?: 'SessionEventPayload', channelId: string, workspaceId: string, sessionId: string, event: { __typename?: 'Event', id: string, cliSessionId: string, hookEventName: string, timestamp: string, toolName?: string | null, toolInput?: unknown | null, toolResponse?: unknown | null, toolUseId?: string | null, stopHookActive?: boolean | null, lastAssistantMessage?: string | null, rawPayload: unknown, sessionId: string, importance: string } } };

export type TicketReadyToRunSubscriptionVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
}>;


export type TicketReadyToRunSubscription = { __typename?: 'Subscription', ticketReadyToRun: { __typename?: 'TicketReadyToRunPayload', channelId: string, workspaceId: string, runConfig: unknown } };

export type TicketReadyForReviewSubscriptionVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
}>;


export type TicketReadyForReviewSubscription = { __typename?: 'Subscription', ticketReadyForReview: { __typename?: 'TicketReadyForReviewPayload', channelId: string, workspaceId: string, runConfig: unknown } };

export type TicketUpsertedSubscriptionVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
}>;


export type TicketUpsertedSubscription = { __typename?: 'Subscription', ticketUpserted: { __typename?: 'TicketUpsertPayload', channelId: string, columnSlug: string, ticket: { __typename?: 'Ticket', id: string, workspaceId?: string | null, columnId: string, title: string, description?: string | null, solutionApproach?: string | null, status: string, metadata?: unknown | null, sortOrder: number, createdAt: string, updatedAt: string, workspace?: { __typename?: 'TicketWorkspace', id: string, userId?: string | null, branch?: string | null, prUrl?: string | null, status: string, createdAt: string, attachments: Array<{ __typename?: 'TicketAttachment', id: string, key: string, filename: string, contentType: string, url: string }> } | null } } };


export const WorkspaceUpsertedDocument = gql`
    subscription WorkspaceUpserted($channelId: ID!) {
  workspaceUpserted(channelId: $channelId) {
    ...WorkspaceFields
  }
}
    ${WorkspaceFieldsFragmentDoc}`;

/**
 * __useWorkspaceUpsertedSubscription__
 *
 * To run a query within a React component, call `useWorkspaceUpsertedSubscription` and pass it any options that fit your needs.
 * When your component renders, `useWorkspaceUpsertedSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useWorkspaceUpsertedSubscription({
 *   variables: {
 *      channelId: // value for 'channelId'
 *   },
 * });
 */
export function useWorkspaceUpsertedSubscription(baseOptions: Apollo.SubscriptionHookOptions<WorkspaceUpsertedSubscription, WorkspaceUpsertedSubscriptionVariables> & ({ variables: WorkspaceUpsertedSubscriptionVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useSubscription<WorkspaceUpsertedSubscription, WorkspaceUpsertedSubscriptionVariables>(WorkspaceUpsertedDocument, options);
      }
export type WorkspaceUpsertedSubscriptionHookResult = ReturnType<typeof useWorkspaceUpsertedSubscription>;
export type WorkspaceUpsertedSubscriptionResult = Apollo.SubscriptionResult<WorkspaceUpsertedSubscription>;
export const WorkspaceDeletedDocument = gql`
    subscription WorkspaceDeleted($channelId: ID!) {
  workspaceDeleted(channelId: $channelId) {
    channelId
    workspaceId
  }
}
    `;

/**
 * __useWorkspaceDeletedSubscription__
 *
 * To run a query within a React component, call `useWorkspaceDeletedSubscription` and pass it any options that fit your needs.
 * When your component renders, `useWorkspaceDeletedSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useWorkspaceDeletedSubscription({
 *   variables: {
 *      channelId: // value for 'channelId'
 *   },
 * });
 */
export function useWorkspaceDeletedSubscription(baseOptions: Apollo.SubscriptionHookOptions<WorkspaceDeletedSubscription, WorkspaceDeletedSubscriptionVariables> & ({ variables: WorkspaceDeletedSubscriptionVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useSubscription<WorkspaceDeletedSubscription, WorkspaceDeletedSubscriptionVariables>(WorkspaceDeletedDocument, options);
      }
export type WorkspaceDeletedSubscriptionHookResult = ReturnType<typeof useWorkspaceDeletedSubscription>;
export type WorkspaceDeletedSubscriptionResult = Apollo.SubscriptionResult<WorkspaceDeletedSubscription>;
export const SessionEventCreatedDocument = gql`
    subscription SessionEventCreated($channelId: ID!) {
  sessionEventCreated(channelId: $channelId) {
    ...SessionEventPayloadFields
  }
}
    ${SessionEventPayloadFieldsFragmentDoc}`;

/**
 * __useSessionEventCreatedSubscription__
 *
 * To run a query within a React component, call `useSessionEventCreatedSubscription` and pass it any options that fit your needs.
 * When your component renders, `useSessionEventCreatedSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useSessionEventCreatedSubscription({
 *   variables: {
 *      channelId: // value for 'channelId'
 *   },
 * });
 */
export function useSessionEventCreatedSubscription(baseOptions: Apollo.SubscriptionHookOptions<SessionEventCreatedSubscription, SessionEventCreatedSubscriptionVariables> & ({ variables: SessionEventCreatedSubscriptionVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useSubscription<SessionEventCreatedSubscription, SessionEventCreatedSubscriptionVariables>(SessionEventCreatedDocument, options);
      }
export type SessionEventCreatedSubscriptionHookResult = ReturnType<typeof useSessionEventCreatedSubscription>;
export type SessionEventCreatedSubscriptionResult = Apollo.SubscriptionResult<SessionEventCreatedSubscription>;
export const SessionEventUpdatedDocument = gql`
    subscription SessionEventUpdated($channelId: ID!) {
  sessionEventUpdated(channelId: $channelId) {
    ...SessionEventPayloadFields
  }
}
    ${SessionEventPayloadFieldsFragmentDoc}`;

/**
 * __useSessionEventUpdatedSubscription__
 *
 * To run a query within a React component, call `useSessionEventUpdatedSubscription` and pass it any options that fit your needs.
 * When your component renders, `useSessionEventUpdatedSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useSessionEventUpdatedSubscription({
 *   variables: {
 *      channelId: // value for 'channelId'
 *   },
 * });
 */
export function useSessionEventUpdatedSubscription(baseOptions: Apollo.SubscriptionHookOptions<SessionEventUpdatedSubscription, SessionEventUpdatedSubscriptionVariables> & ({ variables: SessionEventUpdatedSubscriptionVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useSubscription<SessionEventUpdatedSubscription, SessionEventUpdatedSubscriptionVariables>(SessionEventUpdatedDocument, options);
      }
export type SessionEventUpdatedSubscriptionHookResult = ReturnType<typeof useSessionEventUpdatedSubscription>;
export type SessionEventUpdatedSubscriptionResult = Apollo.SubscriptionResult<SessionEventUpdatedSubscription>;
export const TicketReadyToRunDocument = gql`
    subscription TicketReadyToRun($channelId: ID!) {
  ticketReadyToRun(channelId: $channelId) {
    channelId
    workspaceId
    runConfig
  }
}
    `;

/**
 * __useTicketReadyToRunSubscription__
 *
 * To run a query within a React component, call `useTicketReadyToRunSubscription` and pass it any options that fit your needs.
 * When your component renders, `useTicketReadyToRunSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useTicketReadyToRunSubscription({
 *   variables: {
 *      channelId: // value for 'channelId'
 *   },
 * });
 */
export function useTicketReadyToRunSubscription(baseOptions: Apollo.SubscriptionHookOptions<TicketReadyToRunSubscription, TicketReadyToRunSubscriptionVariables> & ({ variables: TicketReadyToRunSubscriptionVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useSubscription<TicketReadyToRunSubscription, TicketReadyToRunSubscriptionVariables>(TicketReadyToRunDocument, options);
      }
export type TicketReadyToRunSubscriptionHookResult = ReturnType<typeof useTicketReadyToRunSubscription>;
export type TicketReadyToRunSubscriptionResult = Apollo.SubscriptionResult<TicketReadyToRunSubscription>;
export const TicketReadyForReviewDocument = gql`
    subscription TicketReadyForReview($channelId: ID!) {
  ticketReadyForReview(channelId: $channelId) {
    channelId
    workspaceId
    runConfig
  }
}
    `;

/**
 * __useTicketReadyForReviewSubscription__
 *
 * To run a query within a React component, call `useTicketReadyForReviewSubscription` and pass it any options that fit your needs.
 * When your component renders, `useTicketReadyForReviewSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useTicketReadyForReviewSubscription({
 *   variables: {
 *      channelId: // value for 'channelId'
 *   },
 * });
 */
export function useTicketReadyForReviewSubscription(baseOptions: Apollo.SubscriptionHookOptions<TicketReadyForReviewSubscription, TicketReadyForReviewSubscriptionVariables> & ({ variables: TicketReadyForReviewSubscriptionVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useSubscription<TicketReadyForReviewSubscription, TicketReadyForReviewSubscriptionVariables>(TicketReadyForReviewDocument, options);
      }
export type TicketReadyForReviewSubscriptionHookResult = ReturnType<typeof useTicketReadyForReviewSubscription>;
export type TicketReadyForReviewSubscriptionResult = Apollo.SubscriptionResult<TicketReadyForReviewSubscription>;
export const TicketUpsertedDocument = gql`
    subscription TicketUpserted($channelId: ID!) {
  ticketUpserted(channelId: $channelId) {
    channelId
    columnSlug
    ticket {
      id
      workspaceId
      columnId
      title
      description
      solutionApproach
      status
      metadata
      sortOrder
      createdAt
      updatedAt
      workspace {
        id
        userId
        branch
        prUrl
        status
        createdAt
        attachments {
          id
          key
          filename
          contentType
          url
        }
      }
    }
  }
}
    `;

/**
 * __useTicketUpsertedSubscription__
 *
 * To run a query within a React component, call `useTicketUpsertedSubscription` and pass it any options that fit your needs.
 * When your component renders, `useTicketUpsertedSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useTicketUpsertedSubscription({
 *   variables: {
 *      channelId: // value for 'channelId'
 *   },
 * });
 */
export function useTicketUpsertedSubscription(baseOptions: Apollo.SubscriptionHookOptions<TicketUpsertedSubscription, TicketUpsertedSubscriptionVariables> & ({ variables: TicketUpsertedSubscriptionVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useSubscription<TicketUpsertedSubscription, TicketUpsertedSubscriptionVariables>(TicketUpsertedDocument, options);
      }
export type TicketUpsertedSubscriptionHookResult = ReturnType<typeof useTicketUpsertedSubscription>;
export type TicketUpsertedSubscriptionResult = Apollo.SubscriptionResult<TicketUpsertedSubscription>;