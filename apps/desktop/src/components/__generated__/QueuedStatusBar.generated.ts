import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type RemoveTicketDependencyMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  workspaceId: Types.Scalars['ID']['input'];
  dependsOnWorkspaceId: Types.Scalars['ID']['input'];
}>;


export type RemoveTicketDependencyMutation = { __typename?: 'Mutation', removeTicketDependency: boolean };

export type UpdateQueuedRunConfigMutationVariables = Types.Exact<{
  workspaceId: Types.Scalars['ID']['input'];
  runConfig: Types.Scalars['JSON']['input'];
}>;


export type UpdateQueuedRunConfigMutation = { __typename?: 'Mutation', updateQueuedRunConfig: boolean };


export const RemoveTicketDependencyDocument = gql`
    mutation RemoveTicketDependency($channelId: ID!, $workspaceId: ID!, $dependsOnWorkspaceId: ID!) {
  removeTicketDependency(
    channelId: $channelId
    workspaceId: $workspaceId
    dependsOnWorkspaceId: $dependsOnWorkspaceId
  )
}
    `;
export type RemoveTicketDependencyMutationFn = Apollo.MutationFunction<RemoveTicketDependencyMutation, RemoveTicketDependencyMutationVariables>;

/**
 * __useRemoveTicketDependencyMutation__
 *
 * To run a mutation, you first call `useRemoveTicketDependencyMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRemoveTicketDependencyMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [removeTicketDependencyMutation, { data, loading, error }] = useRemoveTicketDependencyMutation({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      workspaceId: // value for 'workspaceId'
 *      dependsOnWorkspaceId: // value for 'dependsOnWorkspaceId'
 *   },
 * });
 */
export function useRemoveTicketDependencyMutation(baseOptions?: Apollo.MutationHookOptions<RemoveTicketDependencyMutation, RemoveTicketDependencyMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<RemoveTicketDependencyMutation, RemoveTicketDependencyMutationVariables>(RemoveTicketDependencyDocument, options);
      }
export type RemoveTicketDependencyMutationHookResult = ReturnType<typeof useRemoveTicketDependencyMutation>;
export type RemoveTicketDependencyMutationResult = Apollo.MutationResult<RemoveTicketDependencyMutation>;
export type RemoveTicketDependencyMutationOptions = Apollo.BaseMutationOptions<RemoveTicketDependencyMutation, RemoveTicketDependencyMutationVariables>;
export const UpdateQueuedRunConfigDocument = gql`
    mutation UpdateQueuedRunConfig($workspaceId: ID!, $runConfig: JSON!) {
  updateQueuedRunConfig(workspaceId: $workspaceId, runConfig: $runConfig)
}
    `;
export type UpdateQueuedRunConfigMutationFn = Apollo.MutationFunction<UpdateQueuedRunConfigMutation, UpdateQueuedRunConfigMutationVariables>;

/**
 * __useUpdateQueuedRunConfigMutation__
 *
 * To run a mutation, you first call `useUpdateQueuedRunConfigMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateQueuedRunConfigMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateQueuedRunConfigMutation, { data, loading, error }] = useUpdateQueuedRunConfigMutation({
 *   variables: {
 *      workspaceId: // value for 'workspaceId'
 *      runConfig: // value for 'runConfig'
 *   },
 * });
 */
export function useUpdateQueuedRunConfigMutation(baseOptions?: Apollo.MutationHookOptions<UpdateQueuedRunConfigMutation, UpdateQueuedRunConfigMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateQueuedRunConfigMutation, UpdateQueuedRunConfigMutationVariables>(UpdateQueuedRunConfigDocument, options);
      }
export type UpdateQueuedRunConfigMutationHookResult = ReturnType<typeof useUpdateQueuedRunConfigMutation>;
export type UpdateQueuedRunConfigMutationResult = Apollo.MutationResult<UpdateQueuedRunConfigMutation>;
export type UpdateQueuedRunConfigMutationOptions = Apollo.BaseMutationOptions<UpdateQueuedRunConfigMutation, UpdateQueuedRunConfigMutationVariables>;