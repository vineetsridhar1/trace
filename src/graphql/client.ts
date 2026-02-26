import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
import { getServerUrl } from "../types";

export function createGraphqlClient(): ApolloClient<unknown> {
  return new ApolloClient({
    link: new HttpLink({ uri: `${getServerUrl()}/graphql` }),
    cache: new InMemoryCache({
      typePolicies: {
        // Types without `id` — store inline, don't try to normalize
        MessageSession: { keyFields: false },
        MessageConnection: { keyFields: false },
        EventConnection: { keyFields: false },
        SessionConnection: { keyFields: false },
        RepoValidation: { keyFields: false },
        CreateMessagePayload: { keyFields: false },
        AiChatMessageConnection: { keyFields: false },
      },
    }),
    defaultOptions: {
      query: { fetchPolicy: "network-only" },
      watchQuery: { fetchPolicy: "network-only", nextFetchPolicy: "network-only" },
    },
  });
}
