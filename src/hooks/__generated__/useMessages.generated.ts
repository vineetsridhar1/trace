import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import { MessageFieldsFragmentDoc } from '../../graphql/__generated__/fragments.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type MessagesQueryVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  limit?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  offset?: Types.InputMaybe<Types.Scalars['Int']['input']>;
}>;


export type MessagesQuery = { __typename?: 'Query', messages: { __typename?: 'MessageConnection', total: number, limit: number, offset: number, messages: Array<{ __typename?: 'Message', id: string, channelId: string, sessionId: string, preview?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, claudeSessionId?: string | null, createdAt: string, threadCount: number, session?: { __typename?: 'MessageSession', sessionId: string, cwd?: string | null, status: string } | null }> } };


export const MessagesDocument = gql`
    query Messages($channelId: ID!, $limit: Int, $offset: Int) {
  messages(channelId: $channelId, limit: $limit, offset: $offset) {
    messages {
      ...MessageFields
    }
    total
    limit
    offset
  }
}
    ${MessageFieldsFragmentDoc}`;

/**
 * __useMessagesQuery__
 *
 * To run a query within a React component, call `useMessagesQuery` and pass it any options that fit your needs.
 * When your component renders, `useMessagesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useMessagesQuery({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      limit: // value for 'limit'
 *      offset: // value for 'offset'
 *   },
 * });
 */
export function useMessagesQuery(baseOptions: Apollo.QueryHookOptions<MessagesQuery, MessagesQueryVariables> & ({ variables: MessagesQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<MessagesQuery, MessagesQueryVariables>(MessagesDocument, options);
      }
export function useMessagesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<MessagesQuery, MessagesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<MessagesQuery, MessagesQueryVariables>(MessagesDocument, options);
        }
// @ts-ignore
export function useMessagesSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<MessagesQuery, MessagesQueryVariables>): Apollo.UseSuspenseQueryResult<MessagesQuery, MessagesQueryVariables>;
export function useMessagesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<MessagesQuery, MessagesQueryVariables>): Apollo.UseSuspenseQueryResult<MessagesQuery | undefined, MessagesQueryVariables>;
export function useMessagesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<MessagesQuery, MessagesQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<MessagesQuery, MessagesQueryVariables>(MessagesDocument, options);
        }
export type MessagesQueryHookResult = ReturnType<typeof useMessagesQuery>;
export type MessagesLazyQueryHookResult = ReturnType<typeof useMessagesLazyQuery>;
export type MessagesSuspenseQueryHookResult = ReturnType<typeof useMessagesSuspenseQuery>;
export type MessagesQueryResult = Apollo.QueryResult<MessagesQuery, MessagesQueryVariables>;