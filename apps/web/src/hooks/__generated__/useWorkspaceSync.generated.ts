import * as Types from '../../__generated__/schema-types';

import { gql } from '@apollo/client';
import { WorkspaceFieldsFragmentDoc } from '../../graphql/__generated__/fragments.generated';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type WorkspacesQueryVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  limit?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  offset?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  excludeStatus?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;


export type WorkspacesQuery = { __typename?: 'Query', workspaces: { __typename?: 'WorkspaceConnection', total: number, mergedCount: number, limit: number, offset: number, workspaces: Array<{ __typename?: 'Workspace', id: string, channelId: string, cliSessionId: string, userId?: string | null, preview?: string | null, importance: string, status: string, summary?: string | null, branch?: string | null, agentSessionId?: string | null, agentType?: string | null, createdAt: string, sessionCount: number, queuedRunConfig?: unknown | null, isProductDoc: boolean, cliSession?: { __typename?: 'WorkspaceCliSession', sessionId: string, cwd?: string | null, status: string } | null, user?: { __typename?: 'WorkspaceUser', id: string, name: string, avatarUrl?: string | null } | null }> } };


export const WorkspacesDocument = gql`
    query Workspaces($channelId: ID!, $limit: Int, $offset: Int, $excludeStatus: String) {
  workspaces(
    channelId: $channelId
    limit: $limit
    offset: $offset
    excludeStatus: $excludeStatus
  ) {
    workspaces {
      ...WorkspaceFields
    }
    total
    mergedCount
    limit
    offset
  }
}
    ${WorkspaceFieldsFragmentDoc}`;

/**
 * __useWorkspacesQuery__
 *
 * To run a query within a React component, call `useWorkspacesQuery` and pass it any options that fit your needs.
 * When your component renders, `useWorkspacesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useWorkspacesQuery({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      limit: // value for 'limit'
 *      offset: // value for 'offset'
 *      excludeStatus: // value for 'excludeStatus'
 *   },
 * });
 */
export function useWorkspacesQuery(baseOptions: Apollo.QueryHookOptions<WorkspacesQuery, WorkspacesQueryVariables> & ({ variables: WorkspacesQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<WorkspacesQuery, WorkspacesQueryVariables>(WorkspacesDocument, options);
      }
export function useWorkspacesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<WorkspacesQuery, WorkspacesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<WorkspacesQuery, WorkspacesQueryVariables>(WorkspacesDocument, options);
        }
// @ts-ignore
export function useWorkspacesSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<WorkspacesQuery, WorkspacesQueryVariables>): Apollo.UseSuspenseQueryResult<WorkspacesQuery, WorkspacesQueryVariables>;
export function useWorkspacesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<WorkspacesQuery, WorkspacesQueryVariables>): Apollo.UseSuspenseQueryResult<WorkspacesQuery | undefined, WorkspacesQueryVariables>;
export function useWorkspacesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<WorkspacesQuery, WorkspacesQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<WorkspacesQuery, WorkspacesQueryVariables>(WorkspacesDocument, options);
        }
export type WorkspacesQueryHookResult = ReturnType<typeof useWorkspacesQuery>;
export type WorkspacesLazyQueryHookResult = ReturnType<typeof useWorkspacesLazyQuery>;
export type WorkspacesSuspenseQueryHookResult = ReturnType<typeof useWorkspacesSuspenseQuery>;
export type WorkspacesQueryResult = Apollo.QueryResult<WorkspacesQuery, WorkspacesQueryVariables>;