export type RuntimeLeaseExpirationReason = "control_lease_expired" | "hard_deadline_reached";

// Node clamps larger setTimeout values to 1ms. Long configured hard deadlines
// must wake periodically rather than accidentally expiring immediately.
const MAX_TIMER_DELAY_MS = 2_147_000_000;

type RuntimeLeaseWatchdogOptions = {
  leaseExpiresAt: string;
  hardDeadlineAt: string;
  onExpired: (reason: RuntimeLeaseExpirationReason) => void;
  now?: () => number;
};

function parseDeadline(value: string, name: string): number {
  const deadline = Date.parse(value);
  if (!Number.isFinite(deadline)) {
    throw new Error(`${name} must be a valid ISO-8601 timestamp`);
  }
  return deadline;
}

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
  private readonly now: () => number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private expired = false;

  constructor(private readonly options: RuntimeLeaseWatchdogOptions) {
    this.leaseDeadline = parseDeadline(options.leaseExpiresAt, "TRACE_RUNTIME_LEASE_EXPIRES_AT");
    this.hardDeadline = parseDeadline(options.hardDeadlineAt, "TRACE_RUNTIME_HARD_DEADLINE_AT");
    this.now = options.now ?? Date.now;
    if (this.hardDeadline < this.leaseDeadline) {
      this.leaseDeadline = this.hardDeadline;
    }
  }

  start(): void {
    this.schedule();
  }

  renew(expiresAt: string): boolean {
    if (this.expired) return false;
    const requestedDeadline = Date.parse(expiresAt);
    if (!Number.isFinite(requestedDeadline) || requestedDeadline <= this.leaseDeadline) {
      return false;
    }
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
    const deadline = Math.min(this.leaseDeadline, this.hardDeadline);
    const delay = Math.min(MAX_TIMER_DELAY_MS, Math.max(0, deadline - this.now()));
    this.timer = setTimeout(() => this.expireIfDue(), delay);
  }

  private expireIfDue(): void {
    if (this.expired) return;
    const now = this.now();
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
}
