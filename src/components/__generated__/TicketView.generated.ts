import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type TicketDependenciesQueryVariables = Types.Exact<{
  workspaceId: Types.Scalars['ID']['input'];
}>;


export type TicketDependenciesQuery = { __typename?: 'Query', ticketDependencies: Array<{ __typename?: 'TicketDependency', id: string, dependsOnWorkspaceId: string, dependsOnTicketTitle?: string | null }> };


export const TicketDependenciesDocument = gql`
    query TicketDependencies($workspaceId: ID!) {
  ticketDependencies(workspaceId: $workspaceId) {
    id
    dependsOnWorkspaceId
    dependsOnTicketTitle
  }
}
    `;

/**
 * __useTicketDependenciesQuery__
 *
 * To run a query within a React component, call `useTicketDependenciesQuery` and pass it any options that fit your needs.
 * When your component renders, `useTicketDependenciesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useTicketDependenciesQuery({
 *   variables: {
 *      workspaceId: // value for 'workspaceId'
 *   },
 * });
 */
export function useTicketDependenciesQuery(baseOptions: Apollo.QueryHookOptions<TicketDependenciesQuery, TicketDependenciesQueryVariables> & ({ variables: TicketDependenciesQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<TicketDependenciesQuery, TicketDependenciesQueryVariables>(TicketDependenciesDocument, options);
      }
export function useTicketDependenciesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<TicketDependenciesQuery, TicketDependenciesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<TicketDependenciesQuery, TicketDependenciesQueryVariables>(TicketDependenciesDocument, options);
        }
// @ts-ignore
export function useTicketDependenciesSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<TicketDependenciesQuery, TicketDependenciesQueryVariables>): Apollo.UseSuspenseQueryResult<TicketDependenciesQuery, TicketDependenciesQueryVariables>;
export function useTicketDependenciesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<TicketDependenciesQuery, TicketDependenciesQueryVariables>): Apollo.UseSuspenseQueryResult<TicketDependenciesQuery | undefined, TicketDependenciesQueryVariables>;
export function useTicketDependenciesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<TicketDependenciesQuery, TicketDependenciesQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<TicketDependenciesQuery, TicketDependenciesQueryVariables>(TicketDependenciesDocument, options);
        }
export type TicketDependenciesQueryHookResult = ReturnType<typeof useTicketDependenciesQuery>;
export type TicketDependenciesLazyQueryHookResult = ReturnType<typeof useTicketDependenciesLazyQuery>;
export type TicketDependenciesSuspenseQueryHookResult = ReturnType<typeof useTicketDependenciesSuspenseQuery>;
export type TicketDependenciesQueryResult = Apollo.QueryResult<TicketDependenciesQuery, TicketDependenciesQueryVariables>;