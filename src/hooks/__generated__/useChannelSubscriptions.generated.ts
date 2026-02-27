import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import { MessageFieldsFragmentDoc, ThreadEventPayloadFieldsFragmentDoc } from '../../graphql/__generated__/fragments.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type MessageUpsertedSubscriptionVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
}>;


export type MessageUpsertedSubscription = { __typename?: 'Subscription', messageUpserted: { __typename?: 'Message', id: string, channelId: string, sessionId: string, preview?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, claudeSessionId?: string | null, createdAt: string, threadCount: number, queuedRunConfig?: unknown | null, session?: { __typename?: 'MessageSession', sessionId: string, cwd?: string | null, status: string } | null } };

export type MessageDeletedSubscriptionVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
}>;


export type MessageDeletedSubscription = { __typename?: 'Subscription', messageDeleted: { __typename?: 'MessageDeletedPayload', channelId: string, messageId: string } };

export type ThreadEventCreatedSubscriptionVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
}>;


export type ThreadEventCreatedSubscription = { __typename?: 'Subscription', threadEventCreated: { __typename?: 'ThreadEventPayload', channelId: string, messageId: string, threadId: string, event: { __typename?: 'Event', id: string, sessionId: string, hookEventName: string, timestamp: string, toolName?: string | null, toolInput?: unknown | null, toolResponse?: unknown | null, toolUseId?: string | null, stopHookActive?: boolean | null, lastAssistantMessage?: string | null, rawPayload: unknown, threadId: string, importance: string } } };

export type ThreadEventUpdatedSubscriptionVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
}>;


export type ThreadEventUpdatedSubscription = { __typename?: 'Subscription', threadEventUpdated: { __typename?: 'ThreadEventPayload', channelId: string, messageId: string, threadId: string, event: { __typename?: 'Event', id: string, sessionId: string, hookEventName: string, timestamp: string, toolName?: string | null, toolInput?: unknown | null, toolResponse?: unknown | null, toolUseId?: string | null, stopHookActive?: boolean | null, lastAssistantMessage?: string | null, rawPayload: unknown, threadId: string, importance: string } } };

export type TicketReadyToRunSubscriptionVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
}>;


export type TicketReadyToRunSubscription = { __typename?: 'Subscription', ticketReadyToRun: { __typename?: 'TicketReadyToRunPayload', channelId: string, messageId: string, runConfig: unknown } };

export type TicketUpsertedSubscriptionVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
}>;


export type TicketUpsertedSubscription = { __typename?: 'Subscription', ticketUpserted: { __typename?: 'TicketUpsertPayload', channelId: string, columnSlug: string, ticket: { __typename?: 'Ticket', id: string, messageId: string, columnId: string, title: string, description?: string | null, solutionApproach?: string | null, status: string, metadata?: unknown | null, sortOrder: number, createdAt: string, updatedAt: string, message?: { __typename?: 'TicketMessage', id: string, branch?: string | null, status: string, createdAt: string, attachments: Array<{ __typename?: 'TicketAttachment', id: string, key: string, filename: string, contentType: string, url: string }> } | null } } };


export const MessageUpsertedDocument = gql`
    subscription MessageUpserted($channelId: ID!) {
  messageUpserted(channelId: $channelId) {
    ...MessageFields
  }
}
    ${MessageFieldsFragmentDoc}`;

/**
 * __useMessageUpsertedSubscription__
 *
 * To run a query within a React component, call `useMessageUpsertedSubscription` and pass it any options that fit your needs.
 * When your component renders, `useMessageUpsertedSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useMessageUpsertedSubscription({
 *   variables: {
 *      channelId: // value for 'channelId'
 *   },
 * });
 */
export function useMessageUpsertedSubscription(baseOptions: Apollo.SubscriptionHookOptions<MessageUpsertedSubscription, MessageUpsertedSubscriptionVariables> & ({ variables: MessageUpsertedSubscriptionVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useSubscription<MessageUpsertedSubscription, MessageUpsertedSubscriptionVariables>(MessageUpsertedDocument, options);
      }
export type MessageUpsertedSubscriptionHookResult = ReturnType<typeof useMessageUpsertedSubscription>;
export type MessageUpsertedSubscriptionResult = Apollo.SubscriptionResult<MessageUpsertedSubscription>;
export const MessageDeletedDocument = gql`
    subscription MessageDeleted($channelId: ID!) {
  messageDeleted(channelId: $channelId) {
    channelId
    messageId
  }
}
    `;

/**
 * __useMessageDeletedSubscription__
 *
 * To run a query within a React component, call `useMessageDeletedSubscription` and pass it any options that fit your needs.
 * When your component renders, `useMessageDeletedSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useMessageDeletedSubscription({
 *   variables: {
 *      channelId: // value for 'channelId'
 *   },
 * });
 */
export function useMessageDeletedSubscription(baseOptions: Apollo.SubscriptionHookOptions<MessageDeletedSubscription, MessageDeletedSubscriptionVariables> & ({ variables: MessageDeletedSubscriptionVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useSubscription<MessageDeletedSubscription, MessageDeletedSubscriptionVariables>(MessageDeletedDocument, options);
      }
export type MessageDeletedSubscriptionHookResult = ReturnType<typeof useMessageDeletedSubscription>;
export type MessageDeletedSubscriptionResult = Apollo.SubscriptionResult<MessageDeletedSubscription>;
export const ThreadEventCreatedDocument = gql`
    subscription ThreadEventCreated($channelId: ID!) {
  threadEventCreated(channelId: $channelId) {
    ...ThreadEventPayloadFields
  }
}
    ${ThreadEventPayloadFieldsFragmentDoc}`;

/**
 * __useThreadEventCreatedSubscription__
 *
 * To run a query within a React component, call `useThreadEventCreatedSubscription` and pass it any options that fit your needs.
 * When your component renders, `useThreadEventCreatedSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useThreadEventCreatedSubscription({
 *   variables: {
 *      channelId: // value for 'channelId'
 *   },
 * });
 */
export function useThreadEventCreatedSubscription(baseOptions: Apollo.SubscriptionHookOptions<ThreadEventCreatedSubscription, ThreadEventCreatedSubscriptionVariables> & ({ variables: ThreadEventCreatedSubscriptionVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useSubscription<ThreadEventCreatedSubscription, ThreadEventCreatedSubscriptionVariables>(ThreadEventCreatedDocument, options);
      }
export type ThreadEventCreatedSubscriptionHookResult = ReturnType<typeof useThreadEventCreatedSubscription>;
export type ThreadEventCreatedSubscriptionResult = Apollo.SubscriptionResult<ThreadEventCreatedSubscription>;
export const ThreadEventUpdatedDocument = gql`
    subscription ThreadEventUpdated($channelId: ID!) {
  threadEventUpdated(channelId: $channelId) {
    ...ThreadEventPayloadFields
  }
}
    ${ThreadEventPayloadFieldsFragmentDoc}`;

/**
 * __useThreadEventUpdatedSubscription__
 *
 * To run a query within a React component, call `useThreadEventUpdatedSubscription` and pass it any options that fit your needs.
 * When your component renders, `useThreadEventUpdatedSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useThreadEventUpdatedSubscription({
 *   variables: {
 *      channelId: // value for 'channelId'
 *   },
 * });
 */
export function useThreadEventUpdatedSubscription(baseOptions: Apollo.SubscriptionHookOptions<ThreadEventUpdatedSubscription, ThreadEventUpdatedSubscriptionVariables> & ({ variables: ThreadEventUpdatedSubscriptionVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useSubscription<ThreadEventUpdatedSubscription, ThreadEventUpdatedSubscriptionVariables>(ThreadEventUpdatedDocument, options);
      }
export type ThreadEventUpdatedSubscriptionHookResult = ReturnType<typeof useThreadEventUpdatedSubscription>;
export type ThreadEventUpdatedSubscriptionResult = Apollo.SubscriptionResult<ThreadEventUpdatedSubscription>;
export const TicketReadyToRunDocument = gql`
    subscription TicketReadyToRun($channelId: ID!) {
  ticketReadyToRun(channelId: $channelId) {
    channelId
    messageId
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
export const TicketUpsertedDocument = gql`
    subscription TicketUpserted($channelId: ID!) {
  ticketUpserted(channelId: $channelId) {
    channelId
    columnSlug
    ticket {
      id
      messageId
      columnId
      title
      description
      solutionApproach
      status
      metadata
      sortOrder
      createdAt
      updatedAt
      message {
        id
        branch
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