import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeLeaseWatchdog } from "./runtime-lease.js";

describe("RuntimeLeaseWatchdog", () => {
  let monotonicNow = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    monotonicNow = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function advance(ms: number): void {
    monotonicNow += ms;
    vi.advanceTimersByTime(ms);
  }

  function createWatchdog(
    overrides: Partial<ConstructorParameters<typeof RuntimeLeaseWatchdog>[0]> = {},
  ) {
    return new RuntimeLeaseWatchdog({
      leaseTtlMs: 5 * 60 * 1000,
      hardDeadlineTtlMs: 24 * 60 * 60 * 1000,
      onExpired: vi.fn(),
      monotonicNow: () => monotonicNow,
      ...overrides,
    });
  }

  it("expires when the renewable control lease is not renewed", () => {
    const onExpired = vi.fn();
    const watchdog = createWatchdog({ onExpired });

    watchdog.start();
    advance(5 * 60 * 1000);

    expect(onExpired).toHaveBeenCalledWith("control_lease_expired");
  });

  it("renews from the local monotonic clock", () => {
    const onExpired = vi.fn();
    const watchdog = createWatchdog({ onExpired });

    watchdog.start();
    advance(4 * 60 * 1000);
    expect(watchdog.renew(5 * 60 * 1000)).toBe(true);
    advance(4 * 60 * 1000);
    expect(onExpired).not.toHaveBeenCalled();
    advance(60 * 1000);

    expect(onExpired).toHaveBeenCalledWith("control_lease_expired");
  });

  it("never extends the non-renewable hard deadline", () => {
    const onExpired = vi.fn();
    const watchdog = createWatchdog({
      hardDeadlineTtlMs: 20 * 60 * 1000,
      onExpired,
    });

    watchdog.start();
    advance(4 * 60 * 1000);
    expect(watchdog.renew(60 * 60 * 1000)).toBe(true);
    advance(16 * 60 * 1000);

    expect(onExpired).toHaveBeenCalledWith("hard_deadline_reached");
  });

  it("warns before the hard deadline exactly once", () => {
    const onHardDeadlineApproaching = vi.fn();
    const watchdog = createWatchdog({
      leaseTtlMs: 30 * 60 * 1000,
      hardDeadlineTtlMs: 20 * 60 * 1000,
      hardDeadlineWarningMs: 5 * 60 * 1000,
      onHardDeadlineApproaching,
    });

    watchdog.start();
    advance(15 * 60 * 1000);
    expect(onHardDeadlineApproaching).toHaveBeenCalledOnce();
    expect(onHardDeadlineApproaching).toHaveBeenCalledWith(5 * 60 * 1000);
    expect(watchdog.renew(30 * 60 * 1000)).toBe(true);
    advance(4 * 60 * 1000);
    expect(onHardDeadlineApproaching).toHaveBeenCalledOnce();
  });

  it("rejects invalid lease durations and bootstrap deadlines", () => {
    const watchdog = createWatchdog();
    expect(watchdog.renew(Number.NaN)).toBe(false);
    expect(watchdog.renew(999)).toBe(false);
    expect(() =>
      createWatchdog({
        leaseTtlMs: 999,
      }),
    ).toThrow("TRACE_RUNTIME_LEASE_TTL_MS");
    expect(() =>
      createWatchdog({
        hardDeadlineTtlMs: 999,
      }),
    ).toThrow("TRACE_RUNTIME_HARD_DEADLINE_TTL_MS");
  });
});
