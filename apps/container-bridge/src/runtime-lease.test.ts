import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeLeaseWatchdog } from "./runtime-lease.js";

describe("RuntimeLeaseWatchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("expires when the renewable control lease is not renewed", () => {
    const onExpired = vi.fn();
    const watchdog = new RuntimeLeaseWatchdog({
      leaseExpiresAt: "2026-07-29T12:05:00.000Z",
      hardDeadlineAt: "2026-07-30T12:00:00.000Z",
      onExpired,
    });

    watchdog.start();
    vi.advanceTimersByTime(5 * 60 * 1000);

    expect(onExpired).toHaveBeenCalledWith("control_lease_expired");
  });

  it("accepts newer leases but never extends the hard deadline", () => {
    const onExpired = vi.fn();
    const watchdog = new RuntimeLeaseWatchdog({
      leaseExpiresAt: "2026-07-29T12:05:00.000Z",
      hardDeadlineAt: "2026-07-29T12:20:00.000Z",
      onExpired,
    });

    watchdog.start();
    expect(watchdog.renew("2026-07-29T13:00:00.000Z")).toBe(true);
    vi.advanceTimersByTime(20 * 60 * 1000);

    expect(onExpired).toHaveBeenCalledWith("hard_deadline_reached");
  });

  it("ignores malformed and older lease renewals", () => {
    const onExpired = vi.fn();
    const watchdog = new RuntimeLeaseWatchdog({
      leaseExpiresAt: "2026-07-29T12:05:00.000Z",
      hardDeadlineAt: "2026-07-30T12:00:00.000Z",
      onExpired,
    });

    watchdog.start();
    expect(watchdog.renew("not-a-date")).toBe(false);
    expect(watchdog.renew("2026-07-29T12:04:00.000Z")).toBe(false);
    vi.advanceTimersByTime(5 * 60 * 1000);

    expect(onExpired).toHaveBeenCalledWith("control_lease_expired");
  });

  it("rejects invalid bootstrap deadlines", () => {
    expect(
      () =>
        new RuntimeLeaseWatchdog({
          leaseExpiresAt: "invalid",
          hardDeadlineAt: "2026-07-30T12:00:00.000Z",
          onExpired: vi.fn(),
        }),
    ).toThrow("TRACE_RUNTIME_LEASE_EXPIRES_AT");
  });
});
