import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type UpdateChannelMutationVariables = Types.Exact<{
  id: Types.Scalars['ID']['input'];
  name?: Types.InputMaybe<Types.Scalars['String']['input']>;
  baseBranch?: Types.InputMaybe<Types.Scalars['String']['input']>;
  githubUrl?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;


export type UpdateChannelMutation = { __typename?: 'Mutation', updateChannel: { __typename?: 'Channel', id: string, serverId: string, name: string, baseBranch?: string | null, githubUrl?: string | null, createdAt: string, updatedAt: string } };


export const UpdateChannelDocument = gql`
    mutation UpdateChannel($id: ID!, $name: String, $baseBranch: String, $githubUrl: String) {
  updateChannel(
    id: $id
    name: $name
    baseBranch: $baseBranch
    githubUrl: $githubUrl
  ) {
    id
    serverId
    name
    baseBranch
    githubUrl
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
 *      baseBranch: // value for 'baseBranch'
 *      githubUrl: // value for 'githubUrl'
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