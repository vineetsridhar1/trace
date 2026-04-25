import { afterEach, describe, expect, it } from "vitest";
import {
  buildFallbackBridgeAccess,
  bridgeAccessStoreKey,
  useBridgeAccessStore,
} from "./bridge-access";

describe("bridgeAccessStoreKey", () => {
  it("returns null without a runtime id", () => {
    expect(bridgeAccessStoreKey()).toBeNull();
  });

  it("keys entries by runtime and workspace", () => {
    expect(bridgeAccessStoreKey("runtime-1", "group-1")).toBe("runtime-1::group-1");
    expect(bridgeAccessStoreKey("runtime-1", null)).toBe("runtime-1::");
  });
});

describe("buildFallbackBridgeAccess", () => {
  it("allows cloud runtimes by default", () => {
    expect(buildFallbackBridgeAccess("cloud-machine-123")).toMatchObject({
      hostingMode: "cloud",
      allowed: true,
      isOwner: true,
      capabilities: ["session", "terminal"],
    });
  });

  it("locks local runtimes until access is known", () => {
    expect(buildFallbackBridgeAccess("bridge-local-123")).toMatchObject({
      hostingMode: "local",
      allowed: false,
      isOwner: false,
      capabilities: [],
    });
  });
});

describe("useBridgeAccessStore", () => {
  afterEach(() => {
    useBridgeAccessStore.setState({ entries: {} });
  });

  it("sets and clears entries", () => {
    useBridgeAccessStore.getState().setEntry("runtime-1::group-1", {
      access: buildFallbackBridgeAccess("bridge-local-123"),
      loadState: "loaded",
    });

    expect(useBridgeAccessStore.getState().entries["runtime-1::group-1"]?.loadState).toBe("loaded");

    useBridgeAccessStore.getState().clearEntry("runtime-1::group-1");

    expect(useBridgeAccessStore.getState().entries["runtime-1::group-1"]).toBeUndefined();
  });
});
