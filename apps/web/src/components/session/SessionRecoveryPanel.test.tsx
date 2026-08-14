import { describe, expect, it } from "vitest";
import type { BridgeRuntimeAccessInfo } from "./useBridgeRuntimeAccess";
import { shouldRetryOwnedLocalBridgeOnOpen } from "./SessionRecoveryPanel";

function bridgeAccess(
  overrides: Partial<BridgeRuntimeAccessInfo> = {},
): BridgeRuntimeAccessInfo {
  return {
    runtimeInstanceId: "runtime-1",
    hostingMode: "local",
    connected: false,
    allowed: true,
    isOwner: true,
    ...overrides,
  };
}

describe("shouldRetryOwnedLocalBridgeOnOpen", () => {
  it("retries an owned local bridge when retry is available", () => {
    expect(shouldRetryOwnedLocalBridgeOnOpen(true, bridgeAccess())).toBe(true);
  });

  it("does not retry a local bridge that the user only has access to", () => {
    expect(
      shouldRetryOwnedLocalBridgeOnOpen(true, bridgeAccess({ allowed: true, isOwner: false })),
    ).toBe(false);
  });

  it("does not retry cloud runtimes or non-retryable connections", () => {
    expect(
      shouldRetryOwnedLocalBridgeOnOpen(true, bridgeAccess({ hostingMode: "cloud" })),
    ).toBe(false);
    expect(shouldRetryOwnedLocalBridgeOnOpen(false, bridgeAccess())).toBe(false);
  });
});
