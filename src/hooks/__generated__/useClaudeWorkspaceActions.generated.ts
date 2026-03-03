import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import { WorkspaceFieldsFragmentDoc } from '../../graphql/__generated__/fragments.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type UpdateInitialPromptMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  workspaceId: Types.Scalars['ID']['input'];
  text: Types.Scalars['String']['input'];
  attachmentIds?: Types.InputMaybe<Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input']>;
}>;


export type UpdateInitialPromptMutation = { __typename?: 'Mutation', updateInitialPrompt: { __typename?: 'CreateWorkspacePayload', workspace: { __typename?: 'Workspace', id: string, channelId: string, cliSessionId: string, userId?: string | null, preview?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, claudeSessionId?: string | null, createdAt: string, sessionCount: number, queuedRunConfig?: unknown | null, cliSession?: { __typename?: 'WorkspaceCliSession', sessionId: string, cwd?: string | null, status: string } | null, user?: { __typename?: 'WorkspaceUser', id: string, name: string, avatarUrl?: string | null } | null }, session: { __typename?: 'Session', id: string, workspaceId: string, createdAt: string, eventCount: number }, event: { __typename?: 'Event', id: string, cliSessionId: string, hookEventName: string, timestamp: string, sessionId: string, importance: string } } };


export const UpdateInitialPromptDocument = gql`
    mutation UpdateInitialPrompt($channelId: ID!, $workspaceId: ID!, $text: String!, $attachmentIds: [String!]) {
  updateInitialPrompt(
    channelId: $channelId
    workspaceId: $workspaceId
    text: $text
    attachmentIds: $attachmentIds
  ) {
    workspace {
      ...WorkspaceFields
    }
    session {
      id
      workspaceId
      createdAt
      eventCount
    }
    event {
      id
      cliSessionId
      hookEventName
      timestamp
      sessionId
      importance
    }
  }
}
    ${WorkspaceFieldsFragmentDoc}`;
export type UpdateInitialPromptMutationFn = Apollo.MutationFunction<UpdateInitialPromptMutation, UpdateInitialPromptMutationVariables>;

/**
 * __useUpdateInitialPromptMutation__
 *
 * To run a mutation, you first call `useUpdateInitialPromptMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateInitialPromptMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateInitialPromptMutation, { data, loading, error }] = useUpdateInitialPromptMutation({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      workspaceId: // value for 'workspaceId'
 *      text: // value for 'text'
 *      attachmentIds: // value for 'attachmentIds'
 *   },
 * });
 */
export function useUpdateInitialPromptMutation(baseOptions?: Apollo.MutationHookOptions<UpdateInitialPromptMutation, UpdateInitialPromptMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateInitialPromptMutation, UpdateInitialPromptMutationVariables>(UpdateInitialPromptDocument, options);
      }
export type UpdateInitialPromptMutationHookResult = ReturnType<typeof useUpdateInitialPromptMutation>;
export type UpdateInitialPromptMutationResult = Apollo.MutationResult<UpdateInitialPromptMutation>;
export type UpdateInitialPromptMutationOptions = Apollo.BaseMutationOptions<UpdateInitialPromptMutation, UpdateInitialPromptMutationVariables>;