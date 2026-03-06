import { ApolloClient, InMemoryCache, HttpLink, split } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { createClient } from "graphql-ws";

function getBaseUrl(): string {
  const serverUrl = import.meta.env.VITE_SERVER_URL;
  return serverUrl || window.location.origin;
}

function getWsUrl(): string {
  const serverUrl = import.meta.env.VITE_SERVER_URL;
  if (serverUrl) {
    const url = new URL(serverUrl);
    const protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${url.host}`;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}

const _connectionListeners = new Set<() => void>();
let _wsConnected = false;

function setWsConnected(connected: boolean) {
  if (_wsConnected === connected) return;
  _wsConnected = connected;
  _connectionListeners.forEach((l) => l());
}

export function subscribeWsConnection(listener: () => void): () => void {
  _connectionListeners.add(listener);
  return () => {
    _connectionListeners.delete(listener);
  };
}

export function getWsConnectionSnapshot(): boolean {
  return _wsConnected;
}

const rawHttpLink = new HttpLink({ uri: `${getBaseUrl()}/graphql` });

const authLink = setContext((_, { headers }) => {
  const token = localStorage.getItem("trace_token");
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
    url: `${getWsUrl()}/graphql`,
    connectionParams: () => {
      const token = localStorage.getItem("trace_token");
      return token ? { authorization: `Bearer ${token}` } : {};
    },
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

export const apolloClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache({
    typePolicies: {
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
      PresenceUser: { keyFields: false },
      WorkspacePresence: { keyFields: false },
      PresencePayload: { keyFields: false },
    },
  }),
  defaultOptions: {
    query: { fetchPolicy: "network-only" },
    watchQuery: {
      fetchPolicy: "network-only",
      nextFetchPolicy: "network-only",
    },
  },
});
