import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mode = vi.hoisted(() => ({ local: false }));
vi.mock("../lib/runtime-mode", () => ({
  get isLocalMode() {
    return mode.local;
  },
}));

const saved = new Map<string, string>();
beforeEach(() => {
  vi.resetModules();
  saved.clear();
  mode.local = false;
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("session environment preference", () => {
  it("restores the saved Cloud preference after reloading", async () => {
    const first = await import("./session-environment");
    first.useSessionEnvironmentStore.getState().setDefaultEnvironment("cloud");
    vi.resetModules();
    const reloaded = await import("./session-environment");
    expect(reloaded.useSessionEnvironmentStore.getState().defaultEnvironment).toBe("cloud");
  });

  it("keeps the preference usable when storage is unavailable", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const { useSessionEnvironmentStore } = await import("./session-environment");
    expect(() =>
      useSessionEnvironmentStore.getState().setDefaultEnvironment("cloud"),
    ).not.toThrow();
    expect(useSessionEnvironmentStore.getState().defaultEnvironment).toBe("cloud");
  });

  it("forces Local in local-only installations even with a saved Cloud preference", async () => {
    saved.set("trace:default-session-environment", "cloud");
    mode.local = true;
    const { useSessionEnvironmentStore } = await import("./session-environment");
    useSessionEnvironmentStore.getState().setDefaultEnvironment("cloud");
    expect(useSessionEnvironmentStore.getState().defaultEnvironment).toBe("local");
  });
});
