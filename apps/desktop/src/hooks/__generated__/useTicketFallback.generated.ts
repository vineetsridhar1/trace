import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type TicketByWorkspaceIdQueryVariables = Types.Exact<{
  workspaceId: Types.Scalars['ID']['input'];
}>;


export type TicketByWorkspaceIdQuery = { __typename?: 'Query', ticketByWorkspaceId?: { __typename?: 'Ticket', id: string, workspaceId?: string | null, columnId: string, title: string, description?: string | null, solutionApproach?: string | null, status: string, metadata?: unknown | null, sortOrder: number, createdAt: string, updatedAt: string, workspace?: { __typename?: 'TicketWorkspace', id: string, branch?: string | null, prUrl?: string | null, status: string, createdAt: string, attachments: Array<{ __typename?: 'TicketAttachment', id: string, key: string, filename: string, contentType: string, url: string }> } | null } | null };


export const TicketByWorkspaceIdDocument = gql`
    query TicketByWorkspaceId($workspaceId: ID!) {
  ticketByWorkspaceId(workspaceId: $workspaceId) {
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
    `;

/**
 * __useTicketByWorkspaceIdQuery__
 *
 * To run a query within a React component, call `useTicketByWorkspaceIdQuery` and pass it any options that fit your needs.
 * When your component renders, `useTicketByWorkspaceIdQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useTicketByWorkspaceIdQuery({
 *   variables: {
 *      workspaceId: // value for 'workspaceId'
 *   },
 * });
 */
export function useTicketByWorkspaceIdQuery(baseOptions: Apollo.QueryHookOptions<TicketByWorkspaceIdQuery, TicketByWorkspaceIdQueryVariables> & ({ variables: TicketByWorkspaceIdQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<TicketByWorkspaceIdQuery, TicketByWorkspaceIdQueryVariables>(TicketByWorkspaceIdDocument, options);
      }
export function useTicketByWorkspaceIdLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<TicketByWorkspaceIdQuery, TicketByWorkspaceIdQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<TicketByWorkspaceIdQuery, TicketByWorkspaceIdQueryVariables>(TicketByWorkspaceIdDocument, options);
        }
// @ts-ignore
export function useTicketByWorkspaceIdSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<TicketByWorkspaceIdQuery, TicketByWorkspaceIdQueryVariables>): Apollo.UseSuspenseQueryResult<TicketByWorkspaceIdQuery, TicketByWorkspaceIdQueryVariables>;
export function useTicketByWorkspaceIdSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<TicketByWorkspaceIdQuery, TicketByWorkspaceIdQueryVariables>): Apollo.UseSuspenseQueryResult<TicketByWorkspaceIdQuery | undefined, TicketByWorkspaceIdQueryVariables>;
export function useTicketByWorkspaceIdSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<TicketByWorkspaceIdQuery, TicketByWorkspaceIdQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<TicketByWorkspaceIdQuery, TicketByWorkspaceIdQueryVariables>(TicketByWorkspaceIdDocument, options);
        }
export type TicketByWorkspaceIdQueryHookResult = ReturnType<typeof useTicketByWorkspaceIdQuery>;
export type TicketByWorkspaceIdLazyQueryHookResult = ReturnType<typeof useTicketByWorkspaceIdLazyQuery>;
export type TicketByWorkspaceIdSuspenseQueryHookResult = ReturnType<typeof useTicketByWorkspaceIdSuspenseQuery>;
export type TicketByWorkspaceIdQueryResult = Apollo.QueryResult<TicketByWorkspaceIdQuery, TicketByWorkspaceIdQueryVariables>;