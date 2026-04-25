import { beforeEach, describe, expect, it, vi } from "vitest";

const resetUi = vi.fn();
const recreateClient = vi.fn();
const logout = vi.fn();
const resetEntities = vi.fn();
const unregister = vi.fn();

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

vi.mock("@/lib/notifications", () => ({
  unregister,
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
    unregister.mockReset();
    unregister.mockResolvedValue(undefined);
  });

  it("resets UI state, recreates the client, and logs out", async () => {
    const order: string[] = [];
    resetUi.mockImplementation(() => {
      order.push("reset-ui");
    });
    unregister.mockImplementation(async () => {
      order.push("unregister");
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
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["unregister", "reset-ui", "recreate-client", "logout"]);
  });
});
