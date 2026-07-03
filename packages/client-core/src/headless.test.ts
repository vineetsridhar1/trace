import { describe, expect, it, vi } from "vitest";

// Each react-bound entrypoint throws on import, so this test fails if the
// headless module graph ever reaches react — directly or through urql /
// zustand's react-bound main entry. zustand/vanilla stays importable.
vi.mock("react", () => {
  throw new Error("headless graph imported react");
});
vi.mock("react-dom", () => {
  throw new Error("headless graph imported react-dom");
});
vi.mock("urql", () => {
  throw new Error("headless graph imported urql (react bindings) — use @urql/core");
});
vi.mock("zustand", () => {
  throw new Error("headless graph imported zustand's react entry — use zustand/vanilla");
});
vi.mock("zustand/react/shallow", () => {
  throw new Error("headless graph imported zustand/react/shallow");
});

describe("@trace/client-core/headless", () => {
  it("imports without react and exposes the headless surface", async () => {
    const headless = await import("./headless.js");

    expect(typeof headless.setPlatform).toBe("function");
    expect(typeof headless.getPlatform).toBe("function");
    expect(typeof headless.createGqlClient).toBe("function");
    expect(typeof headless.useEntityStore.getState).toBe("function");
    expect(typeof headless.useEntityStore.subscribe).toBe("function");
    expect(typeof headless.useAuthStore.getState).toBe("function");
    expect(typeof headless.useAuthStore.subscribe).toBe("function");
    expect(typeof headless.getAuthHeaders).toBe("function");
    expect(typeof headless.handleOrgEvent).toBe("function");
    expect(typeof headless.handleSessionEvent).toBe("function");
    expect(typeof headless.routeSessionOutput).toBe("function");
    expect(typeof headless.sessionPatchFromOutput).toBe("function");
    expect(typeof headless.buildSessionNodes).toBe("function");
    expect(typeof headless.eventScopeKey).toBe("function");
    expect(typeof headless.messageScopeKey).toBe("function");
    expect(typeof headless.optimisticallyInsertSessionMessage).toBe("function");
    expect(typeof headless.reconcileOptimisticSessionMessage).toBe("function");
  });

  it("keeps vanilla store access working end to end", async () => {
    const { useEntityStore, eventScopeKey } = await import("./headless.js");

    expect(useEntityStore.getState().sessions).toEqual({});
    expect(eventScopeKey("session", "abc")).toBe("session:abc");
  });
});
