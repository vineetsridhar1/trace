import * as Types from '../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import { MessageFieldsFragmentDoc } from '../graphql/__generated__/fragments.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type UpdateMessageStatusMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  messageId: Types.Scalars['ID']['input'];
  status: Types.Scalars['String']['input'];
}>;


export type UpdateMessageStatusMutation = { __typename?: 'Mutation', updateMessageStatus: { __typename?: 'Message', id: string, channelId: string, sessionId: string, preview?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, claudeSessionId?: string | null, createdAt: string, threadCount: number, queuedRunConfig?: unknown | null, session?: { __typename?: 'MessageSession', sessionId: string, cwd?: string | null, status: string } | null } };

export type DeleteMessageMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  messageId: Types.Scalars['ID']['input'];
}>;


export type DeleteMessageMutation = { __typename?: 'Mutation', deleteMessage: boolean };

export type SetTicketDependenciesMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  messageId: Types.Scalars['ID']['input'];
  dependsOnMessageIds: Array<Types.Scalars['ID']['input']> | Types.Scalars['ID']['input'];
  runConfig: Types.Scalars['JSON']['input'];
}>;


export type SetTicketDependenciesMutation = { __typename?: 'Mutation', setTicketDependencies: { __typename?: 'Message', id: string, channelId: string, sessionId: string, preview?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, claudeSessionId?: string | null, createdAt: string, threadCount: number, queuedRunConfig?: unknown | null, session?: { __typename?: 'MessageSession', sessionId: string, cwd?: string | null, status: string } | null } };


export const UpdateMessageStatusDocument = gql`
    mutation UpdateMessageStatus($channelId: ID!, $messageId: ID!, $status: String!) {
  updateMessageStatus(
    channelId: $channelId
    messageId: $messageId
    status: $status
  ) {
    ...MessageFields
  }
}
    ${MessageFieldsFragmentDoc}`;
export type UpdateMessageStatusMutationFn = Apollo.MutationFunction<UpdateMessageStatusMutation, UpdateMessageStatusMutationVariables>;

/**
 * __useUpdateMessageStatusMutation__
 *
 * To run a mutation, you first call `useUpdateMessageStatusMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateMessageStatusMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateMessageStatusMutation, { data, loading, error }] = useUpdateMessageStatusMutation({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      messageId: // value for 'messageId'
 *      status: // value for 'status'
 *   },
 * });
 */
export function useUpdateMessageStatusMutation(baseOptions?: Apollo.MutationHookOptions<UpdateMessageStatusMutation, UpdateMessageStatusMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateMessageStatusMutation, UpdateMessageStatusMutationVariables>(UpdateMessageStatusDocument, options);
      }
export type UpdateMessageStatusMutationHookResult = ReturnType<typeof useUpdateMessageStatusMutation>;
export type UpdateMessageStatusMutationResult = Apollo.MutationResult<UpdateMessageStatusMutation>;
export type UpdateMessageStatusMutationOptions = Apollo.BaseMutationOptions<UpdateMessageStatusMutation, UpdateMessageStatusMutationVariables>;
export const DeleteMessageDocument = gql`
    mutation DeleteMessage($channelId: ID!, $messageId: ID!) {
  deleteMessage(channelId: $channelId, messageId: $messageId)
}
    `;
export type DeleteMessageMutationFn = Apollo.MutationFunction<DeleteMessageMutation, DeleteMessageMutationVariables>;

/**
 * __useDeleteMessageMutation__
 *
 * To run a mutation, you first call `useDeleteMessageMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteMessageMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteMessageMutation, { data, loading, error }] = useDeleteMessageMutation({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      messageId: // value for 'messageId'
 *   },
 * });
 */
export function useDeleteMessageMutation(baseOptions?: Apollo.MutationHookOptions<DeleteMessageMutation, DeleteMessageMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteMessageMutation, DeleteMessageMutationVariables>(DeleteMessageDocument, options);
      }
export type DeleteMessageMutationHookResult = ReturnType<typeof useDeleteMessageMutation>;
export type DeleteMessageMutationResult = Apollo.MutationResult<DeleteMessageMutation>;
export type DeleteMessageMutationOptions = Apollo.BaseMutationOptions<DeleteMessageMutation, DeleteMessageMutationVariables>;
export const SetTicketDependenciesDocument = gql`
    mutation SetTicketDependencies($channelId: ID!, $messageId: ID!, $dependsOnMessageIds: [ID!]!, $runConfig: JSON!) {
  setTicketDependencies(
    channelId: $channelId
    messageId: $messageId
    dependsOnMessageIds: $dependsOnMessageIds
    runConfig: $runConfig
  ) {
    ...MessageFields
  }
}
    ${MessageFieldsFragmentDoc}`;
export type SetTicketDependenciesMutationFn = Apollo.MutationFunction<SetTicketDependenciesMutation, SetTicketDependenciesMutationVariables>;

/**
 * __useSetTicketDependenciesMutation__
 *
 * To run a mutation, you first call `useSetTicketDependenciesMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSetTicketDependenciesMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [setTicketDependenciesMutation, { data, loading, error }] = useSetTicketDependenciesMutation({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      messageId: // value for 'messageId'
 *      dependsOnMessageIds: // value for 'dependsOnMessageIds'
 *      runConfig: // value for 'runConfig'
 *   },
 * });
 */
export function useSetTicketDependenciesMutation(baseOptions?: Apollo.MutationHookOptions<SetTicketDependenciesMutation, SetTicketDependenciesMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<SetTicketDependenciesMutation, SetTicketDependenciesMutationVariables>(SetTicketDependenciesDocument, options);
      }
export type SetTicketDependenciesMutationHookResult = ReturnType<typeof useSetTicketDependenciesMutation>;
export type SetTicketDependenciesMutationResult = Apollo.MutationResult<SetTicketDependenciesMutation>;
export type SetTicketDependenciesMutationOptions = Apollo.BaseMutationOptions<SetTicketDependenciesMutation, SetTicketDependenciesMutationVariables>;
export type RemoveTicketDependencyMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  messageId: Types.Scalars['ID']['input'];
  dependsOnMessageId: Types.Scalars['ID']['input'];
}>;


export type RemoveTicketDependencyMutation = { __typename?: 'Mutation', removeTicketDependency: boolean };

export const RemoveTicketDependencyDocument = gql`
    mutation RemoveTicketDependency($channelId: ID!, $messageId: ID!, $dependsOnMessageId: ID!) {
  removeTicketDependency(
    channelId: $channelId
    messageId: $messageId
    dependsOnMessageId: $dependsOnMessageId
  )
}
    `;
export type RemoveTicketDependencyMutationFn = Apollo.MutationFunction<RemoveTicketDependencyMutation, RemoveTicketDependencyMutationVariables>;
export function useRemoveTicketDependencyMutation(baseOptions?: Apollo.MutationHookOptions<RemoveTicketDependencyMutation, RemoveTicketDependencyMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<RemoveTicketDependencyMutation, RemoveTicketDependencyMutationVariables>(RemoveTicketDependencyDocument, options);
      }
export type RemoveTicketDependencyMutationHookResult = ReturnType<typeof useRemoveTicketDependencyMutation>;
export type RemoveTicketDependencyMutationResult = Apollo.MutationResult<RemoveTicketDependencyMutation>;
export type RemoveTicketDependencyMutationOptions = Apollo.BaseMutationOptions<RemoveTicketDependencyMutation, RemoveTicketDependencyMutationVariables>;
export type UpdateQueuedRunConfigMutationVariables = Types.Exact<{
  messageId: Types.Scalars['ID']['input'];
  runConfig: Types.Scalars['JSON']['input'];
}>;


export type UpdateQueuedRunConfigMutation = { __typename?: 'Mutation', updateQueuedRunConfig: boolean };

export const UpdateQueuedRunConfigDocument = gql`
    mutation UpdateQueuedRunConfig($messageId: ID!, $runConfig: JSON!) {
  updateQueuedRunConfig(messageId: $messageId, runConfig: $runConfig)
}
    `;
export type UpdateQueuedRunConfigMutationFn = Apollo.MutationFunction<UpdateQueuedRunConfigMutation, UpdateQueuedRunConfigMutationVariables>;
export function useUpdateQueuedRunConfigMutation(baseOptions?: Apollo.MutationHookOptions<UpdateQueuedRunConfigMutation, UpdateQueuedRunConfigMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateQueuedRunConfigMutation, UpdateQueuedRunConfigMutationVariables>(UpdateQueuedRunConfigDocument, options);
      }
export type UpdateQueuedRunConfigMutationHookResult = ReturnType<typeof useUpdateQueuedRunConfigMutation>;
export type UpdateQueuedRunConfigMutationResult = Apollo.MutationResult<UpdateQueuedRunConfigMutation>;
export type UpdateQueuedRunConfigMutationOptions = Apollo.BaseMutationOptions<UpdateQueuedRunConfigMutation, UpdateQueuedRunConfigMutationVariables>;