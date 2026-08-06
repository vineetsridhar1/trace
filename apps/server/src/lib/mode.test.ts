import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertCloudHostingAllowed,
  isCloudHostingAllowed,
  isLocalCloudEnabled,
  isLocalMode,
} from "./mode.js";

describe("runtime mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps local cloud runtimes disabled by default", () => {
    vi.stubEnv("TRACE_LOCAL_MODE", "1");

    expect(isLocalMode()).toBe(true);
    expect(isLocalCloudEnabled()).toBe(false);
    expect(isCloudHostingAllowed()).toBe(false);
  });

  it("enables cloud hosting only with the explicit local opt-in", () => {
    vi.stubEnv("TRACE_LOCAL_MODE", "1");
    vi.stubEnv("TRACE_LOCAL_CLOUD_ENABLED", "1");

    expect(isLocalCloudEnabled()).toBe(true);
    expect(isCloudHostingAllowed()).toBe(true);
  });

  it("allows cloud hosting outside local mode regardless of the opt-in", () => {
    vi.stubEnv("TRACE_LOCAL_MODE", "");

    expect(isLocalCloudEnabled()).toBe(false);
    expect(isCloudHostingAllowed()).toBe(true);
  });

  it("rejects cloud hosting in local mode without the opt-in", () => {
    vi.stubEnv("TRACE_LOCAL_MODE", "1");

    expect(() => assertCloudHostingAllowed("cloud")).toThrow(
      "Cloud sessions are disabled in local mode",
    );
    expect(() => assertCloudHostingAllowed("local")).not.toThrow();
  });

});
