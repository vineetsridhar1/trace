import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';

const defaultOptions = {} as const;

export type MeQueryVariables = Record<string, never>;

export type MeQuery = {
  __typename?: 'Query';
  me?: {
    __typename?: 'AuthUser';
    id: string;
    email: string;
    name: string;
    avatarUrl?: string | null;
    role: string;
  } | null;
};

export const MeDocument = gql`
  query Me {
    me {
      id
      email
      name
      avatarUrl
      role
    }
  }
`;

export function useMeQuery(baseOptions?: Apollo.QueryHookOptions<MeQuery, MeQueryVariables>) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<MeQuery, MeQueryVariables>(MeDocument, options);
}

export function useMeLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<MeQuery, MeQueryVariables>) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<MeQuery, MeQueryVariables>(MeDocument, options);
}
