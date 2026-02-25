import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type ThreadsQueryVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  messageId: Types.Scalars['ID']['input'];
}>;


export type ThreadsQuery = { __typename?: 'Query', threads: Array<{ __typename?: 'Thread', id: string, messageId: string, createdAt: string, eventCount: number }> };

export type ThreadEventsQueryVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  messageId: Types.Scalars['ID']['input'];
  threadId: Types.Scalars['ID']['input'];
  limit?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  offset?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  after?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;


export type ThreadEventsQuery = { __typename?: 'Query', threadEvents: { __typename?: 'EventConnection', total: number, limit: number, offset: number, events: Array<{ __typename?: 'Event', id: string, sessionId: string, hookEventName: string, timestamp: string, toolName?: string | null, toolInput?: unknown | null, toolResponse?: unknown | null, toolUseId?: string | null, stopHookActive?: boolean | null, lastAssistantMessage?: string | null, rawPayload: unknown, threadId: string, importance: string }> } };


export const ThreadsDocument = gql`
    query Threads($channelId: ID!, $messageId: ID!) {
  threads(channelId: $channelId, messageId: $messageId) {
    id
    messageId
    createdAt
    eventCount
  }
}
    `;

/**
 * __useThreadsQuery__
 *
 * To run a query within a React component, call `useThreadsQuery` and pass it any options that fit your needs.
 * When your component renders, `useThreadsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useThreadsQuery({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      messageId: // value for 'messageId'
 *   },
 * });
 */
export function useThreadsQuery(baseOptions: Apollo.QueryHookOptions<ThreadsQuery, ThreadsQueryVariables> & ({ variables: ThreadsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<ThreadsQuery, ThreadsQueryVariables>(ThreadsDocument, options);
      }
export function useThreadsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<ThreadsQuery, ThreadsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<ThreadsQuery, ThreadsQueryVariables>(ThreadsDocument, options);
        }
// @ts-ignore
export function useThreadsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<ThreadsQuery, ThreadsQueryVariables>): Apollo.UseSuspenseQueryResult<ThreadsQuery, ThreadsQueryVariables>;
export function useThreadsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<ThreadsQuery, ThreadsQueryVariables>): Apollo.UseSuspenseQueryResult<ThreadsQuery | undefined, ThreadsQueryVariables>;
export function useThreadsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<ThreadsQuery, ThreadsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<ThreadsQuery, ThreadsQueryVariables>(ThreadsDocument, options);
        }
export type ThreadsQueryHookResult = ReturnType<typeof useThreadsQuery>;
export type ThreadsLazyQueryHookResult = ReturnType<typeof useThreadsLazyQuery>;
export type ThreadsSuspenseQueryHookResult = ReturnType<typeof useThreadsSuspenseQuery>;
export type ThreadsQueryResult = Apollo.QueryResult<ThreadsQuery, ThreadsQueryVariables>;
export const ThreadEventsDocument = gql`
    query ThreadEvents($channelId: ID!, $messageId: ID!, $threadId: ID!, $limit: Int, $offset: Int, $after: String) {
  threadEvents(
    channelId: $channelId
    messageId: $messageId
    threadId: $threadId
    limit: $limit
    offset: $offset
    after: $after
  ) {
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

/**
 * __useThreadEventsQuery__
 *
 * To run a query within a React component, call `useThreadEventsQuery` and pass it any options that fit your needs.
 * When your component renders, `useThreadEventsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useThreadEventsQuery({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      messageId: // value for 'messageId'
 *      threadId: // value for 'threadId'
 *      limit: // value for 'limit'
 *      offset: // value for 'offset'
 *      after: // value for 'after'
 *   },
 * });
 */
export function useThreadEventsQuery(baseOptions: Apollo.QueryHookOptions<ThreadEventsQuery, ThreadEventsQueryVariables> & ({ variables: ThreadEventsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<ThreadEventsQuery, ThreadEventsQueryVariables>(ThreadEventsDocument, options);
      }
export function useThreadEventsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<ThreadEventsQuery, ThreadEventsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<ThreadEventsQuery, ThreadEventsQueryVariables>(ThreadEventsDocument, options);
        }
// @ts-ignore
export function useThreadEventsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<ThreadEventsQuery, ThreadEventsQueryVariables>): Apollo.UseSuspenseQueryResult<ThreadEventsQuery, ThreadEventsQueryVariables>;
export function useThreadEventsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<ThreadEventsQuery, ThreadEventsQueryVariables>): Apollo.UseSuspenseQueryResult<ThreadEventsQuery | undefined, ThreadEventsQueryVariables>;
export function useThreadEventsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<ThreadEventsQuery, ThreadEventsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<ThreadEventsQuery, ThreadEventsQueryVariables>(ThreadEventsDocument, options);
        }
export type ThreadEventsQueryHookResult = ReturnType<typeof useThreadEventsQuery>;
export type ThreadEventsLazyQueryHookResult = ReturnType<typeof useThreadEventsLazyQuery>;
export type ThreadEventsSuspenseQueryHookResult = ReturnType<typeof useThreadEventsSuspenseQuery>;
export type ThreadEventsQueryResult = Apollo.QueryResult<ThreadEventsQuery, ThreadEventsQueryVariables>;