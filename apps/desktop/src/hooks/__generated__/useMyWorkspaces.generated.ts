import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import { WorkspaceFieldsFragmentDoc } from '../../graphql/__generated__/fragments.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type MyWorkspacesQueryVariables = Types.Exact<{
  serverId: Types.Scalars['ID']['input'];
  excludeStatuses?: Types.InputMaybe<Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input']>;
}>;


export type MyWorkspacesQuery = { __typename?: 'Query', myWorkspaces: Array<{ __typename?: 'Workspace', channelName?: string | null, id: string, channelId: string, cliSessionId: string, userId?: string | null, preview?: string | null, ticketTitle?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, agentSessionId?: string | null, agentType?: string | null, createdAt: string, sessionCount: number, queuedRunConfig?: unknown | null, isProductDoc: boolean, cliSession?: { __typename?: 'WorkspaceCliSession', sessionId: string, cwd?: string | null, status: string, permissionMode?: string | null } | null, user?: { __typename?: 'WorkspaceUser', id: string, name: string, avatarUrl?: string | null } | null }> };

export type MyWorkspacesMergedCountQueryVariables = Types.Exact<{
  serverId: Types.Scalars['ID']['input'];
}>;


export type MyWorkspacesMergedCountQuery = { __typename?: 'Query', myWorkspacesMergedCount: number };


export const MyWorkspacesDocument = gql`
    query MyWorkspaces($serverId: ID!, $excludeStatuses: [String!]) {
  myWorkspaces(serverId: $serverId, excludeStatuses: $excludeStatuses) {
    ...WorkspaceFields
    channelName
  }
}
    ${WorkspaceFieldsFragmentDoc}`;

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
export const MyWorkspacesMergedCountDocument = gql`
    query MyWorkspacesMergedCount($serverId: ID!) {
  myWorkspacesMergedCount(serverId: $serverId)
}
    `;

/**
 * __useMyWorkspacesMergedCountQuery__
 *
 * To run a query within a React component, call `useMyWorkspacesMergedCountQuery` and pass it any options that fit your needs.
 * When your component renders, `useMyWorkspacesMergedCountQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useMyWorkspacesMergedCountQuery({
 *   variables: {
 *      serverId: // value for 'serverId'
 *   },
 * });
 */
export function useMyWorkspacesMergedCountQuery(baseOptions: Apollo.QueryHookOptions<MyWorkspacesMergedCountQuery, MyWorkspacesMergedCountQueryVariables> & ({ variables: MyWorkspacesMergedCountQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<MyWorkspacesMergedCountQuery, MyWorkspacesMergedCountQueryVariables>(MyWorkspacesMergedCountDocument, options);
      }
export function useMyWorkspacesMergedCountLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<MyWorkspacesMergedCountQuery, MyWorkspacesMergedCountQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<MyWorkspacesMergedCountQuery, MyWorkspacesMergedCountQueryVariables>(MyWorkspacesMergedCountDocument, options);
        }
// @ts-ignore
export function useMyWorkspacesMergedCountSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<MyWorkspacesMergedCountQuery, MyWorkspacesMergedCountQueryVariables>): Apollo.UseSuspenseQueryResult<MyWorkspacesMergedCountQuery, MyWorkspacesMergedCountQueryVariables>;
export function useMyWorkspacesMergedCountSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<MyWorkspacesMergedCountQuery, MyWorkspacesMergedCountQueryVariables>): Apollo.UseSuspenseQueryResult<MyWorkspacesMergedCountQuery | undefined, MyWorkspacesMergedCountQueryVariables>;
export function useMyWorkspacesMergedCountSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<MyWorkspacesMergedCountQuery, MyWorkspacesMergedCountQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<MyWorkspacesMergedCountQuery, MyWorkspacesMergedCountQueryVariables>(MyWorkspacesMergedCountDocument, options);
        }
export type MyWorkspacesMergedCountQueryHookResult = ReturnType<typeof useMyWorkspacesMergedCountQuery>;
export type MyWorkspacesMergedCountLazyQueryHookResult = ReturnType<typeof useMyWorkspacesMergedCountLazyQuery>;
export type MyWorkspacesMergedCountSuspenseQueryHookResult = ReturnType<typeof useMyWorkspacesMergedCountSuspenseQuery>;
export type MyWorkspacesMergedCountQueryResult = Apollo.QueryResult<MyWorkspacesMergedCountQuery, MyWorkspacesMergedCountQueryVariables>;