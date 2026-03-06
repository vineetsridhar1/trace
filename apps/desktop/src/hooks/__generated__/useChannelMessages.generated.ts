import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type ChannelMessagesQueryVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  limit?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  offset?: Types.InputMaybe<Types.Scalars['Int']['input']>;
}>;


export type ChannelMessagesQuery = { __typename?: 'Query', channelMessages: { __typename?: 'ChannelMessageConnection', total: number, limit: number, offset: number, messages: Array<{ __typename?: 'ChannelMessage', id: string, channelId: string, content: string, createdAt: string, author: { __typename?: 'ChannelMessageAuthor', id: string, name: string, avatarUrl?: string | null } }> } };

export type SendChannelMessageMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  content: Types.Scalars['String']['input'];
}>;


export type SendChannelMessageMutation = { __typename?: 'Mutation', sendChannelMessage: { __typename?: 'ChannelMessage', id: string, channelId: string, content: string, createdAt: string, author: { __typename?: 'ChannelMessageAuthor', id: string, name: string, avatarUrl?: string | null } } };

export type ChannelMessageCreatedSubscriptionVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
}>;


export type ChannelMessageCreatedSubscription = { __typename?: 'Subscription', channelMessageCreated: { __typename?: 'ChannelMessage', id: string, channelId: string, content: string, createdAt: string, author: { __typename?: 'ChannelMessageAuthor', id: string, name: string, avatarUrl?: string | null } } };


export const ChannelMessagesDocument = gql`
    query ChannelMessages($channelId: ID!, $limit: Int, $offset: Int) {
  channelMessages(channelId: $channelId, limit: $limit, offset: $offset) {
    messages {
      id
      channelId
      content
      createdAt
      author {
        id
        name
        avatarUrl
      }
    }
    total
    limit
    offset
  }
}
    `;

/**
 * __useChannelMessagesQuery__
 *
 * To run a query within a React component, call `useChannelMessagesQuery` and pass it any options that fit your needs.
 * When your component renders, `useChannelMessagesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useChannelMessagesQuery({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      limit: // value for 'limit'
 *      offset: // value for 'offset'
 *   },
 * });
 */
export function useChannelMessagesQuery(baseOptions: Apollo.QueryHookOptions<ChannelMessagesQuery, ChannelMessagesQueryVariables> & ({ variables: ChannelMessagesQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<ChannelMessagesQuery, ChannelMessagesQueryVariables>(ChannelMessagesDocument, options);
      }
export function useChannelMessagesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<ChannelMessagesQuery, ChannelMessagesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<ChannelMessagesQuery, ChannelMessagesQueryVariables>(ChannelMessagesDocument, options);
        }
// @ts-ignore
export function useChannelMessagesSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<ChannelMessagesQuery, ChannelMessagesQueryVariables>): Apollo.UseSuspenseQueryResult<ChannelMessagesQuery, ChannelMessagesQueryVariables>;
export function useChannelMessagesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<ChannelMessagesQuery, ChannelMessagesQueryVariables>): Apollo.UseSuspenseQueryResult<ChannelMessagesQuery | undefined, ChannelMessagesQueryVariables>;
export function useChannelMessagesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<ChannelMessagesQuery, ChannelMessagesQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<ChannelMessagesQuery, ChannelMessagesQueryVariables>(ChannelMessagesDocument, options);
        }
export type ChannelMessagesQueryHookResult = ReturnType<typeof useChannelMessagesQuery>;
export type ChannelMessagesLazyQueryHookResult = ReturnType<typeof useChannelMessagesLazyQuery>;
export type ChannelMessagesSuspenseQueryHookResult = ReturnType<typeof useChannelMessagesSuspenseQuery>;
export type ChannelMessagesQueryResult = Apollo.QueryResult<ChannelMessagesQuery, ChannelMessagesQueryVariables>;
export const SendChannelMessageDocument = gql`
    mutation SendChannelMessage($channelId: ID!, $content: String!) {
  sendChannelMessage(channelId: $channelId, content: $content) {
    id
    channelId
    content
    createdAt
    author {
      id
      name
      avatarUrl
    }
  }
}
    `;
export type SendChannelMessageMutationFn = Apollo.MutationFunction<SendChannelMessageMutation, SendChannelMessageMutationVariables>;

/**
 * __useSendChannelMessageMutation__
 *
 * To run a mutation, you first call `useSendChannelMessageMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSendChannelMessageMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [sendChannelMessageMutation, { data, loading, error }] = useSendChannelMessageMutation({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      content: // value for 'content'
 *   },
 * });
 */
export function useSendChannelMessageMutation(baseOptions?: Apollo.MutationHookOptions<SendChannelMessageMutation, SendChannelMessageMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<SendChannelMessageMutation, SendChannelMessageMutationVariables>(SendChannelMessageDocument, options);
      }
export type SendChannelMessageMutationHookResult = ReturnType<typeof useSendChannelMessageMutation>;
export type SendChannelMessageMutationResult = Apollo.MutationResult<SendChannelMessageMutation>;
export type SendChannelMessageMutationOptions = Apollo.BaseMutationOptions<SendChannelMessageMutation, SendChannelMessageMutationVariables>;
export const ChannelMessageCreatedDocument = gql`
    subscription ChannelMessageCreated($channelId: ID!) {
  channelMessageCreated(channelId: $channelId) {
    id
    channelId
    content
    createdAt
    author {
      id
      name
      avatarUrl
    }
  }
}
    `;

/**
 * __useChannelMessageCreatedSubscription__
 *
 * To run a query within a React component, call `useChannelMessageCreatedSubscription` and pass it any options that fit your needs.
 * When your component renders, `useChannelMessageCreatedSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useChannelMessageCreatedSubscription({
 *   variables: {
 *      channelId: // value for 'channelId'
 *   },
 * });
 */
export function useChannelMessageCreatedSubscription(baseOptions: Apollo.SubscriptionHookOptions<ChannelMessageCreatedSubscription, ChannelMessageCreatedSubscriptionVariables> & ({ variables: ChannelMessageCreatedSubscriptionVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useSubscription<ChannelMessageCreatedSubscription, ChannelMessageCreatedSubscriptionVariables>(ChannelMessageCreatedDocument, options);
      }
export type ChannelMessageCreatedSubscriptionHookResult = ReturnType<typeof useChannelMessageCreatedSubscription>;
export type ChannelMessageCreatedSubscriptionResult = Apollo.SubscriptionResult<ChannelMessageCreatedSubscription>;