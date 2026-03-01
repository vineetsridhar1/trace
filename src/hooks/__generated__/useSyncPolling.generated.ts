import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type CheckPrStatusesQueryVariables = Types.Exact<{
  channelId: Types.Scalars['ID']['input'];
  branches: Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input'];
}>;


export type CheckPrStatusesQuery = { __typename?: 'Query', checkPRStatuses: Array<{ __typename?: 'PRStatus', branch: string, hasPR: boolean, merged: boolean, prUrl?: string | null }> };


export const CheckPrStatusesDocument = gql`
    query CheckPRStatuses($channelId: ID!, $branches: [String!]!) {
  checkPRStatuses(channelId: $channelId, branches: $branches) {
    branch
    hasPR
    merged
    prUrl
  }
}
    `;

/**
 * __useCheckPrStatusesQuery__
 *
 * To run a query within a React component, call `useCheckPrStatusesQuery` and pass it any options that fit your needs.
 * When your component renders, `useCheckPrStatusesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useCheckPrStatusesQuery({
 *   variables: {
 *      channelId: // value for 'channelId'
 *      branches: // value for 'branches'
 *   },
 * });
 */
export function useCheckPrStatusesQuery(baseOptions: Apollo.QueryHookOptions<CheckPrStatusesQuery, CheckPrStatusesQueryVariables> & ({ variables: CheckPrStatusesQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<CheckPrStatusesQuery, CheckPrStatusesQueryVariables>(CheckPrStatusesDocument, options);
      }
export function useCheckPrStatusesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<CheckPrStatusesQuery, CheckPrStatusesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<CheckPrStatusesQuery, CheckPrStatusesQueryVariables>(CheckPrStatusesDocument, options);
        }
// @ts-ignore
export function useCheckPrStatusesSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<CheckPrStatusesQuery, CheckPrStatusesQueryVariables>): Apollo.UseSuspenseQueryResult<CheckPrStatusesQuery, CheckPrStatusesQueryVariables>;
export function useCheckPrStatusesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<CheckPrStatusesQuery, CheckPrStatusesQueryVariables>): Apollo.UseSuspenseQueryResult<CheckPrStatusesQuery | undefined, CheckPrStatusesQueryVariables>;
export function useCheckPrStatusesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<CheckPrStatusesQuery, CheckPrStatusesQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<CheckPrStatusesQuery, CheckPrStatusesQueryVariables>(CheckPrStatusesDocument, options);
        }
export type CheckPrStatusesQueryHookResult = ReturnType<typeof useCheckPrStatusesQuery>;
export type CheckPrStatusesLazyQueryHookResult = ReturnType<typeof useCheckPrStatusesLazyQuery>;
export type CheckPrStatusesSuspenseQueryHookResult = ReturnType<typeof useCheckPrStatusesSuspenseQuery>;
export type CheckPrStatusesQueryResult = Apollo.QueryResult<CheckPrStatusesQuery, CheckPrStatusesQueryVariables>;