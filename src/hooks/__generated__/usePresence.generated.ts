import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type ReportPresenceMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  workspaceId?: Types.InputMaybe<Types.Scalars['ID']['input']>;
}>;


export type ReportPresenceMutation = { __typename?: 'Mutation', reportPresence: boolean };

export type ChannelPresenceQueryVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
}>;


export type ChannelPresenceQuery = { __typename?: 'Query', channelPresence: Array<{ __typename?: 'WorkspacePresence', workspaceId: string, viewers: Array<{ __typename?: 'PresenceUser', userId: string, name: string, avatarUrl?: string | null }> }> };

export type PresenceUpdatedSubscriptionVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
}>;


export type PresenceUpdatedSubscription = { __typename?: 'Subscription', presenceUpdated: { __typename?: 'PresencePayload', channelId: string, presence: Array<{ __typename?: 'WorkspacePresence', workspaceId: string, viewers: Array<{ __typename?: 'PresenceUser', userId: string, name: string, avatarUrl?: string | null }> }> } };


export const ReportPresenceDocument = gql`
    mutation ReportPresence($channelId: ID!, $workspaceId: ID) {
  reportPresence(channelId: $channelId, workspaceId: $workspaceId)
}
    `;
export type ReportPresenceMutationFn = Apollo.MutationFunction<ReportPresenceMutation, ReportPresenceMutationVariables>;

/**
 * __useReportPresenceMutation__
 *
 * To run a mutation, you first call `useReportPresenceMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useReportPresenceMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [reportPresenceMutation, { data, loading, error }] = useReportPresenceMutation({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      workspaceId: // value for 'workspaceId'
 *   },
 * });
 */
export function useReportPresenceMutation(baseOptions?: Apollo.MutationHookOptions<ReportPresenceMutation, ReportPresenceMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ReportPresenceMutation, ReportPresenceMutationVariables>(ReportPresenceDocument, options);
      }
export type ReportPresenceMutationHookResult = ReturnType<typeof useReportPresenceMutation>;
export type ReportPresenceMutationResult = Apollo.MutationResult<ReportPresenceMutation>;
export type ReportPresenceMutationOptions = Apollo.BaseMutationOptions<ReportPresenceMutation, ReportPresenceMutationVariables>;
export const ChannelPresenceDocument = gql`
    query ChannelPresence($channelId: ID!) {
  channelPresence(channelId: $channelId) {
    workspaceId
    viewers {
      userId
      name
      avatarUrl
    }
  }
}
    `;

/**
 * __useChannelPresenceQuery__
 *
 * To run a query within a React component, call `useChannelPresenceQuery` and pass it any options that fit your needs.
 * When your component renders, `useChannelPresenceQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useChannelPresenceQuery({
 *   variables: {
 *      channelId: // value for 'channelId'
 *   },
 * });
 */
export function useChannelPresenceQuery(baseOptions: Apollo.QueryHookOptions<ChannelPresenceQuery, ChannelPresenceQueryVariables> & ({ variables: ChannelPresenceQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<ChannelPresenceQuery, ChannelPresenceQueryVariables>(ChannelPresenceDocument, options);
      }
export function useChannelPresenceLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<ChannelPresenceQuery, ChannelPresenceQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<ChannelPresenceQuery, ChannelPresenceQueryVariables>(ChannelPresenceDocument, options);
        }
// @ts-ignore
export function useChannelPresenceSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<ChannelPresenceQuery, ChannelPresenceQueryVariables>): Apollo.UseSuspenseQueryResult<ChannelPresenceQuery, ChannelPresenceQueryVariables>;
export function useChannelPresenceSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<ChannelPresenceQuery, ChannelPresenceQueryVariables>): Apollo.UseSuspenseQueryResult<ChannelPresenceQuery | undefined, ChannelPresenceQueryVariables>;
export function useChannelPresenceSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<ChannelPresenceQuery, ChannelPresenceQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<ChannelPresenceQuery, ChannelPresenceQueryVariables>(ChannelPresenceDocument, options);
        }
export type ChannelPresenceQueryHookResult = ReturnType<typeof useChannelPresenceQuery>;
export type ChannelPresenceLazyQueryHookResult = ReturnType<typeof useChannelPresenceLazyQuery>;
export type ChannelPresenceSuspenseQueryHookResult = ReturnType<typeof useChannelPresenceSuspenseQuery>;
export type ChannelPresenceQueryResult = Apollo.QueryResult<ChannelPresenceQuery, ChannelPresenceQueryVariables>;
export const PresenceUpdatedDocument = gql`
    subscription PresenceUpdated($channelId: ID!) {
  presenceUpdated(channelId: $channelId) {
    channelId
    presence {
      workspaceId
      viewers {
        userId
        name
        avatarUrl
      }
    }
  }
}
    `;

/**
 * __usePresenceUpdatedSubscription__
 *
 * To run a query within a React component, call `usePresenceUpdatedSubscription` and pass it any options that fit your needs.
 * When your component renders, `usePresenceUpdatedSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = usePresenceUpdatedSubscription({
 *   variables: {
 *      channelId: // value for 'channelId'
 *   },
 * });
 */
export function usePresenceUpdatedSubscription(baseOptions: Apollo.SubscriptionHookOptions<PresenceUpdatedSubscription, PresenceUpdatedSubscriptionVariables> & ({ variables: PresenceUpdatedSubscriptionVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useSubscription<PresenceUpdatedSubscription, PresenceUpdatedSubscriptionVariables>(PresenceUpdatedDocument, options);
      }
export type PresenceUpdatedSubscriptionHookResult = ReturnType<typeof usePresenceUpdatedSubscription>;
export type PresenceUpdatedSubscriptionResult = Apollo.SubscriptionResult<PresenceUpdatedSubscription>;