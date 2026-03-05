import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type BoardQueryVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
}>;


export type BoardQuery = { __typename?: 'Query', board: Array<{ __typename?: 'KanbanColumn', id: string, channelId: string, name: string, slug: string, color?: string | null, sortOrder: number, tickets: Array<{ __typename?: 'Ticket', id: string, workspaceId?: string | null, columnId: string, title: string, description?: string | null, solutionApproach?: string | null, status: string, metadata?: unknown | null, sortOrder: number, createdAt: string, updatedAt: string, workspace?: { __typename?: 'TicketWorkspace', id: string, userId?: string | null, branch?: string | null, prUrl?: string | null, status: string, createdAt: string, attachments: Array<{ __typename?: 'TicketAttachment', id: string, key: string, filename: string, contentType: string, url: string }> } | null }> }> };

export type MoveTicketMutationVariables = Types.Exact<{
  ticketId: Types.Scalars['ID']['input'];
  columnId: Types.Scalars['ID']['input'];
  sortOrder?: Types.InputMaybe<Types.Scalars['Int']['input']>;
}>;


export type MoveTicketMutation = { __typename?: 'Mutation', moveTicket: { __typename?: 'Ticket', id: string, workspaceId?: string | null, columnId: string, title: string, sortOrder: number } };


export const BoardDocument = gql`
    query Board($channelId: ID!) {
  board(channelId: $channelId) {
    id
    channelId
    name
    slug
    color
    sortOrder
    tickets {
      id
      workspaceId
      columnId
      title
      description
      solutionApproach
      status
      metadata
      sortOrder
      createdAt
      updatedAt
      workspace {
        id
        userId
        branch
        prUrl
        status
        createdAt
        attachments {
          id
          key
          filename
          contentType
          url
        }
      }
    }
  }
}
    `;

/**
 * __useBoardQuery__
 *
 * To run a query within a React component, call `useBoardQuery` and pass it any options that fit your needs.
 * When your component renders, `useBoardQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useBoardQuery({
 *   variables: {
 *      channelId: // value for 'channelId'
 *   },
 * });
 */
export function useBoardQuery(baseOptions: Apollo.QueryHookOptions<BoardQuery, BoardQueryVariables> & ({ variables: BoardQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<BoardQuery, BoardQueryVariables>(BoardDocument, options);
      }
export function useBoardLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<BoardQuery, BoardQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<BoardQuery, BoardQueryVariables>(BoardDocument, options);
        }
// @ts-ignore
export function useBoardSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<BoardQuery, BoardQueryVariables>): Apollo.UseSuspenseQueryResult<BoardQuery, BoardQueryVariables>;
export function useBoardSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<BoardQuery, BoardQueryVariables>): Apollo.UseSuspenseQueryResult<BoardQuery | undefined, BoardQueryVariables>;
export function useBoardSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<BoardQuery, BoardQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<BoardQuery, BoardQueryVariables>(BoardDocument, options);
        }
export type BoardQueryHookResult = ReturnType<typeof useBoardQuery>;
export type BoardLazyQueryHookResult = ReturnType<typeof useBoardLazyQuery>;
export type BoardSuspenseQueryHookResult = ReturnType<typeof useBoardSuspenseQuery>;
export type BoardQueryResult = Apollo.QueryResult<BoardQuery, BoardQueryVariables>;
export const MoveTicketDocument = gql`
    mutation MoveTicket($ticketId: ID!, $columnId: ID!, $sortOrder: Int) {
  moveTicket(ticketId: $ticketId, columnId: $columnId, sortOrder: $sortOrder) {
    id
    workspaceId
    columnId
    title
    sortOrder
  }
}
    `;
export type MoveTicketMutationFn = Apollo.MutationFunction<MoveTicketMutation, MoveTicketMutationVariables>;

/**
 * __useMoveTicketMutation__
 *
 * To run a mutation, you first call `useMoveTicketMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useMoveTicketMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [moveTicketMutation, { data, loading, error }] = useMoveTicketMutation({
 *   variables: {
 *      ticketId: // value for 'ticketId'
 *      columnId: // value for 'columnId'
 *      sortOrder: // value for 'sortOrder'
 *   },
 * });
 */
export function useMoveTicketMutation(baseOptions?: Apollo.MutationHookOptions<MoveTicketMutation, MoveTicketMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<MoveTicketMutation, MoveTicketMutationVariables>(MoveTicketDocument, options);
      }
export type MoveTicketMutationHookResult = ReturnType<typeof useMoveTicketMutation>;
export type MoveTicketMutationResult = Apollo.MutationResult<MoveTicketMutation>;
export type MoveTicketMutationOptions = Apollo.BaseMutationOptions<MoveTicketMutation, MoveTicketMutationVariables>;