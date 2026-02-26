import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type AiChatMessagesQueryVariables = Types.Exact<{
  chatId: Types.Scalars['ID']['input'];
  limit?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  offset?: Types.InputMaybe<Types.Scalars['Int']['input']>;
}>;


export type AiChatMessagesQuery = { __typename?: 'Query', aiChatMessages: { __typename?: 'AiChatMessageConnection', total: number, limit: number, offset: number, messages: Array<{ __typename?: 'AiChatMessage', id: string, chatId: string, role: string, content: string, createdAt: string }> } };

export type SendAiChatMessageMutationVariables = Types.Exact<{
  chatId: Types.Scalars['ID']['input'];
  content: Types.Scalars['String']['input'];
}>;


export type SendAiChatMessageMutation = { __typename?: 'Mutation', sendAiChatMessage: { __typename?: 'AiChatMessage', id: string, chatId: string, role: string, content: string, createdAt: string } };


export const AiChatMessagesDocument = gql`
    query AiChatMessages($chatId: ID!, $limit: Int, $offset: Int) {
  aiChatMessages(chatId: $chatId, limit: $limit, offset: $offset) {
    messages {
      id
      chatId
      role
      content
      createdAt
    }
    total
    limit
    offset
  }
}
    `;

/**
 * __useAiChatMessagesQuery__
 *
 * To run a query within a React component, call `useAiChatMessagesQuery` and pass it any options that fit your needs.
 * When your component renders, `useAiChatMessagesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useAiChatMessagesQuery({
 *   variables: {
 *      chatId: // value for 'chatId'
 *      limit: // value for 'limit'
 *      offset: // value for 'offset'
 *   },
 * });
 */
export function useAiChatMessagesQuery(baseOptions: Apollo.QueryHookOptions<AiChatMessagesQuery, AiChatMessagesQueryVariables> & ({ variables: AiChatMessagesQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<AiChatMessagesQuery, AiChatMessagesQueryVariables>(AiChatMessagesDocument, options);
      }
export function useAiChatMessagesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<AiChatMessagesQuery, AiChatMessagesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<AiChatMessagesQuery, AiChatMessagesQueryVariables>(AiChatMessagesDocument, options);
        }
// @ts-ignore
export function useAiChatMessagesSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<AiChatMessagesQuery, AiChatMessagesQueryVariables>): Apollo.UseSuspenseQueryResult<AiChatMessagesQuery, AiChatMessagesQueryVariables>;
export function useAiChatMessagesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<AiChatMessagesQuery, AiChatMessagesQueryVariables>): Apollo.UseSuspenseQueryResult<AiChatMessagesQuery | undefined, AiChatMessagesQueryVariables>;
export function useAiChatMessagesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<AiChatMessagesQuery, AiChatMessagesQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<AiChatMessagesQuery, AiChatMessagesQueryVariables>(AiChatMessagesDocument, options);
        }
export type AiChatMessagesQueryHookResult = ReturnType<typeof useAiChatMessagesQuery>;
export type AiChatMessagesLazyQueryHookResult = ReturnType<typeof useAiChatMessagesLazyQuery>;
export type AiChatMessagesSuspenseQueryHookResult = ReturnType<typeof useAiChatMessagesSuspenseQuery>;
export type AiChatMessagesQueryResult = Apollo.QueryResult<AiChatMessagesQuery, AiChatMessagesQueryVariables>;
export const SendAiChatMessageDocument = gql`
    mutation SendAiChatMessage($chatId: ID!, $content: String!) {
  sendAiChatMessage(chatId: $chatId, content: $content) {
    id
    chatId
    role
    content
    createdAt
  }
}
    `;
export type SendAiChatMessageMutationFn = Apollo.MutationFunction<SendAiChatMessageMutation, SendAiChatMessageMutationVariables>;

/**
 * __useSendAiChatMessageMutation__
 *
 * To run a mutation, you first call `useSendAiChatMessageMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSendAiChatMessageMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [sendAiChatMessageMutation, { data, loading, error }] = useSendAiChatMessageMutation({
 *   variables: {
 *      chatId: // value for 'chatId'
 *      content: // value for 'content'
 *   },
 * });
 */
export function useSendAiChatMessageMutation(baseOptions?: Apollo.MutationHookOptions<SendAiChatMessageMutation, SendAiChatMessageMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<SendAiChatMessageMutation, SendAiChatMessageMutationVariables>(SendAiChatMessageDocument, options);
      }
export type SendAiChatMessageMutationHookResult = ReturnType<typeof useSendAiChatMessageMutation>;
export type SendAiChatMessageMutationResult = Apollo.MutationResult<SendAiChatMessageMutation>;
export type SendAiChatMessageMutationOptions = Apollo.BaseMutationOptions<SendAiChatMessageMutation, SendAiChatMessageMutationVariables>;