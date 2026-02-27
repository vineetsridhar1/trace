import * as Types from '../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import { WorkspaceFieldsFragmentDoc } from '../graphql/__generated__/fragments.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type UpdateWorkspaceStatusMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  workspaceId: Types.Scalars['ID']['input'];
  status: Types.Scalars['String']['input'];
}>;


export type UpdateWorkspaceStatusMutation = { __typename?: 'Mutation', updateWorkspaceStatus: { __typename?: 'Workspace', id: string, channelId: string, cliSessionId: string, userId?: string | null, preview?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, claudeSessionId?: string | null, createdAt: string, sessionCount: number, queuedRunConfig?: unknown | null, cliSession?: { __typename?: 'WorkspaceCliSession', sessionId: string, cwd?: string | null, status: string } | null, user?: { __typename?: 'WorkspaceUser', id: string, name: string, avatarUrl?: string | null } | null } };

export type DeleteWorkspaceMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  workspaceId: Types.Scalars['ID']['input'];
}>;


export type DeleteWorkspaceMutation = { __typename?: 'Mutation', deleteWorkspace: boolean };

export type SetTicketDependenciesMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  workspaceId: Types.Scalars['ID']['input'];
  dependsOnWorkspaceIds: Array<Types.Scalars['ID']['input']> | Types.Scalars['ID']['input'];
  runConfig: Types.Scalars['JSON']['input'];
}>;


export type SetTicketDependenciesMutation = { __typename?: 'Mutation', setTicketDependencies: { __typename?: 'Workspace', id: string, channelId: string, cliSessionId: string, userId?: string | null, preview?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, claudeSessionId?: string | null, createdAt: string, sessionCount: number, queuedRunConfig?: unknown | null, cliSession?: { __typename?: 'WorkspaceCliSession', sessionId: string, cwd?: string | null, status: string } | null, user?: { __typename?: 'WorkspaceUser', id: string, name: string, avatarUrl?: string | null } | null } };

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


export const UpdateWorkspaceStatusDocument = gql`
    mutation UpdateWorkspaceStatus($channelId: ID!, $workspaceId: ID!, $status: String!) {
  updateWorkspaceStatus(
    channelId: $channelId
    workspaceId: $workspaceId
    status: $status
  ) {
    ...WorkspaceFields
  }
}
    ${WorkspaceFieldsFragmentDoc}`;
export type UpdateWorkspaceStatusMutationFn = Apollo.MutationFunction<UpdateWorkspaceStatusMutation, UpdateWorkspaceStatusMutationVariables>;

/**
 * __useUpdateWorkspaceStatusMutation__
 *
 * To run a mutation, you first call `useUpdateWorkspaceStatusMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateWorkspaceStatusMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateWorkspaceStatusMutation, { data, loading, error }] = useUpdateWorkspaceStatusMutation({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      workspaceId: // value for 'workspaceId'
 *      status: // value for 'status'
 *   },
 * });
 */
export function useUpdateWorkspaceStatusMutation(baseOptions?: Apollo.MutationHookOptions<UpdateWorkspaceStatusMutation, UpdateWorkspaceStatusMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateWorkspaceStatusMutation, UpdateWorkspaceStatusMutationVariables>(UpdateWorkspaceStatusDocument, options);
      }
export type UpdateWorkspaceStatusMutationHookResult = ReturnType<typeof useUpdateWorkspaceStatusMutation>;
export type UpdateWorkspaceStatusMutationResult = Apollo.MutationResult<UpdateWorkspaceStatusMutation>;
export type UpdateWorkspaceStatusMutationOptions = Apollo.BaseMutationOptions<UpdateWorkspaceStatusMutation, UpdateWorkspaceStatusMutationVariables>;
export const DeleteWorkspaceDocument = gql`
    mutation DeleteWorkspace($channelId: ID!, $workspaceId: ID!) {
  deleteWorkspace(channelId: $channelId, workspaceId: $workspaceId)
}
    `;
export type DeleteWorkspaceMutationFn = Apollo.MutationFunction<DeleteWorkspaceMutation, DeleteWorkspaceMutationVariables>;

/**
 * __useDeleteWorkspaceMutation__
 *
 * To run a mutation, you first call `useDeleteWorkspaceMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteWorkspaceMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteWorkspaceMutation, { data, loading, error }] = useDeleteWorkspaceMutation({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      workspaceId: // value for 'workspaceId'
 *   },
 * });
 */
export function useDeleteWorkspaceMutation(baseOptions?: Apollo.MutationHookOptions<DeleteWorkspaceMutation, DeleteWorkspaceMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteWorkspaceMutation, DeleteWorkspaceMutationVariables>(DeleteWorkspaceDocument, options);
      }
export type DeleteWorkspaceMutationHookResult = ReturnType<typeof useDeleteWorkspaceMutation>;
export type DeleteWorkspaceMutationResult = Apollo.MutationResult<DeleteWorkspaceMutation>;
export type DeleteWorkspaceMutationOptions = Apollo.BaseMutationOptions<DeleteWorkspaceMutation, DeleteWorkspaceMutationVariables>;
export const SetTicketDependenciesDocument = gql`
    mutation SetTicketDependencies($channelId: ID!, $workspaceId: ID!, $dependsOnWorkspaceIds: [ID!]!, $runConfig: JSON!) {
  setTicketDependencies(
    channelId: $channelId
    workspaceId: $workspaceId
    dependsOnWorkspaceIds: $dependsOnWorkspaceIds
    runConfig: $runConfig
  ) {
    ...WorkspaceFields
  }
}
    ${WorkspaceFieldsFragmentDoc}`;
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
 *      workspaceId: // value for 'workspaceId'
 *      dependsOnWorkspaceIds: // value for 'dependsOnWorkspaceIds'
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