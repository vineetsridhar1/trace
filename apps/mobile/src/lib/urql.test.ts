import { beforeEach, describe, expect, it, vi } from "vitest";

type ConnectionChangeHandler = (connected: boolean) => void;

const createGqlClient = vi.fn();
const getGraphqlUrls = vi.fn(() => ({
  httpUrl: "https://trace.test/graphql",
  wsUrl: "wss://trace.test/graphql",
}));
const setConnected = vi.fn();
const connectionHandlers: ConnectionChangeHandler[] = [];

vi.mock("@trace/client-core", () => ({
  createGqlClient,
}));

vi.mock("@/lib/connection-target", () => ({
  getGraphqlUrls,
}));

vi.mock("@/stores/connection", () => ({
  useConnectionStore: {
    getState: () => ({ setConnected }),
  },
}));

describe("GraphQL client lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    createGqlClient.mockReset();
    setConnected.mockReset();
    connectionHandlers.length = 0;
    createGqlClient.mockImplementation((options: unknown) => {
      const handler = (options as { onConnectionChange: ConnectionChangeHandler })
        .onConnectionChange;
      connectionHandlers.push(handler);
      return {
        dispose: vi.fn(() => {
          handler(false);
          return Promise.resolve();
        }),
      };
    });
  });

  it("ignores the retired client's close notification after replacing it", async () => {
    const { getClient, recreateClient } = await import("./urql");

    getClient();
    connectionHandlers[0](true);
    recreateClient();
    connectionHandlers[1](true);

    expect(setConnected).toHaveBeenCalledTimes(2);
    expect(setConnected).toHaveBeenNthCalledWith(1, true);
    expect(setConnected).toHaveBeenNthCalledWith(2, true);
  });
});
