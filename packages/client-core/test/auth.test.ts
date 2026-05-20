import { beforeEach, describe, expect, it, vi } from "vitest";
import { setPlatform } from "../src/platform.js";
import { useAuthStore } from "../src/stores/auth.js";
import { useEntityStore } from "../src/stores/entity.js";

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function authMeResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("auth store", () => {
  beforeEach(() => {
    useEntityStore.getState().reset();
    useAuthStore.setState({
      user: null,
      activeOrgId: null,
      orgMemberships: [],
      loading: false,
      token: null,
    });
  });

  it("ignores stale fetchMe failures after a newer successful refresh", async () => {
    const first = deferredResponse();
    const second = deferredResponse();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const storage = new Map<string, string>();

    setPlatform({
      apiUrl: "http://example.test",
      clientSource: "web",
      authMode: "cookie",
      storage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      secureStorage: {
        getToken: async () => null,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
      fetch: fetchMock,
      createWebSocket: (url: string, protocols?: string[]) => new WebSocket(url, protocols),
    });

    const staleRefresh = useAuthStore.getState().fetchMe();
    const currentRefresh = useAuthStore.getState().fetchMe();

    second.resolve(
      authMeResponse(200, {
        user: {
          id: "user-1",
          email: "user@example.test",
          name: "Jane Developer",
          avatarUrl: null,
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
    );
    await currentRefresh;

    first.resolve(authMeResponse(401, { error: "Not authenticated" }));
    await staleRefresh;

    expect(useAuthStore.getState().user?.id).toBe("user-1");
    expect(useAuthStore.getState().activeOrgId).toBe("org-1");
    expect(useAuthStore.getState().orgMemberships).toHaveLength(1);
  });
});
