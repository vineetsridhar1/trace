import { gql } from "@apollo/client";
import * as Apollo from "@apollo/client";
const defaultOptions = {} as const;

export type MyInstancesQueryVariables = Record<string, never>;

export type MyInstancesQuery = {
  __typename?: "Query";
  myInstances: Array<{
    __typename?: "ElectronInstance";
    id: string;
    name: string;
    serverId: string;
    hasPassword: boolean;
    isOnline: boolean;
    owner: {
      __typename?: "InstanceOwner";
      id: string;
      name: string;
      avatarUrl?: string | null;
    };
  }>;
};

export const MyInstancesDocument = gql`
  query MyInstances {
    myInstances {
      id
      name
      serverId
      hasPassword
      isOnline
      owner {
        id
        name
        avatarUrl
      }
    }
  }
`;

export function useMyInstancesQuery(
  baseOptions?: Apollo.QueryHookOptions<
    MyInstancesQuery,
    MyInstancesQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useQuery<MyInstancesQuery, MyInstancesQueryVariables>(
    MyInstancesDocument,
    options,
  );
}

export function useMyInstancesLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    MyInstancesQuery,
    MyInstancesQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions };
  return Apollo.useLazyQuery<MyInstancesQuery, MyInstancesQueryVariables>(
    MyInstancesDocument,
    options,
  );
}
