import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@trace/gql";
import { setPlatform } from "../src/platform.js";
import { isUnauthorizedError, useAuthStore } from "../src/stores/auth.js";
import { useEntityStore } from "../src/stores/entity.js";

const existingUser = {
  id: "user-1",
  email: "one@example.test",
  name: "Existing User",
} as User;

function configureFetch(fetchMock: typeof fetch): void {
  const storage = new Map<string, string>();
  setPlatform({
    apiUrl: "https://trace.example.test",
    clientSource: "web",
    authMode: "cookie",
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
      removeItem: (key) => {
        storage.delete(key);
      },
    },
    secureStorage: {
      getToken: async () => null,
      setToken: async () => undefined,
      clearToken: async () => undefined,
    },
    fetch: fetchMock,
    createWebSocket: () => {
      throw new Error("WebSocket is not used by auth store tests");
    },
  });
}

beforeEach(() => {
  useEntityStore.getState().reset();
  useAuthStore.setState({
    user: null,
    activeOrgId: null,
    orgMemberships: [],
    loading: true,
    authUnavailable: false,
    reauthRequired: false,
    token: null,
  });
});

describe("auth session recovery", () => {
  it("keeps the current workspace mounted when an established cookie session expires", async () => {
    configureFetch(vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 })));
    useAuthStore.setState({
      user: existingUser,
      activeOrgId: "org-1",
      loading: false,
    });

    await expect(useAuthStore.getState().fetchMe()).resolves.toBe(false);

    expect(useAuthStore.getState()).toMatchObject({
      user: existingUser,
      activeOrgId: "org-1",
      authUnavailable: false,
      reauthRequired: true,
      loading: false,
    });
  });

  it("shows the normal login flow when no authenticated workspace has loaded", async () => {
    configureFetch(vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(useAuthStore.getState().fetchMe()).resolves.toBe(false);

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      activeOrgId: null,
      authUnavailable: false,
      reauthRequired: false,
      loading: false,
    });
  });

  it("distinguishes an initial server outage from a missing login", async () => {
    configureFetch(vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })));

    await expect(useAuthStore.getState().fetchMe()).resolves.toBe(false);

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      authUnavailable: true,
      reauthRequired: false,
      loading: false,
    });
  });

  it("does not mistake a transient server failure for an expired session", async () => {
    configureFetch(vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })));
    useAuthStore.setState({
      user: existingUser,
      activeOrgId: "org-1",
      loading: false,
    });

    await expect(useAuthStore.getState().fetchMe()).resolves.toBe(false);

    expect(useAuthStore.getState()).toMatchObject({
      user: existingUser,
      activeOrgId: "org-1",
      authUnavailable: true,
      reauthRequired: false,
      loading: false,
    });
  });

  it("clears the reconnect requirement after GitHub restores the session", async () => {
    configureFetch(
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          user: {
            ...existingUser,
            orgMemberships: [
              {
                organizationId: "org-1",
                role: "admin",
                joinedAt: "2026-01-01T00:00:00.000Z",
                organization: { id: "org-1", name: "Trace" },
              },
            ],
          },
        }),
      ),
    );
    useAuthStore.setState({
      user: existingUser,
      activeOrgId: "org-1",
      reauthRequired: true,
      loading: false,
    });

    await expect(useAuthStore.getState().fetchMe()).resolves.toBe(true);

    expect(useAuthStore.getState()).toMatchObject({
      user: existingUser,
      activeOrgId: "org-1",
      authUnavailable: false,
      reauthRequired: false,
      loading: false,
    });
  });
});

describe("isUnauthorizedError", () => {
  it("recognizes HTTP, GraphQL, and WebSocket auth failures", () => {
    expect(isUnauthorizedError({ response: { status: 401 } })).toBe(true);
    expect(
      isUnauthorizedError({
        graphQLErrors: [{ extensions: { code: "UNAUTHENTICATED" } }],
      }),
    ).toBe(true);
    expect(isUnauthorizedError({ code: 4401 })).toBe(true);
    expect(isUnauthorizedError(new Error("network unavailable"))).toBe(false);
  });
});
