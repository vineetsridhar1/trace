import { beforeEach, describe, expect, it } from "vitest";
import { useAuthReconnectStore } from "./auth-reconnect";

beforeEach(() => {
  useAuthReconnectStore.getState().reset();
});

describe("auth reconnect UI state", () => {
  it("collapses the reminder without opening the dialog", () => {
    useAuthReconnectStore.getState().collapseReminder();

    expect(useAuthReconnectStore.getState()).toMatchObject({
      dialogOpen: false,
      reminderCollapsed: true,
    });
  });

  it("can open reconnect from the collapsed reminder and reset after success", () => {
    useAuthReconnectStore.getState().collapseReminder();
    useAuthReconnectStore.getState().openDialog();

    expect(useAuthReconnectStore.getState().dialogOpen).toBe(true);

    useAuthReconnectStore.getState().reset();
    expect(useAuthReconnectStore.getState()).toMatchObject({
      dialogOpen: false,
      reminderCollapsed: false,
    });
  });
});
