import {
  createGqlClient,
  handleOrgEvent,
  setPlatform,
  useAuthStore,
  useEntityStore,
  type AuthState,
  type EntityState,
  type GqlClient,
} from "@trace/client-core/headless";
import { gql } from "@urql/core";
import type { Event } from "@trace/gql";
import { createNodePlatform } from "./platform/node-platform.js";

export type ConnectionState = "connected" | "reconnecting" | "disconnected";

/** Read-only store access — commands and the daemon consume state exclusively
 *  through getState/subscribe; the store is only written by the event pipeline. */
export interface ReadonlyStore<S> {
  getState: () => S;
  subscribe: (listener: (state: S, previousState: S) => void) => () => void;
}

export interface CreateClientRuntimeOptions {
  serverUrl: string;
  /** Override the stored credential (tests); defaults to TRACE_TOKEN / credentials.json. */
  token?: string;
  /** Override the stored active org for this run. */
  orgId?: string;
  onConnectionChange?: (state: ConnectionState) => void;
}

export interface StartOptions {
  /** Skip the always-on orgEvents subscription for plain one-shot queries. */
  orgEvents?: boolean;
}

export interface ClientRuntime {
  gql: GqlClient;
  stores: {
    entity: ReadonlyStore<EntityState>;
    auth: ReadonlyStore<AuthState>;
  };
  /** Hydrate the auth store and open the org-wide event subscription. */
  start: (options?: StartOptions) => Promise<void>;
  /** Tear down subscriptions and close the WebSocket so the process can exit. */
  dispose: () => Promise<void>;
}

const ORG_EVENTS_SUBSCRIPTION = gql`
  subscription OrgEvents($organizationId: ID!) {
    orgEvents(organizationId: $organizationId) {
      id
      scopeType
      scopeId
      eventType
      payload
      actor {
        type
        id
        name
        avatarUrl
      }
      parentId
      timestamp
      metadata
    }
  }
`;

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

export function createClientRuntime(options: CreateClientRuntimeOptions): ClientRuntime {
  setPlatform(createNodePlatform({ serverUrl: options.serverUrl }));

  const baseUrl = trimTrailingSlash(options.serverUrl);
  let disposed = false;
  let orgEventsSubscription: { unsubscribe: () => void } | null = null;

  const gqlClient = createGqlClient({
    httpUrl: `${baseUrl}/graphql`,
    wsUrl: `${baseUrl.replace(/^http/, "ws")}/ws`,
    onConnectionChange: (connected) => {
      options.onConnectionChange?.(
        connected ? "connected" : disposed ? "disconnected" : "reconnecting",
      );
    },
  });

  const start = async (startOptions: StartOptions = {}): Promise<void> => {
    if (options.token) {
      useAuthStore.setState({ token: options.token });
    }
    await useAuthStore.getState().fetchMe();
    const auth = useAuthStore.getState();
    if (!auth.user) {
      throw new Error("Not authenticated. Run `trace login`.");
    }
    if (options.orgId && options.orgId !== auth.activeOrgId) {
      auth.setActiveOrg(options.orgId);
    }
    const organizationId = options.orgId ?? auth.activeOrgId;
    if (!organizationId) {
      throw new Error("No active organization. Run `trace org switch <name>`.");
    }
    if (startOptions.orgEvents === false) return;

    orgEventsSubscription = gqlClient
      .subscription(ORG_EVENTS_SUBSCRIPTION, { organizationId })
      .subscribe((result) => {
        if (result.error) {
          console.error(`[orgEvents] subscription error: ${result.error.message}`);
        }
        const event = (result.data as { orgEvents?: Event } | undefined)?.orgEvents;
        if (event) {
          handleOrgEvent(event);
        }
      });
  };

  const dispose = async (): Promise<void> => {
    disposed = true;
    orgEventsSubscription?.unsubscribe();
    orgEventsSubscription = null;
    await gqlClient.dispose();
  };

  return {
    gql: gqlClient,
    stores: {
      entity: { getState: useEntityStore.getState, subscribe: useEntityStore.subscribe },
      auth: { getState: useAuthStore.getState, subscribe: useAuthStore.subscribe },
    },
    start,
    dispose,
  };
}
