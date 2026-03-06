import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type AiChatsQueryVariables = Types.Exact<{
  serverId: Types.Scalars['ID']['input'];
}>;


export type AiChatsQuery = { __typename?: 'Query', aiChats: Array<{ __typename?: 'AiChat', id: string, serverId: string, channelId?: string | null, title: string, lastMessage?: string | null, createdAt: string, updatedAt: string }> };

export type CreateAiChatMutationVariables = Types.Exact<{
  serverId: Types.Scalars['ID']['input'];
  channelId?: Types.InputMaybe<Types.Scalars['ID']['input']>;
  title?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;


export type CreateAiChatMutation = { __typename?: 'Mutation', createAiChat: { __typename?: 'AiChat', id: string, serverId: string, channelId?: string | null, title: string, lastMessage?: string | null, createdAt: string, updatedAt: string } };

export type DeleteAiChatMutationVariables = Types.Exact<{
  id: Types.Scalars['ID']['input'];
}>;


export type DeleteAiChatMutation = { __typename?: 'Mutation', deleteAiChat: boolean };

export type RenameAiChatMutationVariables = Types.Exact<{
  id: Types.Scalars['ID']['input'];
  title: Types.Scalars['String']['input'];
}>;


export type RenameAiChatMutation = { __typename?: 'Mutation', renameAiChat: { __typename?: 'AiChat', id: string, title: string } };


export const AiChatsDocument = gql`
    query AiChats($serverId: ID!) {
  aiChats(serverId: $serverId) {
    id
    serverId
    channelId
    title
    lastMessage
    createdAt
    updatedAt
  }
}
    `;

/**
 * __useAiChatsQuery__
 *
 * To run a query within a React component, call `useAiChatsQuery` and pass it any options that fit your needs.
 * When your component renders, `useAiChatsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useAiChatsQuery({
 *   variables: {
 *      serverId: // value for 'serverId'
 *   },
 * });
 */
export function useAiChatsQuery(baseOptions: Apollo.QueryHookOptions<AiChatsQuery, AiChatsQueryVariables> & ({ variables: AiChatsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<AiChatsQuery, AiChatsQueryVariables>(AiChatsDocument, options);
      }
export function useAiChatsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<AiChatsQuery, AiChatsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<AiChatsQuery, AiChatsQueryVariables>(AiChatsDocument, options);
        }
// @ts-ignore
export function useAiChatsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<AiChatsQuery, AiChatsQueryVariables>): Apollo.UseSuspenseQueryResult<AiChatsQuery, AiChatsQueryVariables>;
export function useAiChatsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<AiChatsQuery, AiChatsQueryVariables>): Apollo.UseSuspenseQueryResult<AiChatsQuery | undefined, AiChatsQueryVariables>;
export function useAiChatsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<AiChatsQuery, AiChatsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<AiChatsQuery, AiChatsQueryVariables>(AiChatsDocument, options);
        }
export type AiChatsQueryHookResult = ReturnType<typeof useAiChatsQuery>;
export type AiChatsLazyQueryHookResult = ReturnType<typeof useAiChatsLazyQuery>;
export type AiChatsSuspenseQueryHookResult = ReturnType<typeof useAiChatsSuspenseQuery>;
export type AiChatsQueryResult = Apollo.QueryResult<AiChatsQuery, AiChatsQueryVariables>;
export const CreateAiChatDocument = gql`
    mutation CreateAiChat($serverId: ID!, $channelId: ID, $title: String) {
  createAiChat(serverId: $serverId, channelId: $channelId, title: $title) {
    id
    serverId
    channelId
    title
    lastMessage
    createdAt
    updatedAt
  }
}
    `;
export type CreateAiChatMutationFn = Apollo.MutationFunction<CreateAiChatMutation, CreateAiChatMutationVariables>;

/**
 * __useCreateAiChatMutation__
 *
 * To run a mutation, you first call `useCreateAiChatMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateAiChatMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createAiChatMutation, { data, loading, error }] = useCreateAiChatMutation({
 *   variables: {
 *      serverId: // value for 'serverId'
 *      channelId: // value for 'channelId'
 *      title: // value for 'title'
 *   },
 * });
 */
export function useCreateAiChatMutation(baseOptions?: Apollo.MutationHookOptions<CreateAiChatMutation, CreateAiChatMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateAiChatMutation, CreateAiChatMutationVariables>(CreateAiChatDocument, options);
      }
export type CreateAiChatMutationHookResult = ReturnType<typeof useCreateAiChatMutation>;
export type CreateAiChatMutationResult = Apollo.MutationResult<CreateAiChatMutation>;
export type CreateAiChatMutationOptions = Apollo.BaseMutationOptions<CreateAiChatMutation, CreateAiChatMutationVariables>;
export const DeleteAiChatDocument = gql`
    mutation DeleteAiChat($id: ID!) {
  deleteAiChat(id: $id)
}
    `;
export type DeleteAiChatMutationFn = Apollo.MutationFunction<DeleteAiChatMutation, DeleteAiChatMutationVariables>;

/**
 * __useDeleteAiChatMutation__
 *
 * To run a mutation, you first call `useDeleteAiChatMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteAiChatMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteAiChatMutation, { data, loading, error }] = useDeleteAiChatMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useDeleteAiChatMutation(baseOptions?: Apollo.MutationHookOptions<DeleteAiChatMutation, DeleteAiChatMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteAiChatMutation, DeleteAiChatMutationVariables>(DeleteAiChatDocument, options);
      }
export type DeleteAiChatMutationHookResult = ReturnType<typeof useDeleteAiChatMutation>;
export type DeleteAiChatMutationResult = Apollo.MutationResult<DeleteAiChatMutation>;
export type DeleteAiChatMutationOptions = Apollo.BaseMutationOptions<DeleteAiChatMutation, DeleteAiChatMutationVariables>;
export const RenameAiChatDocument = gql`
    mutation RenameAiChat($id: ID!, $title: String!) {
  renameAiChat(id: $id, title: $title) {
    id
    title
  }
}
    `;
export type RenameAiChatMutationFn = Apollo.MutationFunction<RenameAiChatMutation, RenameAiChatMutationVariables>;

/**
 * __useRenameAiChatMutation__
 *
 * To run a mutation, you first call `useRenameAiChatMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRenameAiChatMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [renameAiChatMutation, { data, loading, error }] = useRenameAiChatMutation({
 *   variables: {
 *      id: // value for 'id'
 *      title: // value for 'title'
 *   },
 * });
 */
export function useRenameAiChatMutation(baseOptions?: Apollo.MutationHookOptions<RenameAiChatMutation, RenameAiChatMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<RenameAiChatMutation, RenameAiChatMutationVariables>(RenameAiChatDocument, options);
      }
export type RenameAiChatMutationHookResult = ReturnType<typeof useRenameAiChatMutation>;
export type RenameAiChatMutationResult = Apollo.MutationResult<RenameAiChatMutation>;
export type RenameAiChatMutationOptions = Apollo.BaseMutationOptions<RenameAiChatMutation, RenameAiChatMutationVariables>;