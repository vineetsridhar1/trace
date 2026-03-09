import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import { WorkspaceFieldsFragmentDoc } from '../../graphql/__generated__/fragments.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type SetTicketDependenciesMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  workspaceId: Types.Scalars['ID']['input'];
  dependsOnWorkspaceIds: Array<Types.Scalars['ID']['input']> | Types.Scalars['ID']['input'];
  runConfig: Types.Scalars['JSON']['input'];
}>;


export type SetTicketDependenciesMutation = { __typename?: 'Mutation', setTicketDependencies: { __typename?: 'Workspace', id: string, channelId: string, cliSessionId: string, userId?: string | null, preview?: string | null, ticketTitle?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, agentSessionId?: string | null, agentType?: string | null, createdAt: string, sessionCount: number, queuedRunConfig?: unknown | null, isProductDoc: boolean, cliSession?: { __typename?: 'WorkspaceCliSession', sessionId: string, cwd?: string | null, status: string, permissionMode?: string | null } | null, user?: { __typename?: 'WorkspaceUser', id: string, name: string, avatarUrl?: string | null } | null } };

export type HandoffWorkspaceMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  workspaceId: Types.Scalars['ID']['input'];
}>;


export type HandoffWorkspaceMutation = { __typename?: 'Mutation', handoffWorkspace: { __typename?: 'Workspace', id: string, channelId: string, cliSessionId: string, userId?: string | null, preview?: string | null, ticketTitle?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, agentSessionId?: string | null, agentType?: string | null, createdAt: string, sessionCount: number, queuedRunConfig?: unknown | null, isProductDoc: boolean, cliSession?: { __typename?: 'WorkspaceCliSession', sessionId: string, cwd?: string | null, status: string, permissionMode?: string | null } | null, user?: { __typename?: 'WorkspaceUser', id: string, name: string, avatarUrl?: string | null } | null } };


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
export const HandoffWorkspaceDocument = gql`
    mutation HandoffWorkspace($channelId: ID!, $workspaceId: ID!) {
  handoffWorkspace(channelId: $channelId, workspaceId: $workspaceId) {
    ...WorkspaceFields
  }
}
    ${WorkspaceFieldsFragmentDoc}`;
export type HandoffWorkspaceMutationFn = Apollo.MutationFunction<HandoffWorkspaceMutation, HandoffWorkspaceMutationVariables>;

/**
 * __useHandoffWorkspaceMutation__
 *
 * To run a mutation, you first call `useHandoffWorkspaceMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useHandoffWorkspaceMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [handoffWorkspaceMutation, { data, loading, error }] = useHandoffWorkspaceMutation({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      workspaceId: // value for 'workspaceId'
 *   },
 * });
 */
export function useHandoffWorkspaceMutation(baseOptions?: Apollo.MutationHookOptions<HandoffWorkspaceMutation, HandoffWorkspaceMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<HandoffWorkspaceMutation, HandoffWorkspaceMutationVariables>(HandoffWorkspaceDocument, options);
      }
export type HandoffWorkspaceMutationHookResult = ReturnType<typeof useHandoffWorkspaceMutation>;
export type HandoffWorkspaceMutationResult = Apollo.MutationResult<HandoffWorkspaceMutation>;
export type HandoffWorkspaceMutationOptions = Apollo.BaseMutationOptions<HandoffWorkspaceMutation, HandoffWorkspaceMutationVariables>;