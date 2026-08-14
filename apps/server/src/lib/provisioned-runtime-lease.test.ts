import { afterEach, describe, expect, it, vi } from "vitest";
import { runtimeHardDeadlineAt, runtimeLeaseTtlMs } from "./provisioned-runtime-lease.js";

describe("provisioned runtime lease deadlines", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses bounded defaults independent of session state", () => {
    const now = Date.parse("2026-07-29T12:00:00.000Z");

    expect(runtimeLeaseTtlMs(0, () => 0)).toBe(15 * 60 * 1000);
    expect(runtimeHardDeadlineAt(now)).toBe("2026-07-30T12:00:00.000Z");
  });

  it("honors valid deployment overrides", () => {
    vi.stubEnv("TRACE_PROVISIONED_RUNTIME_LEASE_DURATION_MS", "60000");
    vi.stubEnv("TRACE_PROVISIONED_RUNTIME_MAX_LIFETIME_MS", "7200000");
    const now = Date.parse("2026-07-29T12:00:00.000Z");

    expect(runtimeLeaseTtlMs(0, () => 0)).toBe(60_000);
    expect(runtimeHardDeadlineAt(now)).toBe("2026-07-29T14:00:00.000Z");
  });

  it("keeps the initial lease alive through a longer startup window", () => {
    expect(runtimeLeaseTtlMs(31 * 60 * 1000, () => 0)).toBe(31 * 60 * 1000);
  });

  it("adds bounded positive jitter to spread regional lease expiry", () => {
    expect(runtimeLeaseTtlMs(0, () => 1)).toBe(Math.floor(16.5 * 60 * 1000));
  });
});
