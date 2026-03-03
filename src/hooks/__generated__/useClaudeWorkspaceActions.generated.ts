import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import { WorkspaceFieldsFragmentDoc } from '../../graphql/__generated__/fragments.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type CreateWorkspaceMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  text: Types.Scalars['String']['input'];
  attachmentIds?: Types.InputMaybe<Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input']>;
}>;


export type CreateWorkspaceMutation = { __typename?: 'Mutation', createWorkspace: { __typename?: 'CreateWorkspacePayload', workspace: { __typename?: 'Workspace', id: string, channelId: string, cliSessionId: string, userId?: string | null, preview?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, claudeSessionId?: string | null, createdAt: string, sessionCount: number, queuedRunConfig?: unknown | null, cliSession?: { __typename?: 'WorkspaceCliSession', sessionId: string, cwd?: string | null, status: string } | null, user?: { __typename?: 'WorkspaceUser', id: string, name: string, avatarUrl?: string | null } | null }, session: { __typename?: 'Session', id: string, workspaceId: string, createdAt: string, eventCount: number }, event: { __typename?: 'Event', id: string, cliSessionId: string, hookEventName: string, timestamp: string, sessionId: string, importance: string } } };

export type AppendPromptMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  workspaceId: Types.Scalars['ID']['input'];
  text: Types.Scalars['String']['input'];
  attachmentIds?: Types.InputMaybe<Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input']>;
  createNewSession?: Types.InputMaybe<Types.Scalars['Boolean']['input']>;
  sessionId?: Types.InputMaybe<Types.Scalars['ID']['input']>;
}>;


export type AppendPromptMutation = { __typename?: 'Mutation', appendPrompt: { __typename?: 'CreateWorkspacePayload', workspace: { __typename?: 'Workspace', id: string, channelId: string, cliSessionId: string, userId?: string | null, preview?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, claudeSessionId?: string | null, createdAt: string, sessionCount: number, queuedRunConfig?: unknown | null, cliSession?: { __typename?: 'WorkspaceCliSession', sessionId: string, cwd?: string | null, status: string } | null, user?: { __typename?: 'WorkspaceUser', id: string, name: string, avatarUrl?: string | null } | null }, session: { __typename?: 'Session', id: string, workspaceId: string, createdAt: string, eventCount: number }, event: { __typename?: 'Event', id: string, cliSessionId: string, hookEventName: string, timestamp: string, sessionId: string, importance: string } } };

export type UpdateWorkspacePreviewMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  workspaceId: Types.Scalars['ID']['input'];
  preview: Types.Scalars['String']['input'];
}>;


export type UpdateWorkspacePreviewMutation = { __typename?: 'Mutation', updateWorkspacePreview: { __typename?: 'Workspace', id: string, channelId: string, cliSessionId: string, userId?: string | null, preview?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, claudeSessionId?: string | null, createdAt: string, sessionCount: number, queuedRunConfig?: unknown | null, cliSession?: { __typename?: 'WorkspaceCliSession', sessionId: string, cwd?: string | null, status: string } | null, user?: { __typename?: 'WorkspaceUser', id: string, name: string, avatarUrl?: string | null } | null } };

export type UpdateInitialPromptMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  workspaceId: Types.Scalars['ID']['input'];
  text: Types.Scalars['String']['input'];
}>;


export type UpdateInitialPromptMutation = { __typename?: 'Mutation', updateInitialPrompt: { __typename?: 'CreateWorkspacePayload', workspace: { __typename?: 'Workspace', id: string, channelId: string, cliSessionId: string, userId?: string | null, preview?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, claudeSessionId?: string | null, createdAt: string, sessionCount: number, queuedRunConfig?: unknown | null, cliSession?: { __typename?: 'WorkspaceCliSession', sessionId: string, cwd?: string | null, status: string } | null, user?: { __typename?: 'WorkspaceUser', id: string, name: string, avatarUrl?: string | null } | null }, session: { __typename?: 'Session', id: string, workspaceId: string, createdAt: string, eventCount: number }, event: { __typename?: 'Event', id: string, cliSessionId: string, hookEventName: string, timestamp: string, sessionId: string, importance: string } } };


export const CreateWorkspaceDocument = gql`
    mutation CreateWorkspace($channelId: ID!, $text: String!, $attachmentIds: [String!]) {
  createWorkspace(
    channelId: $channelId
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
export type CreateWorkspaceMutationFn = Apollo.MutationFunction<CreateWorkspaceMutation, CreateWorkspaceMutationVariables>;

/**
 * __useCreateWorkspaceMutation__
 *
 * To run a mutation, you first call `useCreateWorkspaceMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateWorkspaceMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createWorkspaceMutation, { data, loading, error }] = useCreateWorkspaceMutation({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      text: // value for 'text'
 *      attachmentIds: // value for 'attachmentIds'
 *   },
 * });
 */
export function useCreateWorkspaceMutation(baseOptions?: Apollo.MutationHookOptions<CreateWorkspaceMutation, CreateWorkspaceMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateWorkspaceMutation, CreateWorkspaceMutationVariables>(CreateWorkspaceDocument, options);
      }
export type CreateWorkspaceMutationHookResult = ReturnType<typeof useCreateWorkspaceMutation>;
export type CreateWorkspaceMutationResult = Apollo.MutationResult<CreateWorkspaceMutation>;
export type CreateWorkspaceMutationOptions = Apollo.BaseMutationOptions<CreateWorkspaceMutation, CreateWorkspaceMutationVariables>;
export const AppendPromptDocument = gql`
    mutation AppendPrompt($channelId: ID!, $workspaceId: ID!, $text: String!, $attachmentIds: [String!], $createNewSession: Boolean, $sessionId: ID) {
  appendPrompt(
    channelId: $channelId
    workspaceId: $workspaceId
    text: $text
    attachmentIds: $attachmentIds
    createNewSession: $createNewSession
    sessionId: $sessionId
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
export type AppendPromptMutationFn = Apollo.MutationFunction<AppendPromptMutation, AppendPromptMutationVariables>;

/**
 * __useAppendPromptMutation__
 *
 * To run a mutation, you first call `useAppendPromptMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAppendPromptMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [appendPromptMutation, { data, loading, error }] = useAppendPromptMutation({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      workspaceId: // value for 'workspaceId'
 *      text: // value for 'text'
 *      attachmentIds: // value for 'attachmentIds'
 *      createNewSession: // value for 'createNewSession'
 *      sessionId: // value for 'sessionId'
 *   },
 * });
 */
export function useAppendPromptMutation(baseOptions?: Apollo.MutationHookOptions<AppendPromptMutation, AppendPromptMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<AppendPromptMutation, AppendPromptMutationVariables>(AppendPromptDocument, options);
      }
export type AppendPromptMutationHookResult = ReturnType<typeof useAppendPromptMutation>;
export type AppendPromptMutationResult = Apollo.MutationResult<AppendPromptMutation>;
export type AppendPromptMutationOptions = Apollo.BaseMutationOptions<AppendPromptMutation, AppendPromptMutationVariables>;
export const UpdateWorkspacePreviewDocument = gql`
    mutation UpdateWorkspacePreview($channelId: ID!, $workspaceId: ID!, $preview: String!) {
  updateWorkspacePreview(
    channelId: $channelId
    workspaceId: $workspaceId
    preview: $preview
  ) {
    ...WorkspaceFields
  }
}
    ${WorkspaceFieldsFragmentDoc}`;
export type UpdateWorkspacePreviewMutationFn = Apollo.MutationFunction<UpdateWorkspacePreviewMutation, UpdateWorkspacePreviewMutationVariables>;

/**
 * __useUpdateWorkspacePreviewMutation__
 *
 * To run a mutation, you first call `useUpdateWorkspacePreviewMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateWorkspacePreviewMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateWorkspacePreviewMutation, { data, loading, error }] = useUpdateWorkspacePreviewMutation({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      workspaceId: // value for 'workspaceId'
 *      preview: // value for 'preview'
 *   },
 * });
 */
export function useUpdateWorkspacePreviewMutation(baseOptions?: Apollo.MutationHookOptions<UpdateWorkspacePreviewMutation, UpdateWorkspacePreviewMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateWorkspacePreviewMutation, UpdateWorkspacePreviewMutationVariables>(UpdateWorkspacePreviewDocument, options);
      }
export type UpdateWorkspacePreviewMutationHookResult = ReturnType<typeof useUpdateWorkspacePreviewMutation>;
export type UpdateWorkspacePreviewMutationResult = Apollo.MutationResult<UpdateWorkspacePreviewMutation>;
export type UpdateWorkspacePreviewMutationOptions = Apollo.BaseMutationOptions<UpdateWorkspacePreviewMutation, UpdateWorkspacePreviewMutationVariables>;
export const UpdateInitialPromptDocument = gql`
    mutation UpdateInitialPrompt($channelId: ID!, $workspaceId: ID!, $text: String!) {
  updateInitialPrompt(
    channelId: $channelId
    workspaceId: $workspaceId
    text: $text
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