import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type UpdateChannelMutationVariables = Types.Exact<{
  id: Types.Scalars['ID']['input'];
  name?: Types.InputMaybe<Types.Scalars['String']['input']>;
  workspacesEnabled?: Types.InputMaybe<Types.Scalars['Boolean']['input']>;
  teamIds?: Types.InputMaybe<Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input']>;
  baseBranch?: Types.InputMaybe<Types.Scalars['String']['input']>;
  githubUrl?: Types.InputMaybe<Types.Scalars['String']['input']>;
  defaultRepoPath?: Types.InputMaybe<Types.Scalars['String']['input']>;
  defaultSetupScript?: Types.InputMaybe<Types.Scalars['String']['input']>;
  defaultRunScript?: Types.InputMaybe<Types.Scalars['String']['input']>;
  defaultTeardownScript?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;


export type UpdateChannelMutation = { __typename?: 'Mutation', updateChannel: { __typename?: 'Channel', id: string, serverId: string, name: string, type: string, workspacesEnabled: boolean, teamIds: Array<string>, baseBranch?: string | null, githubUrl?: string | null, defaultRepoPath?: string | null, defaultSetupScript?: string | null, defaultRunScript?: string | null, defaultTeardownScript?: string | null, createdAt: string, updatedAt: string } };

export type DeleteChannelMutationVariables = Types.Exact<{
  id: Types.Scalars['ID']['input'];
}>;


export type DeleteChannelMutation = { __typename?: 'Mutation', deleteChannel: boolean };


export const UpdateChannelDocument = gql`
    mutation UpdateChannel($id: ID!, $name: String, $workspacesEnabled: Boolean, $teamIds: [String!], $baseBranch: String, $githubUrl: String, $defaultRepoPath: String, $defaultSetupScript: String, $defaultRunScript: String, $defaultTeardownScript: String) {
  updateChannel(
    id: $id
    name: $name
    workspacesEnabled: $workspacesEnabled
    teamIds: $teamIds
    baseBranch: $baseBranch
    githubUrl: $githubUrl
    defaultRepoPath: $defaultRepoPath
    defaultSetupScript: $defaultSetupScript
    defaultRunScript: $defaultRunScript
    defaultTeardownScript: $defaultTeardownScript
  ) {
    id
    serverId
    name
    type
    workspacesEnabled
    teamIds
    baseBranch
    githubUrl
    defaultRepoPath
    defaultSetupScript
    defaultRunScript
    defaultTeardownScript
    createdAt
    updatedAt
  }
}
    `;
export type UpdateChannelMutationFn = Apollo.MutationFunction<UpdateChannelMutation, UpdateChannelMutationVariables>;

/**
 * __useUpdateChannelMutation__
 *
 * To run a mutation, you first call `useUpdateChannelMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateChannelMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateChannelMutation, { data, loading, error }] = useUpdateChannelMutation({
 *   variables: {
 *      id: // value for 'id'
 *      name: // value for 'name'
 *      workspacesEnabled: // value for 'workspacesEnabled'
 *      teamIds: // value for 'teamIds'
 *      baseBranch: // value for 'baseBranch'
 *      githubUrl: // value for 'githubUrl'
 *      defaultRepoPath: // value for 'defaultRepoPath'
 *      defaultSetupScript: // value for 'defaultSetupScript'
 *      defaultRunScript: // value for 'defaultRunScript'
 *      defaultTeardownScript: // value for 'defaultTeardownScript'
 *   },
 * });
 */
export function useUpdateChannelMutation(baseOptions?: Apollo.MutationHookOptions<UpdateChannelMutation, UpdateChannelMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateChannelMutation, UpdateChannelMutationVariables>(UpdateChannelDocument, options);
      }
export type UpdateChannelMutationHookResult = ReturnType<typeof useUpdateChannelMutation>;
export type UpdateChannelMutationResult = Apollo.MutationResult<UpdateChannelMutation>;
export type UpdateChannelMutationOptions = Apollo.BaseMutationOptions<UpdateChannelMutation, UpdateChannelMutationVariables>;
export const DeleteChannelDocument = gql`
    mutation DeleteChannel($id: ID!) {
  deleteChannel(id: $id)
}
    `;
export type DeleteChannelMutationFn = Apollo.MutationFunction<DeleteChannelMutation, DeleteChannelMutationVariables>;

/**
 * __useDeleteChannelMutation__
 *
 * To run a mutation, you first call `useDeleteChannelMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteChannelMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteChannelMutation, { data, loading, error }] = useDeleteChannelMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useDeleteChannelMutation(baseOptions?: Apollo.MutationHookOptions<DeleteChannelMutation, DeleteChannelMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteChannelMutation, DeleteChannelMutationVariables>(DeleteChannelDocument, options);
      }
export type DeleteChannelMutationHookResult = ReturnType<typeof useDeleteChannelMutation>;
export type DeleteChannelMutationResult = Apollo.MutationResult<DeleteChannelMutation>;
export type DeleteChannelMutationOptions = Apollo.BaseMutationOptions<DeleteChannelMutation, DeleteChannelMutationVariables>;