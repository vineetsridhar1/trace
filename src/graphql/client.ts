import { ApolloClient, InMemoryCache, HttpLink, split } from "@apollo/client";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { createClient } from "graphql-ws";
import { getServerUrl } from "../types";

export function createGraphqlClient(): ApolloClient<unknown> {
  const serverUrl = getServerUrl();

  const httpLink = new HttpLink({ uri: `${serverUrl}/graphql` });

  const wsLink = new GraphQLWsLink(
    createClient({
      url: serverUrl.replace(/^http/, "ws") + "/graphql",
      retryAttempts: Infinity,
      shouldRetry: () => true,
    }),
  );

  const splitLink = split(
    ({ query }) => {
      const definition = getMainDefinition(query);
      return (
        definition.kind === "OperationDefinition" &&
        definition.operation === "subscription"
      );
    },
    wsLink,
    httpLink,
  );

  return new ApolloClient({
    link: splitLink,
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
        ThreadEventPayload: { keyFields: false },
        TicketUpsertPayload: { keyFields: false },
      },
    }),
    defaultOptions: {
      query: { fetchPolicy: "network-only" },
      watchQuery: { fetchPolicy: "network-only", nextFetchPolicy: "network-only" },
    },
  });
}
