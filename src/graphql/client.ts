import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
import { SERVER_URL } from "../types";

export const graphqlClient = new ApolloClient({
  link: new HttpLink({ uri: `${SERVER_URL}/graphql` }),
  cache: new InMemoryCache(),
  defaultOptions: {
    query: { fetchPolicy: "cache-first" },
  },
});
