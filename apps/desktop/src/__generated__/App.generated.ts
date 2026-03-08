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


export type UpdateWorkspaceStatusMutation = { __typename?: 'Mutation', updateWorkspaceStatus: { __typename?: 'Workspace', id: string, channelId: string, cliSessionId: string, userId?: string | null, preview?: string | null, ticketTitle?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, agentSessionId?: string | null, agentType?: string | null, createdAt: string, sessionCount: number, queuedRunConfig?: unknown | null, isProductDoc: boolean, isOrchestrator: boolean, cliSession?: { __typename?: 'WorkspaceCliSession', sessionId: string, cwd?: string | null, status: string, permissionMode?: string | null } | null, user?: { __typename?: 'WorkspaceUser', id: string, name: string, avatarUrl?: string | null } | null } };

export type DeleteWorkspaceMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  workspaceId: Types.Scalars['ID']['input'];
}>;


export type DeleteWorkspaceMutation = { __typename?: 'Mutation', deleteWorkspace: boolean };

export type SetWorkspacePrUrlMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  workspaceId: Types.Scalars['ID']['input'];
  prUrl: Types.Scalars['String']['input'];
}>;


export type SetWorkspacePrUrlMutation = { __typename?: 'Mutation', setWorkspacePrUrl: boolean };


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
export const SetWorkspacePrUrlDocument = gql`
    mutation SetWorkspacePrUrl($channelId: ID!, $workspaceId: ID!, $prUrl: String!) {
  setWorkspacePrUrl(
    channelId: $channelId
    workspaceId: $workspaceId
    prUrl: $prUrl
  )
}
    `;
export type SetWorkspacePrUrlMutationFn = Apollo.MutationFunction<SetWorkspacePrUrlMutation, SetWorkspacePrUrlMutationVariables>;

/**
 * __useSetWorkspacePrUrlMutation__
 *
 * To run a mutation, you first call `useSetWorkspacePrUrlMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSetWorkspacePrUrlMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [setWorkspacePrUrlMutation, { data, loading, error }] = useSetWorkspacePrUrlMutation({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      workspaceId: // value for 'workspaceId'
 *      prUrl: // value for 'prUrl'
 *   },
 * });
 */
export function useSetWorkspacePrUrlMutation(baseOptions?: Apollo.MutationHookOptions<SetWorkspacePrUrlMutation, SetWorkspacePrUrlMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<SetWorkspacePrUrlMutation, SetWorkspacePrUrlMutationVariables>(SetWorkspacePrUrlDocument, options);
      }
export type SetWorkspacePrUrlMutationHookResult = ReturnType<typeof useSetWorkspacePrUrlMutation>;
export type SetWorkspacePrUrlMutationResult = Apollo.MutationResult<SetWorkspacePrUrlMutation>;
export type SetWorkspacePrUrlMutationOptions = Apollo.BaseMutationOptions<SetWorkspacePrUrlMutation, SetWorkspacePrUrlMutationVariables>;