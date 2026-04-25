import { beforeEach, describe, expect, it, vi } from "vitest";

const resetUi = vi.fn();
const recreateClient = vi.fn();
const logout = vi.fn();
const resetEntities = vi.fn();

vi.mock("@trace/client-core", () => ({
  useAuthStore: {
    getState: () => ({
      logout,
    }),
  },
  useEntityStore: {
    getState: () => ({
      reset: resetEntities,
    }),
  },
}));

vi.mock("@/lib/urql", () => ({
  recreateClient,
}));

vi.mock("@/stores/ui", () => ({
  useMobileUIStore: {
    getState: () => ({
      reset: resetUi,
    }),
  },
}));

describe("handleMobileSignOut", () => {
  beforeEach(() => {
    resetUi.mockReset();
    recreateClient.mockReset();
    logout.mockReset();
    resetEntities.mockReset();
  });

  it("resets UI state, recreates the client, and logs out", async () => {
    const order: string[] = [];
    resetUi.mockImplementation(() => {
      order.push("reset-ui");
    });
    recreateClient.mockImplementation(() => {
      order.push("recreate-client");
    });
    logout.mockImplementation(async () => {
      order.push("logout");
    });

    const { handleMobileSignOut } = await import("./auth");

    await handleMobileSignOut();

    expect(resetUi).toHaveBeenCalledTimes(1);
    expect(recreateClient).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["reset-ui", "recreate-client", "logout"]);
  });
});
