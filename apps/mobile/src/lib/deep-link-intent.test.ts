import { describe, expect, it } from "vitest";
import {
  consumePendingDeepLinkPath,
  getPendingDeepLinkPath,
  setPendingDeepLinkPath,
} from "./deep-link-intent";

describe("deep-link intent", () => {
  it("stores and consumes the pending path", () => {
    setPendingDeepLinkPath("/sessions/g1/s1");
    expect(getPendingDeepLinkPath()).toBe("/sessions/g1/s1");
    expect(consumePendingDeepLinkPath()).toBe("/sessions/g1/s1");
    expect(getPendingDeepLinkPath()).toBeNull();
  });
});
