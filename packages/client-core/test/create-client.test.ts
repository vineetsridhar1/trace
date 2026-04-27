import { beforeEach, describe, expect, it, vi } from "vitest";
import { gql } from "@urql/core";
import { createGqlClient } from "../src/gql/createClient.js";
import { setPlatform } from "../src/platform.js";
import { useAuthStore } from "../src/stores/auth.js";

interface MockWebSocket {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
}

function createMockWebSocket(): MockWebSocket {
  const socket: MockWebSocket = {
    readyState: 0,
    send: vi.fn(),
    close: vi.fn(),
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
  };

  socket.close.mockImplementation(() => {
    socket.readyState = 3;
  });

  return socket;
}

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    activeOrgId: "org-1",
    orgMemberships: [],
    loading: false,
    token: "token-1",
  });
});

describe("createGqlClient", () => {
  it("uses the injected platform websocket implementation for subscriptions", async () => {
    const socket = createMockWebSocket();
    const createWebSocket = vi.fn(
      (_url: string, _protocols?: string[]) => socket as unknown as WebSocket,
    );

    setPlatform({
      apiUrl: "http://example.test",
      clientSource: "web",
      authMode: "bearer",
      storage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
      secureStorage: {
        getToken: async () => null,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
      fetch: vi.fn<typeof fetch>(),
      createWebSocket,
    });

    const client = createGqlClient({
      httpUrl: "http://example.test/graphql",
      wsUrl: "ws://example.test/graphql",
    });

    const subscription = client
      .subscription(
        gql`
          subscription TestSubscription {
            __typename
          }
        `,
        {},
      )
      .subscribe(() => undefined);

    await Promise.resolve();
    await Promise.resolve();

    expect(createWebSocket).toHaveBeenCalledWith("ws://example.test/graphql", [
      "graphql-transport-ws",
    ]);

    subscription.unsubscribe();
    socket.onclose?.({
      code: 1000,
      reason: "Normal Closure",
      wasClean: true,
    } as CloseEvent);
  });
});
