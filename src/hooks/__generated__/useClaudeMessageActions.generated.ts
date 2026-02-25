import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import { MessageFieldsFragmentDoc } from '../../graphql/__generated__/fragments.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type CreateMessageMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  text: Types.Scalars['String']['input'];
  attachmentIds?: Types.InputMaybe<Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input']>;
}>;


export type CreateMessageMutation = { __typename?: 'Mutation', createMessage: { __typename?: 'CreateMessagePayload', message: { __typename?: 'Message', id: string, channelId: string, sessionId: string, preview?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, claudeSessionId?: string | null, createdAt: string, threadCount: number, session?: { __typename?: 'MessageSession', sessionId: string, cwd?: string | null, status: string } | null }, thread: { __typename?: 'Thread', id: string, messageId: string, createdAt: string, eventCount: number }, event: { __typename?: 'Event', id: string, sessionId: string, hookEventName: string, timestamp: string, threadId: string, importance: string } } };

export type AppendPromptMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  messageId: Types.Scalars['ID']['input'];
  text: Types.Scalars['String']['input'];
  attachmentIds?: Types.InputMaybe<Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input']>;
}>;


export type AppendPromptMutation = { __typename?: 'Mutation', appendPrompt: { __typename?: 'CreateMessagePayload', message: { __typename?: 'Message', id: string, channelId: string, sessionId: string, preview?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, claudeSessionId?: string | null, createdAt: string, threadCount: number, session?: { __typename?: 'MessageSession', sessionId: string, cwd?: string | null, status: string } | null }, thread: { __typename?: 'Thread', id: string, messageId: string, createdAt: string, eventCount: number }, event: { __typename?: 'Event', id: string, sessionId: string, hookEventName: string, timestamp: string, threadId: string, importance: string } } };

export type UpdateMessagePreviewMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  messageId: Types.Scalars['ID']['input'];
  preview: Types.Scalars['String']['input'];
}>;


export type UpdateMessagePreviewMutation = { __typename?: 'Mutation', updateMessagePreview: { __typename?: 'Message', id: string, channelId: string, sessionId: string, preview?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, claudeSessionId?: string | null, createdAt: string, threadCount: number, session?: { __typename?: 'MessageSession', sessionId: string, cwd?: string | null, status: string } | null } };


export const CreateMessageDocument = gql`
    mutation CreateMessage($channelId: ID!, $text: String!, $attachmentIds: [String!]) {
  createMessage(channelId: $channelId, text: $text, attachmentIds: $attachmentIds) {
    message {
      ...MessageFields
    }
    thread {
      id
      messageId
      createdAt
      eventCount
    }
    event {
      id
      sessionId
      hookEventName
      timestamp
      threadId
      importance
    }
  }
}
    ${MessageFieldsFragmentDoc}`;
export type CreateMessageMutationFn = Apollo.MutationFunction<CreateMessageMutation, CreateMessageMutationVariables>;

/**
 * __useCreateMessageMutation__
 *
 * To run a mutation, you first call `useCreateMessageMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateMessageMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createMessageMutation, { data, loading, error }] = useCreateMessageMutation({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      text: // value for 'text'
 *      attachmentIds: // value for 'attachmentIds'
 *   },
 * });
 */
export function useCreateMessageMutation(baseOptions?: Apollo.MutationHookOptions<CreateMessageMutation, CreateMessageMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateMessageMutation, CreateMessageMutationVariables>(CreateMessageDocument, options);
      }
export type CreateMessageMutationHookResult = ReturnType<typeof useCreateMessageMutation>;
export type CreateMessageMutationResult = Apollo.MutationResult<CreateMessageMutation>;
export type CreateMessageMutationOptions = Apollo.BaseMutationOptions<CreateMessageMutation, CreateMessageMutationVariables>;
export const AppendPromptDocument = gql`
    mutation AppendPrompt($channelId: ID!, $messageId: ID!, $text: String!, $attachmentIds: [String!]) {
  appendPrompt(
    channelId: $channelId
    messageId: $messageId
    text: $text
    attachmentIds: $attachmentIds
  ) {
    message {
      ...MessageFields
    }
    thread {
      id
      messageId
      createdAt
      eventCount
    }
    event {
      id
      sessionId
      hookEventName
      timestamp
      threadId
      importance
    }
  }
}
    ${MessageFieldsFragmentDoc}`;
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
 *      messageId: // value for 'messageId'
 *      text: // value for 'text'
 *      attachmentIds: // value for 'attachmentIds'
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
export const UpdateMessagePreviewDocument = gql`
    mutation UpdateMessagePreview($channelId: ID!, $messageId: ID!, $preview: String!) {
  updateMessagePreview(
    channelId: $channelId
    messageId: $messageId
    preview: $preview
  ) {
    ...MessageFields
  }
}
    ${MessageFieldsFragmentDoc}`;
export type UpdateMessagePreviewMutationFn = Apollo.MutationFunction<UpdateMessagePreviewMutation, UpdateMessagePreviewMutationVariables>;

/**
 * __useUpdateMessagePreviewMutation__
 *
 * To run a mutation, you first call `useUpdateMessagePreviewMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateMessagePreviewMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateMessagePreviewMutation, { data, loading, error }] = useUpdateMessagePreviewMutation({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      messageId: // value for 'messageId'
 *      preview: // value for 'preview'
 *   },
 * });
 */
export function useUpdateMessagePreviewMutation(baseOptions?: Apollo.MutationHookOptions<UpdateMessagePreviewMutation, UpdateMessagePreviewMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateMessagePreviewMutation, UpdateMessagePreviewMutationVariables>(UpdateMessagePreviewDocument, options);
      }
export type UpdateMessagePreviewMutationHookResult = ReturnType<typeof useUpdateMessagePreviewMutation>;
export type UpdateMessagePreviewMutationResult = Apollo.MutationResult<UpdateMessagePreviewMutation>;
export type UpdateMessagePreviewMutationOptions = Apollo.BaseMutationOptions<UpdateMessagePreviewMutation, UpdateMessagePreviewMutationVariables>;