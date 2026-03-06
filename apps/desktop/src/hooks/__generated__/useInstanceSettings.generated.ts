import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type MyInstancesQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type MyInstancesQuery = { __typename?: 'Query', myInstances: Array<{ __typename?: 'ElectronInstance', id: string, serverId: string, name: string, hasPassword: boolean }> };

export type SetInstancePasswordMutationVariables = Types.Exact<{
  instanceId: Types.Scalars['ID']['input'];
  password?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;


export type SetInstancePasswordMutation = { __typename?: 'Mutation', setInstancePassword: boolean };


export const MyInstancesDocument = gql`
    query MyInstances {
  myInstances {
    id
    serverId
    name
    hasPassword
  }
}
    `;

/**
 * __useMyInstancesQuery__
 *
 * To run a query within a React component, call `useMyInstancesQuery` and pass it any options that fit your needs.
 * When your component renders, `useMyInstancesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useMyInstancesQuery({
 *   variables: {
 *   },
 * });
 */
export function useMyInstancesQuery(baseOptions?: Apollo.QueryHookOptions<MyInstancesQuery, MyInstancesQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<MyInstancesQuery, MyInstancesQueryVariables>(MyInstancesDocument, options);
      }
export function useMyInstancesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<MyInstancesQuery, MyInstancesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<MyInstancesQuery, MyInstancesQueryVariables>(MyInstancesDocument, options);
        }
// @ts-ignore
export function useMyInstancesSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<MyInstancesQuery, MyInstancesQueryVariables>): Apollo.UseSuspenseQueryResult<MyInstancesQuery, MyInstancesQueryVariables>;
export function useMyInstancesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<MyInstancesQuery, MyInstancesQueryVariables>): Apollo.UseSuspenseQueryResult<MyInstancesQuery | undefined, MyInstancesQueryVariables>;
export function useMyInstancesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<MyInstancesQuery, MyInstancesQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<MyInstancesQuery, MyInstancesQueryVariables>(MyInstancesDocument, options);
        }
export type MyInstancesQueryHookResult = ReturnType<typeof useMyInstancesQuery>;
export type MyInstancesLazyQueryHookResult = ReturnType<typeof useMyInstancesLazyQuery>;
export type MyInstancesSuspenseQueryHookResult = ReturnType<typeof useMyInstancesSuspenseQuery>;
export type MyInstancesQueryResult = Apollo.QueryResult<MyInstancesQuery, MyInstancesQueryVariables>;
export const SetInstancePasswordDocument = gql`
    mutation SetInstancePassword($instanceId: ID!, $password: String) {
  setInstancePassword(instanceId: $instanceId, password: $password)
}
    `;
export type SetInstancePasswordMutationFn = Apollo.MutationFunction<SetInstancePasswordMutation, SetInstancePasswordMutationVariables>;

/**
 * __useSetInstancePasswordMutation__
 *
 * To run a mutation, you first call `useSetInstancePasswordMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSetInstancePasswordMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [setInstancePasswordMutation, { data, loading, error }] = useSetInstancePasswordMutation({
 *   variables: {
 *      instanceId: // value for 'instanceId'
 *      password: // value for 'password'
 *   },
 * });
 */
export function useSetInstancePasswordMutation(baseOptions?: Apollo.MutationHookOptions<SetInstancePasswordMutation, SetInstancePasswordMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<SetInstancePasswordMutation, SetInstancePasswordMutationVariables>(SetInstancePasswordDocument, options);
      }
export type SetInstancePasswordMutationHookResult = ReturnType<typeof useSetInstancePasswordMutation>;
export type SetInstancePasswordMutationResult = Apollo.MutationResult<SetInstancePasswordMutation>;
export type SetInstancePasswordMutationOptions = Apollo.BaseMutationOptions<SetInstancePasswordMutation, SetInstancePasswordMutationVariables>;