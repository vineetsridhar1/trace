import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type CreateChannelMutationVariables = Types.Exact<{
  name: Types.Scalars['String']['input'];
  serverId?: Types.InputMaybe<Types.Scalars['String']['input']>;
  type?: Types.InputMaybe<Types.Scalars['String']['input']>;
  workspacesEnabled?: Types.InputMaybe<Types.Scalars['Boolean']['input']>;
  teamIds?: Types.InputMaybe<Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input']>;
  githubUrl?: Types.InputMaybe<Types.Scalars['String']['input']>;
  baseBranch?: Types.InputMaybe<Types.Scalars['String']['input']>;
  defaultSetupScript?: Types.InputMaybe<Types.Scalars['String']['input']>;
  defaultRunScript?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;


export type CreateChannelMutation = { __typename?: 'Mutation', createChannel: { __typename?: 'Channel', id: string, serverId: string, name: string, type: string, workspacesEnabled: boolean, orchestrateMode: boolean, teamIds: Array<string>, baseBranch?: string | null, githubUrl?: string | null, defaultSetupScript?: string | null, defaultRunScript?: string | null, createdAt: string, updatedAt: string } };


export const CreateChannelDocument = gql`
    mutation CreateChannel($name: String!, $serverId: String, $type: String, $workspacesEnabled: Boolean, $teamIds: [String!], $githubUrl: String, $baseBranch: String, $defaultSetupScript: String, $defaultRunScript: String) {
  createChannel(
    name: $name
    serverId: $serverId
    type: $type
    workspacesEnabled: $workspacesEnabled
    teamIds: $teamIds
    githubUrl: $githubUrl
    baseBranch: $baseBranch
    defaultSetupScript: $defaultSetupScript
    defaultRunScript: $defaultRunScript
  ) {
    id
    serverId
    name
    type
    workspacesEnabled
    orchestrateMode
    teamIds
    baseBranch
    githubUrl
    defaultSetupScript
    defaultRunScript
    createdAt
    updatedAt
  }
}
    `;
export type CreateChannelMutationFn = Apollo.MutationFunction<CreateChannelMutation, CreateChannelMutationVariables>;

/**
 * __useCreateChannelMutation__
 *
 * To run a mutation, you first call `useCreateChannelMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateChannelMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createChannelMutation, { data, loading, error }] = useCreateChannelMutation({
 *   variables: {
 *      name: // value for 'name'
 *      serverId: // value for 'serverId'
 *      type: // value for 'type'
 *      workspacesEnabled: // value for 'workspacesEnabled'
 *      teamIds: // value for 'teamIds'
 *      githubUrl: // value for 'githubUrl'
 *      baseBranch: // value for 'baseBranch'
 *      defaultSetupScript: // value for 'defaultSetupScript'
 *      defaultRunScript: // value for 'defaultRunScript'
 *   },
 * });
 */
export function useCreateChannelMutation(baseOptions?: Apollo.MutationHookOptions<CreateChannelMutation, CreateChannelMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateChannelMutation, CreateChannelMutationVariables>(CreateChannelDocument, options);
      }
export type CreateChannelMutationHookResult = ReturnType<typeof useCreateChannelMutation>;
export type CreateChannelMutationResult = Apollo.MutationResult<CreateChannelMutation>;
export type CreateChannelMutationOptions = Apollo.BaseMutationOptions<CreateChannelMutation, CreateChannelMutationVariables>;