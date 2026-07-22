import { afterEach, describe, expect, it, vi } from "vitest";
import { useUIStore } from "../stores/ui";
import { blockNavigation, registerNavigationBlocker } from "./navigation-blocker";

describe("navigation blocker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("allows navigation when no blocker claims it", () => {
    expect(blockNavigation(vi.fn())).toBe(false);
  });

  it("captures navigation until the blocker continues it", () => {
    const navigate = vi.fn();
    let continuation: (() => void) | null = null;
    const unregister = registerNavigationBlocker((next) => {
      continuation = next;
      return true;
    });

    expect(blockNavigation(navigate)).toBe(true);
    expect(navigate).not.toHaveBeenCalled();

    expect(continuation).not.toBeNull();
    (continuation as unknown as () => void)();
    expect(navigate).toHaveBeenCalledOnce();
    unregister();
    expect(blockNavigation(vi.fn())).toBe(false);
  });

  it("pauses session-group navigation until the continuation runs", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    vi.stubGlobal("history", { pushState: vi.fn(), replaceState: vi.fn() });
    useUIStore.setState({
      activePage: "main",
      activeChannelId: null,
      activeSessionGroupId: "group-1",
      activeSessionId: null,
    });
    let continuation: (() => void) | null = null;
    const unregister = registerNavigationBlocker((next) => {
      continuation = next;
      return true;
    });

    useUIStore.getState().setActiveSessionGroupId("group-2");
    expect(useUIStore.getState().activeSessionGroupId).toBe("group-1");

    unregister();
    expect(continuation).not.toBeNull();
    (continuation as unknown as () => void)();
    expect(useUIStore.getState().activeSessionGroupId).toBe("group-2");
  });
});
