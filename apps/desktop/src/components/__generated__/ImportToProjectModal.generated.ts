import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type CreateChannelForImportMutationVariables = Types.Exact<{
  name: Types.Scalars['String']['input'];
  serverId?: Types.InputMaybe<Types.Scalars['String']['input']>;
  type?: Types.InputMaybe<Types.Scalars['String']['input']>;
  workspacesEnabled?: Types.InputMaybe<Types.Scalars['Boolean']['input']>;
  baseBranch?: Types.InputMaybe<Types.Scalars['String']['input']>;
  githubUrl?: Types.InputMaybe<Types.Scalars['String']['input']>;
  defaultSetupScript?: Types.InputMaybe<Types.Scalars['String']['input']>;
  defaultRunScript?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;


export type CreateChannelForImportMutation = { __typename?: 'Mutation', createChannel: { __typename?: 'Channel', id: string, serverId: string, name: string, type: string, workspacesEnabled: boolean, baseBranch?: string | null, githubUrl?: string | null, defaultSetupScript?: string | null, defaultRunScript?: string | null, createdAt: string, updatedAt: string } };

export type DeleteChannelForCleanupMutationVariables = Types.Exact<{
  id: Types.Scalars['ID']['input'];
}>;


export type DeleteChannelForCleanupMutation = { __typename?: 'Mutation', deleteChannel: boolean };

export type ImportTicketsToProjectMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  tickets: Array<Types.ImportTicketInput> | Types.ImportTicketInput;
  runConfig: Types.Scalars['JSON']['input'];
}>;


export type ImportTicketsToProjectMutation = { __typename?: 'Mutation', importTicketsToProject: Array<{ __typename?: 'ImportedTicketResult', ticketJsonId: string, workspaceId: string, ticketId: string }> };


export const CreateChannelForImportDocument = gql`
    mutation CreateChannelForImport($name: String!, $serverId: String, $type: String, $workspacesEnabled: Boolean, $baseBranch: String, $githubUrl: String, $defaultSetupScript: String, $defaultRunScript: String) {
  createChannel(
    name: $name
    serverId: $serverId
    type: $type
    workspacesEnabled: $workspacesEnabled
    baseBranch: $baseBranch
    githubUrl: $githubUrl
    defaultSetupScript: $defaultSetupScript
    defaultRunScript: $defaultRunScript
  ) {
    id
    serverId
    name
    type
    workspacesEnabled
    baseBranch
    githubUrl
    defaultSetupScript
    defaultRunScript
    createdAt
    updatedAt
  }
}
    `;
export type CreateChannelForImportMutationFn = Apollo.MutationFunction<CreateChannelForImportMutation, CreateChannelForImportMutationVariables>;

/**
 * __useCreateChannelForImportMutation__
 *
 * To run a mutation, you first call `useCreateChannelForImportMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateChannelForImportMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createChannelForImportMutation, { data, loading, error }] = useCreateChannelForImportMutation({
 *   variables: {
 *      name: // value for 'name'
 *      serverId: // value for 'serverId'
 *      type: // value for 'type'
 *      workspacesEnabled: // value for 'workspacesEnabled'
 *      baseBranch: // value for 'baseBranch'
 *      githubUrl: // value for 'githubUrl'
 *      defaultSetupScript: // value for 'defaultSetupScript'
 *      defaultRunScript: // value for 'defaultRunScript'
 *   },
 * });
 */
export function useCreateChannelForImportMutation(baseOptions?: Apollo.MutationHookOptions<CreateChannelForImportMutation, CreateChannelForImportMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateChannelForImportMutation, CreateChannelForImportMutationVariables>(CreateChannelForImportDocument, options);
      }
export type CreateChannelForImportMutationHookResult = ReturnType<typeof useCreateChannelForImportMutation>;
export type CreateChannelForImportMutationResult = Apollo.MutationResult<CreateChannelForImportMutation>;
export type CreateChannelForImportMutationOptions = Apollo.BaseMutationOptions<CreateChannelForImportMutation, CreateChannelForImportMutationVariables>;
export const DeleteChannelForCleanupDocument = gql`
    mutation DeleteChannelForCleanup($id: ID!) {
  deleteChannel(id: $id)
}
    `;
export type DeleteChannelForCleanupMutationFn = Apollo.MutationFunction<DeleteChannelForCleanupMutation, DeleteChannelForCleanupMutationVariables>;

/**
 * __useDeleteChannelForCleanupMutation__
 *
 * To run a mutation, you first call `useDeleteChannelForCleanupMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteChannelForCleanupMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteChannelForCleanupMutation, { data, loading, error }] = useDeleteChannelForCleanupMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useDeleteChannelForCleanupMutation(baseOptions?: Apollo.MutationHookOptions<DeleteChannelForCleanupMutation, DeleteChannelForCleanupMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteChannelForCleanupMutation, DeleteChannelForCleanupMutationVariables>(DeleteChannelForCleanupDocument, options);
      }
export type DeleteChannelForCleanupMutationHookResult = ReturnType<typeof useDeleteChannelForCleanupMutation>;
export type DeleteChannelForCleanupMutationResult = Apollo.MutationResult<DeleteChannelForCleanupMutation>;
export type DeleteChannelForCleanupMutationOptions = Apollo.BaseMutationOptions<DeleteChannelForCleanupMutation, DeleteChannelForCleanupMutationVariables>;
export const ImportTicketsToProjectDocument = gql`
    mutation ImportTicketsToProject($channelId: ID!, $tickets: [ImportTicketInput!]!, $runConfig: JSON!) {
  importTicketsToProject(
    channelId: $channelId
    tickets: $tickets
    runConfig: $runConfig
  ) {
    ticketJsonId
    workspaceId
    ticketId
  }
}
    `;
export type ImportTicketsToProjectMutationFn = Apollo.MutationFunction<ImportTicketsToProjectMutation, ImportTicketsToProjectMutationVariables>;

/**
 * __useImportTicketsToProjectMutation__
 *
 * To run a mutation, you first call `useImportTicketsToProjectMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useImportTicketsToProjectMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [importTicketsToProjectMutation, { data, loading, error }] = useImportTicketsToProjectMutation({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      tickets: // value for 'tickets'
 *      runConfig: // value for 'runConfig'
 *   },
 * });
 */
export function useImportTicketsToProjectMutation(baseOptions?: Apollo.MutationHookOptions<ImportTicketsToProjectMutation, ImportTicketsToProjectMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ImportTicketsToProjectMutation, ImportTicketsToProjectMutationVariables>(ImportTicketsToProjectDocument, options);
      }
export type ImportTicketsToProjectMutationHookResult = ReturnType<typeof useImportTicketsToProjectMutation>;
export type ImportTicketsToProjectMutationResult = Apollo.MutationResult<ImportTicketsToProjectMutation>;
export type ImportTicketsToProjectMutationOptions = Apollo.BaseMutationOptions<ImportTicketsToProjectMutation, ImportTicketsToProjectMutationVariables>;