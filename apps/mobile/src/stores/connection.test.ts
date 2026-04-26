import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "./connection";

describe("connection store", () => {
  beforeEach(() => {
    useConnectionStore.setState({
      connected: false,
      disconnectedAt: null,
      reconnectCounter: 0,
      hasConnectedBefore: false,
    });
  });

  it("does not mark the app stale before the first successful socket connection", () => {
    useConnectionStore.getState().setConnected(false);
    expect(useConnectionStore.getState().disconnectedAt).toBeNull();
  });

  it("records disconnect and increments reconnects after recovery", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    useConnectionStore.getState().setConnected(true);
    useConnectionStore.getState().setConnected(false);
    expect(useConnectionStore.getState().disconnectedAt).toBe(1234);

    useConnectionStore.getState().setConnected(true);
    expect(useConnectionStore.getState().disconnectedAt).toBeNull();
    expect(useConnectionStore.getState().reconnectCounter).toBe(1);
    vi.restoreAllMocks();
  });
});
