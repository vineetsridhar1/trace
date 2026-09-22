import { afterEach, describe, expect, it, vi } from "vitest";

const { mutation, notify, error } = vi.hoisted(() => ({
  mutation: vi.fn(),
  notify: vi.fn(),
  error: vi.fn(),
}));
vi.mock("./urql", () => ({ client: { mutation } }));
vi.mock("sonner", () => ({ toast: Object.assign(notify, { error, dismiss: vi.fn() }) }));
vi.mock("@trace/client-core", async () => {
  const { create } = await import("zustand");
  return {
    ARCHIVE_SESSION_GROUP_MUTATION: "archive",
    useAuthStore: create(() => ({ user: { id: "user" }, activeOrgId: "org", loading: false })),
    useEntityStore: create((set) => ({
      sessionGroups: {},
      remove: (_type: string, id: string) =>
        set((state: { sessionGroups: Record<string, object> }) => {
          const sessionGroups = { ...state.sessionGroups };
          delete sessionGroups[id];
          return { sessionGroups };
        }),
      upsert: (_type: string, id: string, group: object) =>
        set((state: { sessionGroups: Record<string, object> }) => ({
          sessionGroups: { ...state.sessionGroups, [id]: group },
        })),
    })),
  };
});

import { useAuthStore, useEntityStore } from "@trace/client-core";

import { archiveSessionGroup } from "./archive-session-group";

function options() {
  return notify.mock.lastCall![1];
}

afterEach(() => vi.clearAllMocks());

describe("archiveSessionGroup", () => {
  it("waits for the undo window before archiving", async () => {
    mutation.mockReturnValue({ toPromise: async () => ({}) });
    archiveSessionGroup("archive", "Workspace");
    expect(mutation).not.toHaveBeenCalled();
    expect(options()).toMatchObject({ duration: 8000, action: { label: "Undo" } });
    await options().onAutoClose();
    expect(mutation).toHaveBeenCalledWith("archive", { id: "archive" });
  });

  it("cancels archiving when Undo is selected", async () => {
    const group = { id: "undo", name: "Workspace" };
    useEntityStore.setState({ sessionGroups: { undo: group } });
    archiveSessionGroup("undo", "Workspace");
    expect(useEntityStore.getState().sessionGroups.undo).toBeUndefined();
    const toastOptions = options();
    toastOptions.action.onClick();
    expect(useEntityStore.getState().sessionGroups.undo).toBe(group);
    await toastOptions.onDismiss();
    await toastOptions.onAutoClose();
    expect(mutation).not.toHaveBeenCalled();
  });

  it("archives only once when dismissed and expired", async () => {
    mutation.mockReturnValue({ toPromise: async () => ({}) });
    archiveSessionGroup("dismiss", "Workspace");
    const toastOptions = options();
    await toastOptions.onDismiss();
    await toastOptions.onAutoClose();
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  it.each([{ user: null }, { activeOrgId: "other-org" }, { loading: true }])(
    "cancels pending archives when auth context changes: %j",
    async (change) => {
      const original = useAuthStore.getState();
      archiveSessionGroup("auth-change", "Workspace");
      const toastOptions = options();
      useAuthStore.setState(change);
      useAuthStore.setState(original);
      await toastOptions.onAutoClose();
      await toastOptions.onDismiss();
      expect(mutation).not.toHaveBeenCalled();
      archiveSessionGroup("auth-change", "Workspace");
      expect(notify).toHaveBeenCalledTimes(2);
      options().action.onClick();
    },
  );

  it("does not let a fading cancelled toast clear a new archive", () => {
    archiveSessionGroup("retry-undo", "Workspace");
    const oldOptions = options();
    oldOptions.action.onClick();
    archiveSessionGroup("retry-undo", "Workspace");
    oldOptions.action.onClick();
    archiveSessionGroup("retry-undo", "Workspace");
    expect(notify).toHaveBeenCalledTimes(2);
    options().action.onClick();
  });

  it("keeps the duplicate guard if Undo is clicked while the expired toast exits", async () => {
    let finish!: () => void;
    mutation.mockReturnValue({
      toPromise: () =>
        new Promise<object>((resolve) => {
          finish = () => resolve({});
        }),
    });
    archiveSessionGroup("in-flight", "Workspace");
    const toastOptions = options();
    const request = toastOptions.onAutoClose();
    toastOptions.action.onClick();
    archiveSessionGroup("in-flight", "Workspace");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(mutation).toHaveBeenCalledTimes(1);
    finish();
    await request;
  });

  it("ignores repeat archive clicks during the undo window", () => {
    archiveSessionGroup("repeat", "Workspace");
    archiveSessionGroup("repeat", "Workspace");
    expect(notify).toHaveBeenCalledTimes(1);
    options().action.onClick();
  });

  it.each([
    () => Promise.resolve({ error: { message: "Access denied" } }),
    () => Promise.reject(new Error("Network unavailable")),
  ])("reports failures and permits retry", async (toPromise) => {
    const group = { id: "failure", name: "Workspace" };
    useEntityStore.setState({ sessionGroups: { failure: group } });
    mutation.mockReturnValue({ toPromise });
    archiveSessionGroup("failure", "Workspace");
    expect(useEntityStore.getState().sessionGroups.failure).toBeUndefined();
    await options().onAutoClose();
    expect(useEntityStore.getState().sessionGroups.failure).toBe(group);
    expect(error).toHaveBeenCalledWith("Failed to archive workspace", {
      description: expect.any(String),
    });
    archiveSessionGroup("failure", "Workspace");
    expect(notify).toHaveBeenCalledTimes(2);
    options().action.onClick();
  });
});
