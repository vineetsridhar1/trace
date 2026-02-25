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


export type UpdateMessageStatusMutation = { __typename?: 'Mutation', updateMessageStatus: { __typename?: 'Message', id: string, channelId: string, sessionId: string, preview?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, claudeSessionId?: string | null, createdAt: string, threadCount: number, session?: { __typename?: 'MessageSession', sessionId: string, cwd?: string | null, status: string } | null } };


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