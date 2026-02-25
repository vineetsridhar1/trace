import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
import { SERVER_URL } from "../types";

export const graphqlClient = new ApolloClient({
  link: new HttpLink({ uri: `${SERVER_URL}/graphql` }),
  cache: new InMemoryCache({
    typePolicies: {
      // Types without `id` — store inline, don't try to normalize
      MessageSession: { keyFields: false },
      MessageConnection: { keyFields: false },
      EventConnection: { keyFields: false },
      SessionConnection: { keyFields: false },
      RepoValidation: { keyFields: false },
      CreateMessagePayload: { keyFields: false },
    },
  }),
  defaultOptions: {
    query: { fetchPolicy: "cache-first" },
  },
});
