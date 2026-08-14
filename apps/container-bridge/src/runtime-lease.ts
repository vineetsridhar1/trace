export type RuntimeLeaseExpirationReason = "control_lease_expired" | "hard_deadline_reached";

// Node clamps larger setTimeout values to 1ms. Long configured hard deadlines
// must wake periodically rather than accidentally expiring immediately.
const MAX_TIMER_DELAY_MS = 2_147_000_000;
const MIN_CONTROL_LEASE_TTL_MS = 1_000;
const DEFAULT_HARD_DEADLINE_WARNING_MS = 60 * 60 * 1000;

type RuntimeLeaseWatchdogOptions = {
  leaseTtlMs: number;
  hardDeadlineTtlMs: number;
  onExpired: (reason: RuntimeLeaseExpirationReason) => void;
  onHardDeadlineApproaching?: (remainingMs: number) => void;
  hardDeadlineWarningMs?: number;
  monotonicNow?: () => number;
};

/**
 * Fail-safe lifetime boundary for a provisioned runtime.
 *
 * The renewable control lease proves that an authenticated Trace server still
 * recognizes this runtime. The hard deadline is never renewable, so no bug in
 * session state or cleanup scheduling can keep provider compute alive forever.
 */
export class RuntimeLeaseWatchdog {
  private leaseDeadline: number;
  private readonly hardDeadline: number;
  private readonly hardDeadlineWarningAt: number;
  private readonly monotonicNow: () => number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private expired = false;
  private hardDeadlineWarningSent = false;

  constructor(private readonly options: RuntimeLeaseWatchdogOptions) {
    const leaseTtlMs = this.validateLeaseTtl(options.leaseTtlMs);
    const hardDeadlineTtlMs = this.validateHardDeadlineTtl(options.hardDeadlineTtlMs);
    this.monotonicNow = options.monotonicNow ?? (() => performance.now());
    const monotonicStartedAt = this.monotonicNow();
    this.hardDeadline = monotonicStartedAt + hardDeadlineTtlMs;
    this.leaseDeadline = Math.min(monotonicStartedAt + leaseTtlMs, this.hardDeadline);
    const warningMs = Math.max(
      0,
      options.hardDeadlineWarningMs ?? DEFAULT_HARD_DEADLINE_WARNING_MS,
    );
    this.hardDeadlineWarningAt = Math.max(monotonicStartedAt, this.hardDeadline - warningMs);
  }

  start(): void {
    this.schedule();
  }

  renew(ttlMs: number): boolean {
    if (this.expired) return false;
    if (!Number.isFinite(ttlMs) || ttlMs < MIN_CONTROL_LEASE_TTL_MS) return false;
    const requestedDeadline = this.monotonicNow() + Math.floor(ttlMs);
    this.leaseDeadline = Math.min(requestedDeadline, this.hardDeadline);
    this.schedule();
    return true;
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    this.stop();
    if (this.expired) return;
    const warningDeadline = this.hardDeadlineWarningSent
      ? Number.POSITIVE_INFINITY
      : this.hardDeadlineWarningAt;
    const deadline = Math.min(this.leaseDeadline, this.hardDeadline, warningDeadline);
    const delay = Math.min(MAX_TIMER_DELAY_MS, Math.max(0, deadline - this.monotonicNow()));
    this.timer = setTimeout(() => this.expireIfDue(), delay);
  }

  private expireIfDue(): void {
    if (this.expired) return;
    const now = this.monotonicNow();
    if (!this.hardDeadlineWarningSent && now >= this.hardDeadlineWarningAt) {
      this.hardDeadlineWarningSent = true;
      this.options.onHardDeadlineApproaching?.(Math.max(0, this.hardDeadline - now));
    }
    if (now < this.leaseDeadline && now < this.hardDeadline) {
      this.schedule();
      return;
    }
    this.expired = true;
    this.timer = null;
    this.options.onExpired(
      now >= this.hardDeadline ? "hard_deadline_reached" : "control_lease_expired",
    );
  }

  private validateLeaseTtl(ttlMs: number): number {
    if (!Number.isFinite(ttlMs) || ttlMs < MIN_CONTROL_LEASE_TTL_MS) {
      throw new Error(`TRACE_RUNTIME_LEASE_TTL_MS must be at least ${MIN_CONTROL_LEASE_TTL_MS}`);
    }
    return Math.floor(ttlMs);
  }

  private validateHardDeadlineTtl(ttlMs: number): number {
    if (!Number.isFinite(ttlMs) || ttlMs < MIN_CONTROL_LEASE_TTL_MS) {
      throw new Error(
        `TRACE_RUNTIME_HARD_DEADLINE_TTL_MS must be at least ${MIN_CONTROL_LEASE_TTL_MS}`,
      );
    }
    return Math.floor(ttlMs);
  }
}
