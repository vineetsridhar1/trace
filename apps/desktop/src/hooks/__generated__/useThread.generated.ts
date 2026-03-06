import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type SessionsQueryVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  workspaceId: Types.Scalars['ID']['input'];
}>;


export type SessionsQuery = { __typename?: 'Query', sessions: Array<{ __typename?: 'Session', id: string, workspaceId: string, createdAt: string, eventCount: number }> };

export type SessionEventsQueryVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  workspaceId: Types.Scalars['ID']['input'];
  sessionId: Types.Scalars['ID']['input'];
  limit?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  offset?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  after?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;


export type SessionEventsQuery = { __typename?: 'Query', sessionEvents: { __typename?: 'EventConnection', total: number, limit: number, offset: number, cliCostUsd?: number | null, events: Array<{ __typename?: 'Event', id: string, cliSessionId: string, hookEventName: string, timestamp: string, toolName?: string | null, toolInput?: unknown | null, toolResponse?: unknown | null, toolUseId?: string | null, stopHookActive?: boolean | null, lastAssistantMessage?: string | null, rawPayload: unknown, sessionId: string, importance: string }>, tokenUsage?: { __typename?: 'TokenUsage', inputTokens: number, outputTokens: number, totalTokens: number } | null } };

export type CreateSessionMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  workspaceId: Types.Scalars['ID']['input'];
}>;


export type CreateSessionMutation = { __typename?: 'Mutation', createSession: { __typename?: 'Session', id: string, workspaceId: string, createdAt: string, eventCount: number } };


export const SessionsDocument = gql`
    query Sessions($channelId: ID!, $workspaceId: ID!) {
  sessions(channelId: $channelId, workspaceId: $workspaceId) {
    id
    workspaceId
    createdAt
    eventCount
  }
}
    `;

/**
 * __useSessionsQuery__
 *
 * To run a query within a React component, call `useSessionsQuery` and pass it any options that fit your needs.
 * When your component renders, `useSessionsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useSessionsQuery({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      workspaceId: // value for 'workspaceId'
 *   },
 * });
 */
export function useSessionsQuery(baseOptions: Apollo.QueryHookOptions<SessionsQuery, SessionsQueryVariables> & ({ variables: SessionsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<SessionsQuery, SessionsQueryVariables>(SessionsDocument, options);
      }
export function useSessionsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<SessionsQuery, SessionsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<SessionsQuery, SessionsQueryVariables>(SessionsDocument, options);
        }
// @ts-ignore
export function useSessionsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<SessionsQuery, SessionsQueryVariables>): Apollo.UseSuspenseQueryResult<SessionsQuery, SessionsQueryVariables>;
export function useSessionsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<SessionsQuery, SessionsQueryVariables>): Apollo.UseSuspenseQueryResult<SessionsQuery | undefined, SessionsQueryVariables>;
export function useSessionsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<SessionsQuery, SessionsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<SessionsQuery, SessionsQueryVariables>(SessionsDocument, options);
        }
export type SessionsQueryHookResult = ReturnType<typeof useSessionsQuery>;
export type SessionsLazyQueryHookResult = ReturnType<typeof useSessionsLazyQuery>;
export type SessionsSuspenseQueryHookResult = ReturnType<typeof useSessionsSuspenseQuery>;
export type SessionsQueryResult = Apollo.QueryResult<SessionsQuery, SessionsQueryVariables>;
export const SessionEventsDocument = gql`
    query SessionEvents($channelId: ID!, $workspaceId: ID!, $sessionId: ID!, $limit: Int, $offset: Int, $after: String) {
  sessionEvents(
    channelId: $channelId
    workspaceId: $workspaceId
    sessionId: $sessionId
    limit: $limit
    offset: $offset
    after: $after
  ) {
    events {
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
    total
    limit
    offset
    tokenUsage {
      inputTokens
      outputTokens
      totalTokens
    }
    cliCostUsd
  }
}
    `;

/**
 * __useSessionEventsQuery__
 *
 * To run a query within a React component, call `useSessionEventsQuery` and pass it any options that fit your needs.
 * When your component renders, `useSessionEventsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useSessionEventsQuery({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      workspaceId: // value for 'workspaceId'
 *      sessionId: // value for 'sessionId'
 *      limit: // value for 'limit'
 *      offset: // value for 'offset'
 *      after: // value for 'after'
 *   },
 * });
 */
export function useSessionEventsQuery(baseOptions: Apollo.QueryHookOptions<SessionEventsQuery, SessionEventsQueryVariables> & ({ variables: SessionEventsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<SessionEventsQuery, SessionEventsQueryVariables>(SessionEventsDocument, options);
      }
export function useSessionEventsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<SessionEventsQuery, SessionEventsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<SessionEventsQuery, SessionEventsQueryVariables>(SessionEventsDocument, options);
        }
// @ts-ignore
export function useSessionEventsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<SessionEventsQuery, SessionEventsQueryVariables>): Apollo.UseSuspenseQueryResult<SessionEventsQuery, SessionEventsQueryVariables>;
export function useSessionEventsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<SessionEventsQuery, SessionEventsQueryVariables>): Apollo.UseSuspenseQueryResult<SessionEventsQuery | undefined, SessionEventsQueryVariables>;
export function useSessionEventsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<SessionEventsQuery, SessionEventsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<SessionEventsQuery, SessionEventsQueryVariables>(SessionEventsDocument, options);
        }
export type SessionEventsQueryHookResult = ReturnType<typeof useSessionEventsQuery>;
export type SessionEventsLazyQueryHookResult = ReturnType<typeof useSessionEventsLazyQuery>;
export type SessionEventsSuspenseQueryHookResult = ReturnType<typeof useSessionEventsSuspenseQuery>;
export type SessionEventsQueryResult = Apollo.QueryResult<SessionEventsQuery, SessionEventsQueryVariables>;
export const CreateSessionDocument = gql`
    mutation CreateSession($channelId: ID!, $workspaceId: ID!) {
  createSession(channelId: $channelId, workspaceId: $workspaceId) {
    id
    workspaceId
    createdAt
    eventCount
  }
}
    `;
export type CreateSessionMutationFn = Apollo.MutationFunction<CreateSessionMutation, CreateSessionMutationVariables>;

/**
 * __useCreateSessionMutation__
 *
 * To run a mutation, you first call `useCreateSessionMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateSessionMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createSessionMutation, { data, loading, error }] = useCreateSessionMutation({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      workspaceId: // value for 'workspaceId'
 *   },
 * });
 */
export function useCreateSessionMutation(baseOptions?: Apollo.MutationHookOptions<CreateSessionMutation, CreateSessionMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateSessionMutation, CreateSessionMutationVariables>(CreateSessionDocument, options);
      }
export type CreateSessionMutationHookResult = ReturnType<typeof useCreateSessionMutation>;
export type CreateSessionMutationResult = Apollo.MutationResult<CreateSessionMutation>;
export type CreateSessionMutationOptions = Apollo.BaseMutationOptions<CreateSessionMutation, CreateSessionMutationVariables>;