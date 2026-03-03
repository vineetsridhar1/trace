import { ApolloClient, InMemoryCache, HttpLink, split } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { createClient } from "graphql-ws";
import { getServerUrl } from "../types";

const _connectionListeners = new Set<() => void>();
let _wsConnected = false;

function setWsConnected(connected: boolean) {
  if (_wsConnected === connected) return;
  _wsConnected = connected;
  _connectionListeners.forEach((l) => l());
}

/** Subscribe to WS connection state changes (useSyncExternalStore-compatible). */
export function subscribeWsConnection(listener: () => void): () => void {
  _connectionListeners.add(listener);
  return () => { _connectionListeners.delete(listener); };
}

/** Get current WS connection snapshot (useSyncExternalStore-compatible). */
export function getWsConnectionSnapshot(): boolean {
  return _wsConnected;
}

export function createGraphqlClient(): ApolloClient<unknown> {
  const serverUrl = getServerUrl();
  console.log(`[GraphQL] Connecting to server at ${serverUrl}`);

  const rawHttpLink = new HttpLink({ uri: `${serverUrl}/graphql` });

  const authLink = setContext((_, { headers }) => {
    const token = localStorage.getItem('trace-auth-token');
    return {
      headers: {
        ...headers,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    };
  });

  const httpLink = authLink.concat(rawHttpLink);

  const wsLink = new GraphQLWsLink(
    createClient({
      url: serverUrl.replace(/^http/, "ws") + "/graphql",
      retryAttempts: Infinity,
      shouldRetry: () => true,
      on: {
        connected: () => setWsConnected(true),
        closed: () => setWsConnected(false),
      },
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
        WorkspaceCliSession: { keyFields: false },
        WorkspaceUser: { keyFields: false },
        WorkspaceConnection: { keyFields: false },
        EventConnection: { keyFields: false },
        SessionConnection: { keyFields: false },
        RepoValidation: { keyFields: false },
        CreateWorkspacePayload: { keyFields: false },
        AiChatMessageConnection: { keyFields: false },
        SessionEventPayload: { keyFields: false },
        TicketUpsertPayload: { keyFields: false },
        ChannelMessageConnection: { keyFields: false },
        ChannelMessageAuthor: { keyFields: false },
      },
    }),
    defaultOptions: {
      query: { fetchPolicy: "network-only" },
      watchQuery: { fetchPolicy: "network-only", nextFetchPolicy: "network-only" },
    },
  });
}
