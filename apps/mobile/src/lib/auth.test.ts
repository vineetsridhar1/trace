import { beforeEach, describe, expect, it, vi } from "vitest";

const resetUi = vi.fn();
const recreateClient = vi.fn();
const logout = vi.fn();
const resetEntities = vi.fn();
const unregister = vi.fn();
const clearLocalNotificationState = vi.fn();

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
  clearLocalNotificationState,
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
    clearLocalNotificationState.mockReset();
    unregister.mockResolvedValue(undefined);
    clearLocalNotificationState.mockResolvedValue(undefined);
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
    clearLocalNotificationState.mockImplementation(async () => {
      order.push("clear-notifications");
    });

    const { handleMobileSignOut } = await import("./auth");

    await handleMobileSignOut();

    expect(resetUi).toHaveBeenCalledTimes(1);
    expect(recreateClient).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(clearLocalNotificationState).toHaveBeenCalledTimes(1);
    expect(order).toEqual([
      "unregister",
      "reset-ui",
      "recreate-client",
      "logout",
      "clear-notifications",
    ]);
  });

  it("continues sign-out when direct push unregister fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    unregister.mockRejectedValueOnce(new Error("network"));

    const { handleMobileSignOut } = await import("./auth");

    await handleMobileSignOut();

    expect(resetUi).toHaveBeenCalledTimes(1);
    expect(recreateClient).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(clearLocalNotificationState).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
