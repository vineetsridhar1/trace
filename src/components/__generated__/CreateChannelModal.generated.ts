import * as Types from '../../graphql/__generated__/schema-types';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type ValidateRepoQueryVariables = Types.Exact<{
  localRepoPath: Types.Scalars['String']['input'];
}>;


export type ValidateRepoQuery = { __typename?: 'Query', validateRepo: { __typename?: 'RepoValidation', valid: boolean, originUrl?: string | null, error?: string | null } };

export type RepoBranchesQueryVariables = Types.Exact<{
  localRepoPath: Types.Scalars['String']['input'];
}>;


export type RepoBranchesQuery = { __typename?: 'Query', repoBranches: Array<string> };

export type SuggestScriptsQueryVariables = Types.Exact<{
  localRepoPath: Types.Scalars['String']['input'];
}>;


export type SuggestScriptsQuery = { __typename?: 'Query', suggestScripts: { __typename?: 'ScriptSuggestion', setupScript?: string | null, runScript?: string | null } };

export type CreateChannelMutationVariables = Types.Exact<{
  name: Types.Scalars['String']['input'];
  serverId?: Types.InputMaybe<Types.Scalars['String']['input']>;
  githubUrl?: Types.InputMaybe<Types.Scalars['String']['input']>;
  baseBranch?: Types.InputMaybe<Types.Scalars['String']['input']>;
  defaultSetupScript?: Types.InputMaybe<Types.Scalars['String']['input']>;
  defaultRunScript?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;


export type CreateChannelMutation = { __typename?: 'Mutation', createChannel: { __typename?: 'Channel', id: string, serverId: string, name: string, baseBranch?: string | null, githubUrl?: string | null, defaultSetupScript?: string | null, defaultRunScript?: string | null, createdAt: string, updatedAt: string } };


export const ValidateRepoDocument = gql`
    query ValidateRepo($localRepoPath: String!) {
  validateRepo(localRepoPath: $localRepoPath) {
    valid
    originUrl
    error
  }
}
    `;

/**
 * __useValidateRepoQuery__
 *
 * To run a query within a React component, call `useValidateRepoQuery` and pass it any options that fit your needs.
 * When your component renders, `useValidateRepoQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useValidateRepoQuery({
 *   variables: {
 *      localRepoPath: // value for 'localRepoPath'
 *   },
 * });
 */
export function useValidateRepoQuery(baseOptions: Apollo.QueryHookOptions<ValidateRepoQuery, ValidateRepoQueryVariables> & ({ variables: ValidateRepoQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<ValidateRepoQuery, ValidateRepoQueryVariables>(ValidateRepoDocument, options);
      }
export function useValidateRepoLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<ValidateRepoQuery, ValidateRepoQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<ValidateRepoQuery, ValidateRepoQueryVariables>(ValidateRepoDocument, options);
        }
// @ts-ignore
export function useValidateRepoSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<ValidateRepoQuery, ValidateRepoQueryVariables>): Apollo.UseSuspenseQueryResult<ValidateRepoQuery, ValidateRepoQueryVariables>;
export function useValidateRepoSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<ValidateRepoQuery, ValidateRepoQueryVariables>): Apollo.UseSuspenseQueryResult<ValidateRepoQuery | undefined, ValidateRepoQueryVariables>;
export function useValidateRepoSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<ValidateRepoQuery, ValidateRepoQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<ValidateRepoQuery, ValidateRepoQueryVariables>(ValidateRepoDocument, options);
        }
export type ValidateRepoQueryHookResult = ReturnType<typeof useValidateRepoQuery>;
export type ValidateRepoLazyQueryHookResult = ReturnType<typeof useValidateRepoLazyQuery>;
export type ValidateRepoSuspenseQueryHookResult = ReturnType<typeof useValidateRepoSuspenseQuery>;
export type ValidateRepoQueryResult = Apollo.QueryResult<ValidateRepoQuery, ValidateRepoQueryVariables>;
export const RepoBranchesDocument = gql`
    query RepoBranches($localRepoPath: String!) {
  repoBranches(localRepoPath: $localRepoPath)
}
    `;

/**
 * __useRepoBranchesQuery__
 *
 * To run a query within a React component, call `useRepoBranchesQuery` and pass it any options that fit your needs.
 * When your component renders, `useRepoBranchesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useRepoBranchesQuery({
 *   variables: {
 *      localRepoPath: // value for 'localRepoPath'
 *   },
 * });
 */
export function useRepoBranchesQuery(baseOptions: Apollo.QueryHookOptions<RepoBranchesQuery, RepoBranchesQueryVariables> & ({ variables: RepoBranchesQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<RepoBranchesQuery, RepoBranchesQueryVariables>(RepoBranchesDocument, options);
      }
export function useRepoBranchesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<RepoBranchesQuery, RepoBranchesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<RepoBranchesQuery, RepoBranchesQueryVariables>(RepoBranchesDocument, options);
        }
// @ts-ignore
export function useRepoBranchesSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<RepoBranchesQuery, RepoBranchesQueryVariables>): Apollo.UseSuspenseQueryResult<RepoBranchesQuery, RepoBranchesQueryVariables>;
export function useRepoBranchesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<RepoBranchesQuery, RepoBranchesQueryVariables>): Apollo.UseSuspenseQueryResult<RepoBranchesQuery | undefined, RepoBranchesQueryVariables>;
export function useRepoBranchesSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<RepoBranchesQuery, RepoBranchesQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<RepoBranchesQuery, RepoBranchesQueryVariables>(RepoBranchesDocument, options);
        }
export type RepoBranchesQueryHookResult = ReturnType<typeof useRepoBranchesQuery>;
export type RepoBranchesLazyQueryHookResult = ReturnType<typeof useRepoBranchesLazyQuery>;
export type RepoBranchesSuspenseQueryHookResult = ReturnType<typeof useRepoBranchesSuspenseQuery>;
export type RepoBranchesQueryResult = Apollo.QueryResult<RepoBranchesQuery, RepoBranchesQueryVariables>;
export const SuggestScriptsDocument = gql`
    query SuggestScripts($localRepoPath: String!) {
  suggestScripts(localRepoPath: $localRepoPath) {
    setupScript
    runScript
  }
}
    `;

/**
 * __useSuggestScriptsQuery__
 *
 * To run a query within a React component, call `useSuggestScriptsQuery` and pass it any options that fit your needs.
 * When your component renders, `useSuggestScriptsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useSuggestScriptsQuery({
 *   variables: {
 *      localRepoPath: // value for 'localRepoPath'
 *   },
 * });
 */
export function useSuggestScriptsQuery(baseOptions: Apollo.QueryHookOptions<SuggestScriptsQuery, SuggestScriptsQueryVariables> & ({ variables: SuggestScriptsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<SuggestScriptsQuery, SuggestScriptsQueryVariables>(SuggestScriptsDocument, options);
      }
export function useSuggestScriptsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<SuggestScriptsQuery, SuggestScriptsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<SuggestScriptsQuery, SuggestScriptsQueryVariables>(SuggestScriptsDocument, options);
        }
// @ts-ignore
export function useSuggestScriptsSuspenseQuery(baseOptions?: Apollo.SuspenseQueryHookOptions<SuggestScriptsQuery, SuggestScriptsQueryVariables>): Apollo.UseSuspenseQueryResult<SuggestScriptsQuery, SuggestScriptsQueryVariables>;
export function useSuggestScriptsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<SuggestScriptsQuery, SuggestScriptsQueryVariables>): Apollo.UseSuspenseQueryResult<SuggestScriptsQuery | undefined, SuggestScriptsQueryVariables>;
export function useSuggestScriptsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<SuggestScriptsQuery, SuggestScriptsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<SuggestScriptsQuery, SuggestScriptsQueryVariables>(SuggestScriptsDocument, options);
        }
export type SuggestScriptsQueryHookResult = ReturnType<typeof useSuggestScriptsQuery>;
export type SuggestScriptsLazyQueryHookResult = ReturnType<typeof useSuggestScriptsLazyQuery>;
export type SuggestScriptsSuspenseQueryHookResult = ReturnType<typeof useSuggestScriptsSuspenseQuery>;
export type SuggestScriptsQueryResult = Apollo.QueryResult<SuggestScriptsQuery, SuggestScriptsQueryVariables>;
export const CreateChannelDocument = gql`
    mutation CreateChannel($name: String!, $serverId: String, $githubUrl: String, $baseBranch: String, $defaultSetupScript: String, $defaultRunScript: String) {
  createChannel(
    name: $name
    serverId: $serverId
    githubUrl: $githubUrl
    baseBranch: $baseBranch
    defaultSetupScript: $defaultSetupScript
    defaultRunScript: $defaultRunScript
  ) {
    id
    serverId
    name
    baseBranch
    githubUrl
    defaultSetupScript
    defaultRunScript
    createdAt
    updatedAt
  }
}
    `;
export type CreateChannelMutationFn = Apollo.MutationFunction<CreateChannelMutation, CreateChannelMutationVariables>;

/**
 * __useCreateChannelMutation__
 *
 * To run a mutation, you first call `useCreateChannelMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateChannelMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createChannelMutation, { data, loading, error }] = useCreateChannelMutation({
 *   variables: {
 *      name: // value for 'name'
 *      serverId: // value for 'serverId'
 *      githubUrl: // value for 'githubUrl'
 *      baseBranch: // value for 'baseBranch'
 *      defaultSetupScript: // value for 'defaultSetupScript'
 *      defaultRunScript: // value for 'defaultRunScript'
 *   },
 * });
 */
export function useCreateChannelMutation(baseOptions?: Apollo.MutationHookOptions<CreateChannelMutation, CreateChannelMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateChannelMutation, CreateChannelMutationVariables>(CreateChannelDocument, options);
      }
export type CreateChannelMutationHookResult = ReturnType<typeof useCreateChannelMutation>;
export type CreateChannelMutationResult = Apollo.MutationResult<CreateChannelMutation>;
export type CreateChannelMutationOptions = Apollo.BaseMutationOptions<CreateChannelMutation, CreateChannelMutationVariables>;