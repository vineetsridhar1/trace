import { describe, expect, it } from "vitest";
import {
  getRuntimeLifecycleState,
  isRuntimeLifecycleFailureState,
} from "./sessionRuntimeLifecycle";

describe("session runtime lifecycle", () => {
  it("routes cloud disconnected sessions to the cloud recovery notice", () => {
    expect(
      getRuntimeLifecycleState({
        hosting: "cloud",
        connectionState: "disconnected",
        groupConnectionState: null,
      }),
    ).toBe("disconnected");
    expect(isRuntimeLifecycleFailureState("disconnected")).toBe(true);
  });

  it("does not show a per-session startup notice when the shared cloud runtime is connected", () => {
    expect(
      getRuntimeLifecycleState({
        hosting: "cloud",
        connectionState: "connecting",
        groupConnectionState: "connected",
      }),
    ).toBeNull();
  });

  it("leaves local disconnected sessions on the generic recovery path", () => {
    expect(
      getRuntimeLifecycleState({
        hosting: "local",
        connectionState: "disconnected",
        groupConnectionState: null,
      }),
    ).toBeNull();
  });
});
