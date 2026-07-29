import { afterEach, describe, expect, it, vi } from "vitest";
import { nextRuntimeLeaseExpiresAt, runtimeHardDeadlineAt } from "./provisioned-runtime-lease.js";

describe("provisioned runtime lease deadlines", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses bounded defaults independent of session state", () => {
    const now = Date.parse("2026-07-29T12:00:00.000Z");

    expect(nextRuntimeLeaseExpiresAt(now)).toBe("2026-07-29T12:05:00.000Z");
    expect(runtimeHardDeadlineAt(now)).toBe("2026-07-30T12:00:00.000Z");
  });

  it("honors valid deployment overrides", () => {
    vi.stubEnv("TRACE_PROVISIONED_RUNTIME_LEASE_DURATION_MS", "60000");
    vi.stubEnv("TRACE_PROVISIONED_RUNTIME_MAX_LIFETIME_MS", "7200000");
    const now = Date.parse("2026-07-29T12:00:00.000Z");

    expect(nextRuntimeLeaseExpiresAt(now)).toBe("2026-07-29T12:01:00.000Z");
    expect(runtimeHardDeadlineAt(now)).toBe("2026-07-29T14:00:00.000Z");
  });

  it("keeps the initial lease alive through a longer startup window", () => {
    const now = Date.parse("2026-07-29T12:00:00.000Z");

    expect(nextRuntimeLeaseExpiresAt(now, 31 * 60 * 1000)).toBe("2026-07-29T12:31:00.000Z");
  });
});
