import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type MyWorkspacesQueryVariables = Types.Exact<{
  serverId: Types.Scalars['ID']['input'];
  excludeStatuses?: Types.InputMaybe<Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input']>;
}>;


export type MyWorkspacesQuery = { __typename?: 'Query', myWorkspaces: Array<{ __typename?: 'Workspace', id: string, channelId: string, channelName?: string | null, preview?: string | null, status: string, importance: string, createdAt: string }> };


export const MyWorkspacesDocument = gql`
    query MyWorkspaces($serverId: ID!, $excludeStatuses: [String!]) {
  myWorkspaces(serverId: $serverId, excludeStatuses: $excludeStatuses) {
    id
    channelId
    channelName
    preview
    status
    importance
    createdAt
  }
}
    `;

/**
 * __useMyWorkspacesQuery__
 *
 * To run a query within a React component, call `useMyWorkspacesQuery` and pass it any options that fit your needs.
 * When your component renders, `useMyWorkspacesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useMyWorkspacesQuery({
 *   variables: {
 *      serverId: // value for 'serverId'
 *      excludeStatuses: // value for 'excludeStatuses'
 *   },
 * });
 */
export function useMyWorkspacesQuery(baseOptions: Apollo.QueryHookOptions<MyWorkspacesQuery, MyWorkspacesQueryVariables> & ({ variables: MyWorkspacesQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<MyWorkspacesQuery, MyWorkspacesQueryVariables>(MyWorkspacesDocument, options);
      }
export function useMyWorkspacesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<MyWorkspacesQuery, MyWorkspacesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<MyWorkspacesQuery, MyWorkspacesQueryVariables>(MyWorkspacesDocument, options);
        }
// @ts-ignore
export function useMyWorkspacesSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<MyWorkspacesQuery, MyWorkspacesQueryVariables>): Apollo.UseSuspenseQueryResult<MyWorkspacesQuery, MyWorkspacesQueryVariables>;
export function useMyWorkspacesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<MyWorkspacesQuery, MyWorkspacesQueryVariables>): Apollo.UseSuspenseQueryResult<MyWorkspacesQuery | undefined, MyWorkspacesQueryVariables>;
export function useMyWorkspacesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<MyWorkspacesQuery, MyWorkspacesQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<MyWorkspacesQuery, MyWorkspacesQueryVariables>(MyWorkspacesDocument, options);
        }
export type MyWorkspacesQueryHookResult = ReturnType<typeof useMyWorkspacesQuery>;
export type MyWorkspacesLazyQueryHookResult = ReturnType<typeof useMyWorkspacesLazyQuery>;
export type MyWorkspacesSuspenseQueryHookResult = ReturnType<typeof useMyWorkspacesSuspenseQuery>;
export type MyWorkspacesQueryResult = Apollo.QueryResult<MyWorkspacesQuery, MyWorkspacesQueryVariables>;